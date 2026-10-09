-- Two-way reviews, hardened (see src/lib/reviewEligibilityServer.ts and
-- src/lib/reviewServer.ts).
--
-- 1. Record which side of the lease the reviewee was on, so a profile can show
--    "as a landlord" and "as a tenant" ratings separately — a renter vetting a
--    landlord cares what past tenants said, not how that person behaved when
--    they rented somewhere themselves.
alter table reviews add column if not exists to_role text
  check (to_role in ('tenant', 'landlord'));

-- Backfill existing reviews from the lease's recorded parties.
update reviews r
set to_role = case when lower(r.to_email) = lower(m.landlord_email) then 'landlord' else 'tenant' end
from lease_metadata m
where m.lease_id = r.lease_id
  and r.to_role is null;

create index if not exists reviews_lease_id_idx on reviews (lease_id);

-- 2. Reviews are double-blind: hidden until both parties have reviewed the
--    lease, or 14 days pass. That rule is applied by the API, so the table must
--    not be readable directly with the public anon key (which would expose
--    hidden reviews) — authors may read only their own rows; everyone else
--    reads through /api/reviews.
drop policy if exists "reviews_read_all" on reviews;
create policy "reviews_author_read" on reviews
  for select using (from_email = auth.jwt() ->> 'email');

-- 3. Writes must go through POST /api/reviews, which verifies the reviewer is
--    the genuine on-chain counterparty of a lease with rent released. A direct
--    insert policy let any signed-in user skip that check.
drop policy if exists "reviews_author_write" on reviews;

-- Landlord & property verification (see src/lib/verificationServer.ts).
--
-- Fake landlords are the main scam risk on a rental platform, so publishing a
-- listing now takes two reviews by the RentPact team (REVIEWER_EMAILS):
--   1. the landlord, once — who they are (ID, phone, video call; agents also
--      their LASRERA certificate), and
--   2. every property — that they own it or are authorised to let it (C of O /
--      Governor's Consent / registered Deed of Assignment, a bill for that
--      address, a live video walk-through).
-- Listings published before this migration stay visible, labelled "Not yet
-- verified".

-- 1. Landlord applications — one per account. Written only through the API
--    (service role); RLS on with no policies, so nobody can read or approve
--    them directly with the public anon key.
create table if not exists landlord_verifications (
  email text primary key references profiles(email),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'revoked')),
  full_name text not null,
  phone text not null,
  role text not null check (role in ('owner', 'agent')),
  id_type text not null,
  lasrera_number text,
  -- [{ "kind": "id" | "lasrera" | ..., "path": "<storage path>", "name": "<file name>" }]
  documents jsonb not null default '[]',
  submitted_at bigint not null,
  reviewed_by text,
  reviewed_at bigint,
  -- Shown to the landlord when an application is rejected or revoked.
  review_note text,
  -- What the reviewer confirmed, e.g. { "idMatches": true, "videoCall": true }
  checks jsonb not null default '{}'
);
alter table landlord_verifications enable row level security;

-- 2. Each property's review. Public-safe state lives on listings; the
--    documents and reviewer notes live in listing_verifications, which only
--    the API can read.
alter table listings add column if not exists verification_status text not null default 'unverified'
  check (verification_status in ('unverified', 'pending', 'approved', 'rejected'));
alter table listings add column if not exists verified_at bigint;
-- Which tenant's deposit claimed the listing, so only they can release the claim.
alter table listings add column if not exists reserved_by text;

create table if not exists listing_verifications (
  listing_id text primary key references listings(id),
  landlord_email text not null,
  title_document_type text,
  documents jsonb not null default '[]',
  submitted_at bigint not null,
  reviewed_by text,
  reviewed_at bigint,
  review_note text,
  checks jsonb not null default '{}'
);
alter table listing_verifications enable row level security;

-- 3. "Report this listing" from tenants.
create table if not exists listing_reports (
  id text primary key,
  listing_id text not null references listings(id),
  reporter_email text not null,
  reason text not null,
  created_at bigint not null,
  resolved_at bigint,
  resolved_by text,
  resolution text
);
alter table listing_reports enable row level security;

-- 4. Listings are written only through /api/listings, which checks the
--    signed-in user, their wallet and their verification. The old direct-write
--    policies would let a landlord mark their own listing "approved"; the API
--    uses the service role, so dropping them changes nothing else.
drop policy if exists "listings_owner_write" on listings;
drop policy if exists "listings_owner_update" on listings;
drop policy if exists "listings_read_active" on listings;
create policy "listings_read_public" on listings
  for select using (
    (active and verification_status in ('approved', 'unverified'))
    or landlord_email = auth.jwt() ->> 'email'
  );

-- 5. Private bucket for ID and ownership documents (images or PDF, ≤10 MB).
--    A signed-in user may upload only into their own folder (named by their
--    auth user id); nobody can read files back through the public API — the
--    review page opens them with short-lived signed links from the server.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'verification-docs',
  'verification-docs',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;

drop policy if exists "verification_docs_owner_upload" on storage.objects;
create policy "verification_docs_owner_upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'verification-docs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

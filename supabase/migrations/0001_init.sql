-- RentPact — initial schema migration
--
-- Replaces the 12 flat-file JSON stores under .data/ with Postgres tables.
-- Lease lifecycle data itself is explicitly NOT here — it's sourced from the
-- deployed RentPactEscrow contract (or localStorage in mock mode); see
-- src/lib/leaseData.ts.
--
-- All application reads/writes go through *Server.ts files using the
-- service-role key (server-only, bypasses RLS) — the real authorization
-- boundary is the Next.js API route layer, which checks the caller's verified
-- Supabase session before acting on a given email's data. RLS is enabled here
-- as defense-in-depth in case anything ever queries these tables directly
-- with a user's own JWT.

create table profiles (
  email text primary key,
  auth_user_id uuid references auth.users(id),
  name text,
  photo_url text,
  member_since bigint not null
);

create table listings (
  id text primary key,
  landlord_email text not null references profiles(email),
  landlord_address text,
  property_address text not null,
  property_type text not null,
  photo_url text,
  amount_per_period numeric not null,
  total_periods int not null,
  frequency text not null,
  created_at bigint not null,
  active boolean not null default true,
  condition jsonb,
  amenities text[] not null default '{}',
  security_deposit numeric,
  house_rules text not null default '',
  notice_period_days int
);
create index listings_landlord_email_idx on listings (landlord_email);
create index listings_active_created_at_idx on listings (active, created_at desc);

create table messages (
  id text primary key,
  lease_id text,
  listing_id text references listings(id),
  from_email text not null,
  to_email text not null,
  type text not null,
  text text not null,
  created_at bigint not null,
  read_at bigint,
  maintenance jsonb
);
create index messages_lease_id_idx on messages (lease_id);
create index messages_participants_idx on messages (from_email, to_email);
create index messages_listing_no_lease_idx on messages (listing_id) where lease_id is null;

create table notification_prefs (
  email text primary key references profiles(email),
  money boolean not null default true,
  lease boolean not null default true,
  maintenance boolean not null default true,
  dispute boolean not null default true,
  messages boolean not null default true
);

create table notification_reads (
  email text not null,
  notification_id text not null,
  read_at bigint not null,
  primary key (email, notification_id)
);

create table reviews (
  id text primary key,
  lease_id text not null,
  from_email text not null,
  to_email text not null,
  rating int not null,
  comment text not null,
  created_at bigint not null
);
create index reviews_to_email_created_at_idx on reviews (to_email, created_at desc);
create unique index reviews_lease_from_unique_idx on reviews (lease_id, from_email);

create table privacy_prefs (
  email text primary key references profiles(email),
  show_reputation boolean not null default true,
  show_rental_history boolean not null default true,
  show_reviews boolean not null default true
);

create table templates (
  id text primary key,
  landlord_email text not null references profiles(email),
  name text not null,
  property_type text not null,
  amenities text[] not null default '{}',
  amount_per_period numeric not null,
  total_periods int not null,
  frequency text not null,
  security_deposit numeric,
  house_rules text not null default '',
  notice_period_days int,
  maintenance_landlord text not null default '',
  maintenance_tenant text not null default '',
  created_at bigint not null
);
create index templates_landlord_email_created_at_idx on templates (landlord_email, created_at desc);

create table lease_listing_links (
  lease_id text primary key,
  listing_id text not null references listings(id)
);

create table lease_constitutions (
  lease_id text primary key,
  version text not null,
  hash text not null,
  accepted_at bigint not null
);

create table dispute_rulings (
  lease_id text not null,
  resolved_at bigint not null,
  reasoning text not null,
  hash text not null,
  primary key (lease_id, resolved_at)
);

create table move_out_conditions (
  lease_id text primary key,
  submitted_by text not null,
  notes text not null,
  photos jsonb not null default '[]',
  declared_at bigint not null,
  hash text not null
);

-- ── Row Level Security (defense-in-depth; primary enforcement is the API layer) ──

alter table profiles enable row level security;
alter table listings enable row level security;
alter table messages enable row level security;
alter table notification_prefs enable row level security;
alter table notification_reads enable row level security;
alter table reviews enable row level security;
alter table privacy_prefs enable row level security;
alter table templates enable row level security;
alter table lease_listing_links enable row level security;
alter table lease_constitutions enable row level security;
alter table dispute_rulings enable row level security;
alter table move_out_conditions enable row level security;

-- Own profile: readable/writable by the matching authenticated email.
create policy "profiles_self" on profiles
  for all using (email = auth.jwt() ->> 'email')
  with check (email = auth.jwt() ->> 'email');

-- Listings: anyone authenticated can read active listings; only the owning
-- landlord can read/write their own (including inactive) listings.
create policy "listings_read_active" on listings
  for select using (active or landlord_email = auth.jwt() ->> 'email');
create policy "listings_owner_write" on listings
  for insert with check (landlord_email = auth.jwt() ->> 'email');
create policy "listings_owner_update" on listings
  for update using (landlord_email = auth.jwt() ->> 'email');

-- Messages: only the two participants in a thread can see/write it.
create policy "messages_participants" on messages
  for all using (
    from_email = auth.jwt() ->> 'email' or to_email = auth.jwt() ->> 'email'
  )
  with check (
    from_email = auth.jwt() ->> 'email' or to_email = auth.jwt() ->> 'email'
  );

create policy "notification_prefs_self" on notification_prefs
  for all using (email = auth.jwt() ->> 'email')
  with check (email = auth.jwt() ->> 'email');

create policy "notification_reads_self" on notification_reads
  for all using (email = auth.jwt() ->> 'email')
  with check (email = auth.jwt() ->> 'email');

-- Reviews: publicly readable (reputation is meant to be visible); only the
-- author can write their own review.
create policy "reviews_read_all" on reviews for select using (true);
create policy "reviews_author_write" on reviews
  for insert with check (from_email = auth.jwt() ->> 'email');

create policy "privacy_prefs_self" on privacy_prefs
  for all using (email = auth.jwt() ->> 'email')
  with check (email = auth.jwt() ->> 'email');

create policy "templates_owner" on templates
  for all using (landlord_email = auth.jwt() ->> 'email')
  with check (landlord_email = auth.jwt() ->> 'email');

-- Lease-scoped tables (lease_listing_links, lease_constitutions,
-- dispute_rulings, move_out_conditions): leaseId ties back to on-chain lease
-- state, not a Postgres table, so there's no local FK to check participants
-- against. Leave these service-role-only (no policy = no access for
-- anon/authenticated roles); the API layer verifies lease participancy via
-- on-chain reads before calling into these stores.

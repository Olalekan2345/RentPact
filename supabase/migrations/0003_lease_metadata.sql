-- RentPactEscrow.sol has no concept of a property address, photo, or email —
-- only wallet addresses and USDC amounts. This table holds that display
-- metadata, keyed by the real on-chain leaseId. Previously this lived in
-- localStorage (src/lib/leaseMetadataStore.ts), populated only on whichever
-- browser created or signed the lease — which meant the *other* party (e.g.
-- a landlord who never opened the app on the device the tenant used) saw a
-- raw wallet address instead of an email, and worse, the landlord/tenant
-- role check (`landlordEmail === session.email`) silently failed, hiding the
-- "Review and sign" action entirely. Moving it here fixes both.

create table lease_metadata (
  lease_id text primary key,
  property_address text not null,
  property_type text not null,
  photo_url text,
  tenant_email text not null,
  landlord_email text not null
);

alter table lease_metadata enable row level security;

create policy "lease_metadata_participants" on lease_metadata
  for all using (
    tenant_email = auth.jwt() ->> 'email' or landlord_email = auth.jwt() ->> 'email'
  )
  with check (
    tenant_email = auth.jwt() ->> 'email' or landlord_email = auth.jwt() ->> 'email'
  );

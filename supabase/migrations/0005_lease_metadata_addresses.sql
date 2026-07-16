-- Adds an address-based index to lease_metadata so "which leases is this
-- wallet part of" is a fast database lookup instead of scanning the
-- blockchain's entire event history on every dashboard visit (a brand-new
-- wallet previously paid ~76 sequential RPC calls just to learn it has zero
-- leases). The chain stays the source of truth for each lease's financial
-- state; this only accelerates discovering which lease IDs to read.
--
-- Nullable because rows created before this migration won't have addresses
-- until scripts/backfill-lease-addresses.mjs runs once.

alter table lease_metadata add column tenant_address text;
alter table lease_metadata add column landlord_address text;

create index lease_metadata_tenant_address_idx on lease_metadata (tenant_address);
create index lease_metadata_landlord_address_idx on lease_metadata (landlord_address);

-- Fast path for the activity feed / transaction history (dashboard bell,
-- wallet transactions, wallet earnings). Previously every load re-scanned
-- ten different contract event types from the deploy block on every
-- visit — the most expensive read path in the app. Events are recorded here
-- the moment the app itself causes them (leaseData.ts), so history reads
-- become an indexed Postgres query instead of a blockchain scan. The chain
-- remains the source of truth for actual balances/state; this only
-- accelerates *displaying* what already happened.
--
-- id matches the format the old chain-scan used (`${txHash}-${type}`) so a
-- user's existing notification read-state (keyed by this id, see
-- notification_reads) carries over cleanly across the migration.
--
-- lease_id (not an address) is the filter key; "which of my leases produced
-- this event" is resolved by joining against lease_metadata's
-- tenant_address/landlord_address at query time, so this table doesn't need
-- to duplicate address data.

create table activity_events (
  id text primary key,
  lease_id text not null,
  type text not null,
  timestamp bigint not null,
  amount numeric,
  tx_hash text
);

create index activity_events_lease_id_idx on activity_events (lease_id);
create index activity_events_timestamp_idx on activity_events (timestamp desc);

-- Defense-in-depth, same as every other table — primary enforcement is the
-- API layer (activityEventServer.ts uses the service-role key, which
-- bypasses RLS regardless).
alter table activity_events enable row level security;

-- Direct wallet-to-wallet USDC transfers ("Transfer out" on the Wallet Overview
-- tab) — the one kind of money movement not already covered by the lease
-- activity feed (deposits/releases/refunds/cancellations), which is derived
-- from on-chain lease events and knows nothing about a raw wallet transfer.

create table wallet_transfers (
  id text primary key,
  email text not null,
  to_address text not null,
  amount numeric not null,
  tx_hash text not null,
  created_at bigint not null
);
create index wallet_transfers_email_created_at_idx on wallet_transfers (email, created_at desc);

alter table wallet_transfers enable row level security;

create policy "wallet_transfers_self" on wallet_transfers
  for all using (email = auth.jwt() ->> 'email')
  with check (email = auth.jwt() ->> 'email');

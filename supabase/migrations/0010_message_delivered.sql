-- Delivery receipts. delivered_at is set on a message once the recipient's
-- app has fetched it (their notification poll or inbox load) but before they
-- open the conversation, which sets read_at. Powers the WhatsApp-style ticks:
-- ✓ sent (neither), ✓✓ grey delivered (delivered_at), ✓✓ blue seen (read_at).

alter table messages
  add column if not exists delivered_at bigint;

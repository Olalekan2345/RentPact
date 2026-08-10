-- Lets a tenant request a repair credit of a specific amount (Article 4.6)
-- through the message thread, with a note and a receipt attached. The amount
-- rides on the message so the landlord can approve it in one click on-chain.
-- Null on every other message.

alter table messages
  add column if not exists repair_credit_amount numeric;

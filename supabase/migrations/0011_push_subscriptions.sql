-- Web Push subscriptions, one row per device/browser a user has opted in on.
-- endpoint is the browser's push endpoint (unique); p256dh + auth are the
-- subscription's encryption keys. We look up all of a user's rows by email to
-- push them, and prune rows the push service reports as gone (404/410).

create table if not exists push_subscriptions (
  endpoint text primary key,
  email text not null,
  p256dh text not null,
  auth text not null,
  created_at bigint not null
);

create index if not exists push_subscriptions_email_idx on push_subscriptions (email);

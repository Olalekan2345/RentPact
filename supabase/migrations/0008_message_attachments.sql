-- Media/file attachments on messages. A message can now carry any number of
-- attachments (images, video, documents) alongside — or instead of — its text.
-- Each attachment is { url, name, contentType, kind } where kind is
-- 'image' | 'video' | 'file'. Files themselves live in the existing "photos"
-- Storage bucket; this column only stores their public URLs and metadata.

alter table messages
  add column if not exists attachments jsonb not null default '[]'::jsonb;

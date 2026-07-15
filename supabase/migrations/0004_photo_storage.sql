-- Photos/videos move from base64 blobs inside table rows to Supabase Storage.
-- The old approach made API payloads enormous (a single listings fetch was
-- ~4MB for two rows) since every response carried full images as text.
-- Rows now store small public URLs; files are served as real cacheable
-- assets from the storage CDN.

-- Public bucket: anyone can view via the public object URL (listing photos
-- are public-facing by nature), but only authenticated users can upload.
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

create policy "photos_authenticated_upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos');

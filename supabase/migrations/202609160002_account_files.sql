-- Private binary storage; metadata uses version-checked workspace documents.
insert into storage.buckets(id, name, public, file_size_limit)
values ('workspace-files', 'workspace-files', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;
create policy workspace_files_read on storage.objects for select to authenticated
using (bucket_id = 'workspace-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy workspace_files_insert on storage.objects for insert to authenticated
with check (bucket_id = 'workspace-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

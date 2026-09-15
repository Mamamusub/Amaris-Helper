-- Extend existing version-checked workspace records to all app sections.
alter table public.workspace_records drop constraint workspace_records_kind_check;
alter table public.workspace_records add constraint workspace_records_kind_check check (kind in ('subject','task','thread','run','document'));
create or replace function public.workspace_apply(operation_id uuid, changes jsonb, importing boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  item jsonb;
  old_version bigint;
  old_body jsonb;
  fingerprint text := md5(changes::text || importing::text);
  prior text;
  record_id text;
  record_kind text;
  body jsonb;
begin
  if owner_id is null then raise exception 'unauthorized' using errcode = '42501'; end if;
  if operation_id is null or jsonb_typeof(changes) <> 'array' or jsonb_array_length(changes) > 5000 or octet_length(changes::text) > 8000000 then
    raise exception 'invalid batch' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  select digest into prior from public.workspace_operations where user_id = owner_id and id = operation_id;
  if found then
    if prior <> fingerprint then raise exception 'operation reused' using errcode = '22023'; end if;
    return public.workspace_snapshot();
  end if;
  for item in select value from jsonb_array_elements(changes) loop
    record_id := item->>'id'; record_kind := item->>'kind'; body := item->'data';
    if body->>'id' is distinct from record_id or record_kind not in ('task','subject','thread','run','document') then
      raise exception 'invalid record' using errcode = '22023';
    end if;
    select version, data into old_version, old_body from public.workspace_records where user_id = owner_id and kind = record_kind and id = record_id;
    if importing and found then continue; end if;
    -- Two devices may finish the same countdown at the same instant.
    if found and old_body = body then continue; end if;
    if coalesce(old_version,0) <> (item->>'version')::bigint or item->>'version' is null then
      raise exception 'version conflict' using errcode = '40001';
    end if;
    insert into public.workspace_records(user_id,kind,id,data,version,subject_id,parent_id)
    values(owner_id,record_kind,record_id,body,coalesce(old_version,0)+1,nullif(body->>'subjectId',''),nullif(body->>'parentTaskId',''))
    on conflict(user_id,kind,id) do update set data = excluded.data, version = excluded.version,
      subject_id = excluded.subject_id, parent_id = excluded.parent_id, updated_at = now();
  end loop;
  -- Deferred composite FKs prove referenced records belong to this same owner.
  set constraints all immediate;
  insert into public.workspace_operations(user_id,id,digest) values(owner_id,operation_id,fingerprint);
  return public.workspace_snapshot();
end $$;
revoke all on function public.workspace_snapshot(), public.workspace_apply(uuid,jsonb,boolean) from public, anon;
grant execute on function public.workspace_snapshot(), public.workspace_apply(uuid,jsonb,boolean) to authenticated;

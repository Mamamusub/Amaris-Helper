-- Apply manually to a development Supabase project first. Never auto-run at build.
create table public.workspace_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('subject','task','thread','run')),
  id text not null check (length(id) between 1 and 200),
  data jsonb not null check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 4000000),
  version bigint not null default 1 check (version > 0),
  subject_id text,
  subject_kind text not null default 'subject' check (subject_kind = 'subject'),
  parent_id text,
  parent_kind text not null default 'task' check (parent_kind = 'task'),
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, id),
  foreign key (user_id, subject_kind, subject_id) references public.workspace_records(user_id, kind, id) deferrable initially deferred,
  foreign key (user_id, parent_kind, parent_id) references public.workspace_records(user_id, kind, id) deferrable initially deferred,
  check (data->>'id' = id),
  check (subject_id is not distinct from nullif(data->>'subjectId','')),
  check (parent_id is not distinct from nullif(data->>'parentTaskId',''))
);
create table public.workspace_operations (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  digest text not null,
  created_at timestamptz not null default now(),
  primary key (user_id,id)
);
alter table public.workspace_records enable row level security;
alter table public.workspace_operations enable row level security;
create policy own_records on public.workspace_records for select to authenticated using ((select auth.uid()) = user_id);
create policy own_receipts on public.workspace_operations for select to authenticated using ((select auth.uid()) = user_id);
-- Mutations are exclusively through the version-checked RPC below, including
-- direct REST callers. No browser/API caller can bypass CAS or erase tombstones.
revoke all on public.workspace_records, public.workspace_operations from anon, authenticated;
grant select on public.workspace_records to authenticated;

create function public.workspace_snapshot() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(to_jsonb(r) - 'user_id') from public.workspace_records r where user_id = auth.uid()), '[]'::jsonb);
end $$;

create function public.workspace_apply(operation_id uuid, changes jsonb, importing boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  item jsonb;
  old_version bigint;
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
    if body->>'id' is distinct from record_id or record_kind not in ('task','subject','thread','run') then
      raise exception 'invalid record' using errcode = '22023';
    end if;
    select version into old_version from public.workspace_records where user_id = owner_id and kind = record_kind and id = record_id;
    if importing and found then continue; end if;
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

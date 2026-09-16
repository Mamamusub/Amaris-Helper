-- Store the read-only Calendar/Classroom account separately from the Amaris owner.
create table public.google_data_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  google_email text not null check (length(google_email) between 3 and 320),
  refresh_token text not null,
  scopes text[] not null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.google_data_connections enable row level security;
revoke all on public.google_data_connections from anon, authenticated;

create function public.google_data_connection()
returns table(google_email text, refresh_token text, scopes text[])
language sql security definer set search_path = '' as $$
  select google_email, refresh_token, scopes from public.google_data_connections where user_id = auth.uid()
$$;
create function public.google_data_upsert(account_email text, encrypted_refresh text, granted_scopes text[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode = '42501'; end if;
  insert into public.google_data_connections(user_id, google_email, refresh_token, scopes)
  values (auth.uid(), account_email, encrypted_refresh, granted_scopes)
  on conflict (user_id) do update set google_email = excluded.google_email, refresh_token = excluded.refresh_token, scopes = excluded.scopes, updated_at = now();
end $$;
create function public.google_data_delete()
returns text language plpgsql security definer set search_path = '' as $$
declare old_refresh text;
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode = '42501'; end if;
  select refresh_token into old_refresh from public.google_data_connections where user_id = auth.uid();
  delete from public.google_data_connections where user_id = auth.uid();
  return old_refresh;
end $$;
revoke all on function public.google_data_connection(), public.google_data_upsert(text,text,text[]), public.google_data_delete() from public, anon;
grant execute on function public.google_data_connection(), public.google_data_upsert(text,text,text[]), public.google_data_delete() to authenticated;

-- KBG — Compteur des conneries dites en cours de Xavier
-- À exécuter dans Supabase SQL Editor.

create table if not exists public.xavier_counter (
  id integer primary key check (id = 1),
  count integer not null default 0 check (count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.xavier_counter enable row level security;

insert into public.xavier_counter (id, count)
values (1, 0)
on conflict (id) do nothing;

drop policy if exists "xavier_counter_public_select" on public.xavier_counter;
create policy "xavier_counter_public_select"
on public.xavier_counter
for select
to anon, authenticated
using (true);

create or replace function public.change_xavier_counter(p_delta integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count integer;
begin
  if not public.is_admin_user(auth.uid()) then
    raise exception 'Accès réservé aux administrateurs.';
  end if;

  update public.xavier_counter
  set count = greatest(0, count + coalesce(p_delta, 0)),
      updated_at = now()
  where id = 1
  returning count into new_count;

  return new_count;
end;
$$;

revoke all on function public.change_xavier_counter(integer) from public;
grant execute on function public.change_xavier_counter(integer) to authenticated;

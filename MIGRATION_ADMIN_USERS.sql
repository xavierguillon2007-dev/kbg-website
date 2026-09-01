-- KBG — Migration ADMIN_USERS
-- À exécuter dans Supabase SQL Editor.
-- Cette migration remplace la liste d'e-mails admin codée en dur
-- par la table public.admin_users.

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

alter table public.admin_users enable row level security;

-- Conserver les administrateurs actuels lors de la migration.
insert into public.admin_users (user_id, created_by)
select u.id, null
from auth.users u
where lower(u.email) in (
  'xavierguillon2007@gmail.com',
  'kbg.asso@gmail.com'
)
on conflict (user_id) do nothing;

create or replace function public.is_admin_user(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users a
    where a.user_id = p_user_id
  );
$$;

revoke all on function public.is_admin_user(uuid) from public;
grant execute on function public.is_admin_user(uuid) to anon, authenticated;

drop policy if exists "admin_users_select_admin" on public.admin_users;
create policy "admin_users_select_admin"
on public.admin_users
for select
to authenticated
using (public.is_admin_user(auth.uid()));

create or replace function public.get_admin_users_admin()
returns table (
  user_id uuid,
  email text,
  first_name text,
  last_name text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    a.user_id,
    u.email::text,
    coalesce(p.first_name, ''),
    coalesce(p.last_name, ''),
    a.created_at
  from public.admin_users a
  join auth.users u on u.id = a.user_id
  left join public.profiles p on p.user_id = a.user_id
  where public.is_admin_user(auth.uid())
  order by a.created_at asc;
$$;

revoke all on function public.get_admin_users_admin() from public;
grant execute on function public.get_admin_users_admin() to authenticated;

create or replace function public.add_admin_user(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin_user(auth.uid()) then
    raise exception 'Accès réservé aux administrateurs.';
  end if;

  if p_user_id is null then
    raise exception 'Utilisateur invalide.';
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Ce compte n’existe pas.';
  end if;

  insert into public.admin_users (user_id, created_by)
  values (p_user_id, auth.uid())
  on conflict (user_id) do nothing;

  return true;
end;
$$;

revoke all on function public.add_admin_user(uuid) from public;
grant execute on function public.add_admin_user(uuid) to authenticated;

create or replace function public.remove_admin_user(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_user(auth.uid()) then
    raise exception 'Accès réservé aux administrateurs.';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'Vous ne pouvez pas retirer vos propres droits administrateur.';
  end if;

  delete from public.admin_users
  where user_id = p_user_id;

  return found;
end;
$$;

revoke all on function public.remove_admin_user(uuid) from public;
grant execute on function public.remove_admin_user(uuid) to authenticated;

-- Les administrateurs restent considérés comme membres approuvés.
create or replace function public.is_approved_member(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = p_user_id
      and p.account_status = 'approved'
  )
  or public.is_admin_user(p_user_id);
$$;

revoke all on function public.is_approved_member(uuid) from public;
grant execute on function public.is_approved_member(uuid) to anon, authenticated;

-- Politique des participants : les admins sont autorisés via la table.
drop policy if exists "event_participants_select_admin" on public.event_participants;
create policy "event_participants_select_admin"
on public.event_participants
for select
to authenticated
using (
  public.is_admin_user(auth.uid())
);

-- Pour les profils déjà présents, les admins sont approuvés.
update public.profiles p
set account_status = 'approved',
    updated_at = now()
from auth.users u
where p.user_id = u.id
  and public.is_admin_user(u.id);

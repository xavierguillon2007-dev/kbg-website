-- =========================================================
-- KBG — PROFILS + INSCRIPTIONS AUX ÉVÉNEMENTS
-- Version propre : aucune RLS ne dépend de auth.user_metadata
-- =========================================================

-- ---------------------------------------------------------
-- 1. PROFILS
-- ---------------------------------------------------------

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null default '',
  last_name text not null default '',
  promotion text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Chaque membre peut lire uniquement son propre profil.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (user_id = auth.uid());

-- Chaque membre peut modifier uniquement son propre profil.
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Permet la création d'un profil par le membre lui-même si nécessaire.
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (user_id = auth.uid());

-- Mise à jour automatique de updated_at.
create or replace function public.set_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_profiles_updated_at();

-- ---------------------------------------------------------
-- 2. CRÉATION AUTOMATIQUE DU PROFIL À LA CRÉATION DU COMPTE
-- ---------------------------------------------------------
-- user_metadata est utilisé ici uniquement comme donnée initiale,
-- pas comme mécanisme de sécurité/RLS.

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    user_id,
    first_name,
    last_name,
    promotion
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', ''),
    coalesce(new.raw_user_meta_data ->> 'promotion', '')
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row
execute function public.handle_new_user_profile();

-- Création/rattrapage des profils pour les comptes déjà existants.
insert into public.profiles (user_id, first_name, last_name, promotion)
select
  u.id,
  coalesce(u.raw_user_meta_data ->> 'first_name', ''),
  coalesce(u.raw_user_meta_data ->> 'last_name', ''),
  coalesce(u.raw_user_meta_data ->> 'promotion', '')
from auth.users u
on conflict (user_id) do nothing;

-- ---------------------------------------------------------
-- 3. INSCRIPTIONS AUX ÉVÉNEMENTS
-- ---------------------------------------------------------

create table if not exists public.event_participants (
  event_id bigint not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

alter table public.event_participants enable row level security;

-- Lecture de sa propre inscription.
drop policy if exists "event_participants_select_own" on public.event_participants;
create policy "event_participants_select_own"
on public.event_participants
for select
to authenticated
using (user_id = auth.uid());

-- Les administrateurs peuvent voir toutes les inscriptions.
-- L'adresse e-mail provient du JWT Auth et n'est pas user_metadata.
drop policy if exists "event_participants_select_admin" on public.event_participants;
create policy "event_participants_select_admin"
on public.event_participants
for select
to authenticated
using (
  lower(coalesce(auth.jwt() ->> 'email', '')) in (
    'xavierguillon2007@gmail.com',
    'kbg.asso@gmail.com'
  )
);

-- Un membre peut uniquement créer une inscription pour son propre compte.
-- Les noms envoyés par le navigateur sont ensuite ignorés/remplacés
-- par les données du profil côté base de données.
drop policy if exists "event_participants_insert_own" on public.event_participants;
create policy "event_participants_insert_own"
on public.event_participants
for insert
to authenticated
with check (user_id = auth.uid());

-- Un membre peut annuler uniquement sa propre inscription.
drop policy if exists "event_participants_delete_own" on public.event_participants;
create policy "event_participants_delete_own"
on public.event_participants
for delete
to authenticated
using (user_id = auth.uid());

-- ---------------------------------------------------------
-- 4. SNAPSHOT DU NOM AU MOMENT DE L'INSCRIPTION
-- ---------------------------------------------------------
-- Cela garantit que l'administrateur voit le nom/prénom tels
-- qu'ils étaient enregistrés au moment de la participation.

create or replace function public.fill_event_participant_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.profiles%rowtype;
begin
  select * into p
  from public.profiles
  where user_id = new.user_id;

  if not found or btrim(p.first_name) = '' or btrim(p.last_name) = '' then
    raise exception 'Votre profil doit contenir un prénom et un nom avant de participer à un événement.';
  end if;

  new.first_name = p.first_name;
  new.last_name = p.last_name;

  return new;
end;
$$;

drop trigger if exists event_participants_fill_profile on public.event_participants;
create trigger event_participants_fill_profile
before insert on public.event_participants
for each row
execute function public.fill_event_participant_profile();

-- Pas de policy UPDATE : les noms de l'inscription ne peuvent pas
-- être modifiés par le membre après son inscription.

-- ---------------------------------------------------------
-- 5. COMPTEURS PUBLICS
-- ---------------------------------------------------------
-- Autorise l'affichage du nombre d'inscrits sans exposer leurs noms.

drop function if exists public.get_event_participant_counts(bigint[]);
create or replace function public.get_event_participant_counts(p_event_ids bigint[])
returns table (
  event_id bigint,
  participant_count bigint
)
language sql
security definer
set search_path = public
as $$
  select ep.event_id, count(*)::bigint as participant_count
  from public.event_participants ep
  where ep.event_id = any(p_event_ids)
  group by ep.event_id;
$$;

grant execute on function public.get_event_participant_counts(bigint[]) to anon, authenticated;

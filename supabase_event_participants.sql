-- =========================================================
-- KBG — PROFILS, VALIDATION DES COMPTES & PARTICIPATIONS
-- Version sécurisée : les comptes "pending" n'ont pas accès
-- aux fonctionnalités réservées aux membres.
-- =========================================================

-- ---------------------------------------------------------
-- 1. PROFILS
-- ---------------------------------------------------------

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null default '',
  last_name text not null default '',
  promotion text not null default '',
  account_status text not null default 'pending'
    check (account_status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Ajout compatible si la table existe déjà.
alter table public.profiles
  add column if not exists account_status text not null default 'pending';

-- Contrainte ajoutée seulement si elle n'existe pas déjà.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_account_status_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_account_status_check
      check (account_status in ('pending', 'approved', 'rejected'));
  end if;
end $$;

alter table public.profiles enable row level security;

-- ---------------------------------------------------------
-- 2. FONCTIONS DE SÉCURITÉ
-- ---------------------------------------------------------

-- Fonction SECURITY DEFINER : les policies peuvent vérifier le statut
-- sans donner à l'utilisateur accès aux profils des autres membres.
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
  or lower(coalesce(auth.jwt() ->> 'email', '')) in (
    'xavierguillon2007@gmail.com',
    'kbg.asso@gmail.com'
  );
$$;

revoke all on function public.is_approved_member(uuid) from public;
grant execute on function public.is_approved_member(uuid) to anon, authenticated;

-- ---------------------------------------------------------
-- 3. PROTECTION DU STATUT DU PROFIL
-- ---------------------------------------------------------

-- Un utilisateur peut modifier son nom/promotion, mais jamais
-- transformer lui-même son statut pending en approved.
create or replace function public.is_admin_user(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(u.email, '')) in (
    'xavierguillon2007@gmail.com',
    'kbg.asso@gmail.com'
  )
  from auth.users u
  where u.id = p_user_id;
$$;

revoke all on function public.is_admin_user(uuid) from public;
grant execute on function public.is_admin_user(uuid) to anon, authenticated;

create or replace function public.protect_profile_account_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Un membre ne peut jamais changer lui-même son statut.
  -- Les deux comptes administrateurs peuvent le faire, notamment
  -- lorsque la validation est effectuée directement depuis l'interface.
  if auth.uid() is not null
     and new.account_status is distinct from old.account_status
     and not public.is_admin_user(auth.uid()) then
    raise exception 'Le statut du compte ne peut être modifié que par un administrateur.';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_account_status on public.profiles;
create trigger profiles_protect_account_status
before update on public.profiles
for each row
execute function public.protect_profile_account_status();

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
-- 4. RLS PROFILES
-- ---------------------------------------------------------

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Lorsqu'un client doit créer son profil, il ne peut créer qu'un profil
-- pour lui-même et son statut est obligatoirement pending.
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (
  user_id = auth.uid()
  and account_status = 'pending'
);

-- ---------------------------------------------------------
-- 5. CRÉATION AUTOMATIQUE DU PROFIL À LA CRÉATION DU COMPTE
-- ---------------------------------------------------------
-- user_metadata est utilisé ici uniquement pour préremplir les champs,
-- jamais pour autoriser une action de sécurité.

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
    promotion,
    account_status
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', ''),
    coalesce(new.raw_user_meta_data ->> 'promotion', ''),
    'pending'
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

-- Rattrapage des comptes déjà existants.
insert into public.profiles (user_id, first_name, last_name, promotion, account_status)
select
  u.id,
  coalesce(u.raw_user_meta_data ->> 'first_name', ''),
  coalesce(u.raw_user_meta_data ->> 'last_name', ''),
  coalesce(u.raw_user_meta_data ->> 'promotion', ''),
  case
    when lower(coalesce(u.email, '')) in ('xavierguillon2007@gmail.com', 'kbg.asso@gmail.com') then 'approved'
    when exists (
      select 1 from public.account_requests ar
      where lower(ar.email) = lower(u.email)
        and ar.status = 'approved'
    ) then 'approved'
    when exists (
      select 1 from public.account_requests ar
      where lower(ar.email) = lower(u.email)
        and ar.status = 'rejected'
    ) then 'rejected'
    else 'pending'
  end
from auth.users u
on conflict (user_id) do nothing;

-- Pour les profils existants, synchronisation initiale du statut avec
-- les demandes déjà traitées. Ne rétrograde pas un compte déjà approved.
update public.profiles p
set account_status = case
  when lower(coalesce(u.email, '')) in ('xavierguillon2007@gmail.com', 'kbg.asso@gmail.com') then 'approved'
  when exists (
    select 1 from public.account_requests ar
    where lower(ar.email) = lower(u.email)
      and ar.status = 'approved'
  ) then 'approved'
  when exists (
    select 1 from public.account_requests ar
    where lower(ar.email) = lower(u.email)
      and ar.status = 'rejected'
  ) then 'rejected'
  else p.account_status
end
from auth.users u
where p.user_id = u.id;

-- ---------------------------------------------------------
-- 6. SYNCHRONISATION AUTOMATIQUE DES VALIDATIONS ADMIN
-- ---------------------------------------------------------
-- La fonction de validation du site peut continuer à modifier
-- account_requests. Ce trigger synchronise alors profiles.

create or replace function public.sync_profile_account_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles p
  set account_status = new.status,
      updated_at = now()
  from auth.users u
  where p.user_id = u.id
    and lower(u.email) = lower(new.email)
    and new.status in ('pending', 'approved', 'rejected');

  return new;
end;
$$;

drop trigger if exists account_requests_sync_profile_status on public.account_requests;
create trigger account_requests_sync_profile_status
after insert or update of status on public.account_requests
for each row
execute function public.sync_profile_account_status();

-- ---------------------------------------------------------
-- 6 bis. DEMANDES DE COMPTES : ACCÈS ADMINISTRATEUR
-- ---------------------------------------------------------
-- Les administrateurs doivent pouvoir consulter et traiter les demandes.
-- La sécurité repose sur l'e-mail du compte Auth, jamais sur user_metadata.

alter table public.account_requests enable row level security;

drop policy if exists "account_requests_select_admin" on public.account_requests;
create policy "account_requests_select_admin"
on public.account_requests
for select
to authenticated
using (public.is_admin_user(auth.uid()));

drop policy if exists "account_requests_update_admin" on public.account_requests;
create policy "account_requests_update_admin"
on public.account_requests
for update
to authenticated
using (public.is_admin_user(auth.uid()))
with check (public.is_admin_user(auth.uid()));

-- ---------------------------------------------------------
-- 7. ÉVÉNEMENTS : PROTECTION DES ÉVÉNEMENTS MEMBRES
-- ---------------------------------------------------------
-- Policy RESTRICTIVE : elle s'ajoute aux policies existantes et
-- empêche un compte pending de lire un événement members_only.

drop policy if exists "events_members_only_require_approved" on public.events;
create policy "events_members_only_require_approved"
on public.events as restrictive
for select
to anon, authenticated
using (
  not coalesce(members_only, false)
  or public.is_approved_member(auth.uid())
);

-- ---------------------------------------------------------
-- 8. PARTICIPATIONS
-- ---------------------------------------------------------

create table if not exists public.event_participants (
  event_id bigint not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  first_name text not null default '',
  last_name text not null default '',
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

alter table public.event_participants enable row level security;

drop policy if exists "event_participants_select_own" on public.event_participants;
create policy "event_participants_select_own"
on public.event_participants
for select
to authenticated
using (user_id = auth.uid());

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

drop policy if exists "event_participants_insert_own" on public.event_participants;
create policy "event_participants_insert_own"
on public.event_participants
for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.is_approved_member(auth.uid())
);

drop policy if exists "event_participants_delete_own" on public.event_participants;
create policy "event_participants_delete_own"
on public.event_participants
for delete
to authenticated
using (user_id = auth.uid());

-- Remplit automatiquement les noms depuis profiles.
create or replace function public.fill_event_participant_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.profiles%rowtype;
begin
  if not public.is_approved_member(new.user_id) then
    raise exception 'Votre compte doit être validé par un administrateur avant de participer à un événement.';
  end if;

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

-- ---------------------------------------------------------
-- 9. COMPTEURS PUBLICS
-- ---------------------------------------------------------

create or replace function public.get_event_participant_counts(p_event_ids bigint[])
returns table (event_id bigint, participant_count bigint)
language sql
security definer
set search_path = public
as $$
  select ep.event_id, count(*)::bigint
  from public.event_participants ep
  where ep.event_id = any(p_event_ids)
  group by ep.event_id;
$$;

grant execute on function public.get_event_participant_counts(bigint[]) to anon, authenticated;

-- ---------------------------------------------------------
-- 10. RÉSERVATIONS : BLOQUER LES COMPTES EN ATTENTE
-- ---------------------------------------------------------
-- Policy RESTRICTIVE : elle ne remplace pas les permissions métier
-- déjà présentes ; elle ajoute la condition "compte approuvé".

drop policy if exists "reservations_require_approved_member" on public.reservations;
create policy "reservations_require_approved_member"
on public.reservations as restrictive
for insert
to authenticated
with check (public.is_approved_member(auth.uid()));



-- ---------------------------------------------------------
-- 11. AVIS : BLOQUER LES COMPTES EN ATTENTE
-- ---------------------------------------------------------
-- Les règles métier existantes restent valables, mais un compte
-- non approuvé ne peut pas créer un nouvel avis.
drop policy if exists "game_reviews_require_approved_member" on public.game_reviews;
create policy "game_reviews_require_approved_member"
on public.game_reviews as restrictive
for insert
to authenticated
with check (public.is_approved_member(auth.uid()));

-- ---------------------------------------------------------
-- 6 ter. COMPTES EXISTANTS EN ATTENTE (ANCIENS COMPTES)
-- ---------------------------------------------------------
-- Permet aux administrateurs de voir et de valider les profils
-- créés avant la mise en place de account_requests.

create or replace function public.get_pending_accounts_admin()
returns table (
  user_id uuid,
  email text,
  first_name text,
  last_name text,
  promotion text,
  account_status text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.user_id,
    u.email::text,
    p.first_name,
    p.last_name,
    p.promotion,
    p.account_status,
    p.created_at
  from public.profiles p
  join auth.users u on u.id = p.user_id
  where p.account_status = 'pending'
    and public.is_admin_user(auth.uid())
  order by p.created_at desc;
$$;

revoke all on function public.get_pending_accounts_admin() from public;
grant execute on function public.get_pending_accounts_admin() to authenticated;

create or replace function public.set_account_status_admin(
  p_user_id uuid,
  p_status text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_count integer;
begin
  if not public.is_admin_user(auth.uid()) then
    raise exception 'Accès réservé aux administrateurs.';
  end if;

  if p_status not in ('approved', 'rejected') then
    raise exception 'Statut invalide.';
  end if;

  update public.profiles
  set account_status = p_status,
      updated_at = now()
  where user_id = p_user_id
    and account_status = 'pending';

  get diagnostics updated_count = row_count;
  return updated_count = 1;
end;
$$;

revoke all on function public.set_account_status_admin(uuid, text) from public;
grant execute on function public.set_account_status_admin(uuid, text) to authenticated;


-- =========================================================
-- 13. GESTION COMPLÈTE DES COMPTES ADMIN + SUPPRESSION DU COMPTE
-- =========================================================

create or replace function public.get_all_accounts_admin()
returns table (
  user_id uuid,
  email text,
  first_name text,
  last_name text,
  promotion text,
  account_status text,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    u.id,
    u.email::text,
    coalesce(p.first_name, ''),
    coalesce(p.last_name, ''),
    coalesce(p.promotion, ''),
    coalesce(p.account_status, 'pending'),
    u.created_at,
    u.last_sign_in_at
  from auth.users u
  left join public.profiles p on p.user_id = u.id
  where public.is_admin_user(auth.uid())
  order by u.created_at desc;
$$;

revoke all on function public.get_all_accounts_admin() from public;
grant execute on function public.get_all_accounts_admin() to authenticated;

create or replace function public.update_account_admin(
  p_user_id uuid,
  p_first_name text,
  p_last_name text,
  p_promotion text,
  p_account_status text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_user(auth.uid()) then
    raise exception 'Accès réservé aux administrateurs.';
  end if;

  if p_account_status not in ('pending','approved','rejected') then
    raise exception 'Statut invalide.';
  end if;

  update public.profiles
  set first_name = coalesce(p_first_name, ''),
      last_name = coalesce(p_last_name, ''),
      promotion = coalesce(p_promotion, ''),
      account_status = p_account_status,
      updated_at = now()
  where user_id = p_user_id;

  return found;
end;
$$;

revoke all on function public.update_account_admin(uuid,text,text,text,text) from public;
grant execute on function public.update_account_admin(uuid,text,text,text,text) to authenticated;

-- Suppression par un administrateur. La suppression de auth.users
-- déclenche les cascades définies sur les tables qui le référencent.
create or replace function public.delete_account_admin(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  deleted_count integer;
begin
  if not public.is_admin_user(auth.uid()) then
    raise exception 'Accès réservé aux administrateurs.';
  end if;

  if p_user_id is null then
    raise exception 'Compte invalide.';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'Utilisez « Supprimer mon compte » depuis votre espace personnel pour supprimer votre propre compte.';
  end if;

  -- Nettoyage des demandes historiques avant suppression de l'utilisateur.
  delete from public.account_requests
  where lower(email) = lower((select email from auth.users where id = p_user_id));

  delete from auth.users
  where id = p_user_id;

  get diagnostics deleted_count = row_count;
  return deleted_count = 1;
end;
$$;

revoke all on function public.delete_account_admin(uuid) from public;
grant execute on function public.delete_account_admin(uuid) to authenticated;

-- Un membre peut supprimer son propre compte, mais pas celui d'un autre utilisateur.
create or replace function public.delete_own_account()
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
  deleted_count integer;
begin
  if uid is null then
    raise exception 'Vous devez être connecté.';
  end if;

  delete from public.account_requests
  where lower(email) = lower((select email from auth.users where id = uid));

  delete from auth.users
  where id = uid;

  get diagnostics deleted_count = row_count;
  return deleted_count = 1;
end;
$$;

revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;

-- KBG — Validation admin + confirmation e-mail
-- À exécuter UNE FOIS dans Supabase > SQL Editor.
--
-- Nouveau statut : pending_email
-- pending       = demande pas encore validée par un admin
-- pending_email = admin validé, mais adresse e-mail pas encore confirmée
-- approved      = admin validé ET e-mail confirmé
-- rejected      = demande refusée

-- ---------------------------------------------------------
-- 1. Nouveau statut sur profiles
-- ---------------------------------------------------------

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'profiles_account_status_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles drop constraint profiles_account_status_check;
  end if;
end $$;

alter table public.profiles
  add constraint profiles_account_status_check
  check (account_status in ('pending', 'pending_email', 'approved', 'rejected'));

-- Les comptes déjà marqués "approved" mais dont l'e-mail n'est pas confirmé
-- passent eux aussi dans le nouvel état intermédiaire.
update public.profiles p
set account_status = 'pending_email',
    updated_at = now()
from auth.users u
where p.user_id = u.id
  and p.account_status = 'approved'
  and u.email_confirmed_at is null;

-- ---------------------------------------------------------
-- 2. Synchronisation des validations admin
-- ---------------------------------------------------------

create or replace function public.sync_profile_account_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles p
  set account_status = case
        when new.status = 'approved'
             and coalesce(u.email_confirmed_at, null) is null
          then 'pending_email'
        else new.status
      end,
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
-- 3. Validation automatique après confirmation de l'e-mail
-- ---------------------------------------------------------

create or replace function public.promote_email_confirmed_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email_confirmed_at is not null
     and (old.email_confirmed_at is null or old.email_confirmed_at is distinct from new.email_confirmed_at) then
    update public.profiles
    set account_status = 'approved',
        updated_at = now()
    where user_id = new.id
      and account_status = 'pending_email';
  end if;

  return new;
end;
$$;

drop trigger if exists auth_user_email_confirmation_promote on auth.users;
create trigger auth_user_email_confirmation_promote
after update of email_confirmed_at on auth.users
for each row
execute function public.promote_email_confirmed_account();

-- ---------------------------------------------------------
-- 4. Les fonctions admin tiennent compte de la confirmation e-mail
-- ---------------------------------------------------------

create or replace function public.set_account_status_admin(
  p_user_id uuid,
  p_status text
)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  updated_count integer;
  target_status text;
  confirmed_at timestamptz;
begin
  if not public.is_admin_user(auth.uid()) then
    raise exception 'Accès réservé aux administrateurs.';
  end if;

  if p_status not in ('approved', 'rejected') then
    raise exception 'Statut invalide.';
  end if;

  select email_confirmed_at into confirmed_at
  from auth.users
  where id = p_user_id;

  if not found then
    raise exception 'Utilisateur introuvable.';
  end if;

  target_status := case
    when p_status = 'approved' and confirmed_at is null then 'pending_email'
    else p_status
  end;

  update public.profiles
  set account_status = target_status,
      updated_at = now()
  where user_id = p_user_id
    and account_status = 'pending';

  get diagnostics updated_count = row_count;
  return updated_count = 1;
end;
$$;

revoke all on function public.set_account_status_admin(uuid, text) from public;
grant execute on function public.set_account_status_admin(uuid, text) to authenticated;

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
set search_path = public, auth
as $$
declare
  target_status text;
  confirmed_at timestamptz;
begin
  if not public.is_admin_user(auth.uid()) then
    raise exception 'Accès réservé aux administrateurs.';
  end if;

  if p_account_status not in ('pending','pending_email','approved','rejected') then
    raise exception 'Statut invalide.';
  end if;

  select email_confirmed_at into confirmed_at
  from auth.users
  where id = p_user_id;

  if not found then
    raise exception 'Utilisateur introuvable.';
  end if;

  target_status := case
    when p_account_status = 'approved' and confirmed_at is null then 'pending_email'
    else p_account_status
  end;

  update public.profiles
  set first_name = coalesce(p_first_name, ''),
      last_name = coalesce(p_last_name, ''),
      promotion = coalesce(p_promotion, ''),
      account_status = target_status,
      updated_at = now()
  where user_id = p_user_id;

  return found;
end;
$$;

revoke all on function public.update_account_admin(uuid,text,text,text,text) from public;
grant execute on function public.update_account_admin(uuid,text,text,text,text) to authenticated;

-- ---------------------------------------------------------
-- 5. Vérification facultative
-- ---------------------------------------------------------
-- select u.email, u.email_confirmed_at, p.account_status
-- from auth.users u
-- left join public.profiles p on p.user_id = u.id
-- order by u.created_at desc;

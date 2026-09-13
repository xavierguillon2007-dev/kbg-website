-- KBG — Jeux non empruntables
-- À exécuter dans Supabase SQL Editor.
--
-- Ajoute un indicateur "is_borrowable" sur la table games.
-- Quand il vaut false :
--   - la fiche du jeu (index.html / app.js) affiche un message
--     indiquant que le jeu ne peut pas être réservé, à la place
--     du calendrier de disponibilité et du bouton de réservation ;
--   - le trigger de contrôle des réservations refuse toute nouvelle
--     demande de réservation pour ce jeu, en sécurité côté base
--     de données (même si le front n'a pas été mis à jour).

alter table public.games
  add column if not exists is_borrowable boolean not null default true;

comment on column public.games.is_borrowable is
  'Si false, le jeu ne peut pas être emprunté/réservé (fiche jeu -> message d''indisponibilité à la place du calendrier).';

-- =========================================================
-- CONTRÔLE CÔTÉ BASE DE DONNÉES
-- =========================================================
-- On réutilise le trigger de capacité posé par
-- MIGRATION_GAME_COPIES.sql et on y ajoute le blocage des jeux
-- marqués non empruntables.

create or replace function public.check_game_reservation_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  copies integer;
  borrowable boolean;
  active_reservations integer;
begin
  -- Une réservation refusée ne consomme aucun exemplaire.
  if lower(coalesce(new.status, 'pending')) = 'rejected' then
    return new;
  end if;

  if new.game_id is null
     or new.date_start is null
     or new.date_end is null then
    return new;
  end if;

  if new.date_end < new.date_start then
    raise exception 'La date de fin doit être postérieure ou égale à la date de début.';
  end if;

  -- Sérialise les réservations concurrentes du même jeu pour éviter
  -- qu'une course entre deux INSERT ne dépasse la capacité disponible.
  perform pg_advisory_xact_lock(hashtext(new.game_id::text));

  select greatest(coalesce(g.copies_count, 1), 1),
         coalesce(g.is_borrowable, true)
    into copies, borrowable
  from public.games g
  where g.id = new.game_id;

  if copies is null then
    raise exception 'Jeu introuvable.';
  end if;

  if not borrowable then
    raise exception 'Ce jeu a été marqué comme non empruntable et ne peut pas être réservé.';
  end if;

  select count(*)::integer
    into active_reservations
  from public.reservations r
  where r.game_id = new.game_id
    and r.id is distinct from new.id
    and lower(coalesce(r.status, 'pending')) <> 'rejected'
    and r.date_start is not null
    and r.date_end is not null
    and r.date_start <= new.date_end
    and r.date_end >= new.date_start;

  if active_reservations >= copies then
    raise exception
      'Ce jeu est déjà réservé sur cette période : tous les exemplaires sont occupés (%/%).',
      active_reservations,
      copies;
  end if;

  return new;
end;
$$;

drop trigger if exists reservations_check_game_capacity
on public.reservations;

create trigger reservations_check_game_capacity
before insert or update of game_id, date_start, date_end, status
on public.reservations
for each row
execute function public.check_game_reservation_capacity();

-- KBG — Gestion du nombre d'exemplaires par jeu
-- À exécuter dans Supabase SQL Editor.

alter table public.games
  add column if not exists copies_count integer not null default 1;

update public.games
set copies_count = 1
where copies_count is null or copies_count < 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'games_copies_count_positive'
  ) then
    alter table public.games
      add constraint games_copies_count_positive check (copies_count >= 1);
  end if;
end $$;

-- =========================================================
-- 2. RÉSERVATIONS : GESTION DE PLUSIEURS EXEMPLAIRES
-- =========================================================
-- L'ancien contrôle de chevauchement pouvait bloquer une deuxième
-- réservation même lorsqu'un jeu possédait plusieurs exemplaires.
-- On retire uniquement les anciens triggers de contrôle dont le code
-- contient le message "déjà réservé", puis on installe un contrôle
-- basé sur games.copies_count.
--
-- Les demandes "pending" et les réservations "approved" occupent un
-- exemplaire. Les demandes "rejected" ne bloquent rien.

do $$
declare
  trigger_row record;
begin
  for trigger_row in
    select
      t.tgname,
      p.prosrc
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p on p.oid = t.tgfoid
    join pg_namespace pn on pn.oid = p.pronamespace
    where n.nspname = 'public'
      and c.relname = 'reservations'
      and not t.tgisinternal
      and (
        lower(p.prosrc) like '%déjà réservé%'
        or lower(p.prosrc) like '%deja reserve%'
        or lower(p.prosrc) like '%already reserved%'
      )
  loop
    execute format(
      'drop trigger if exists %I on public.reservations',
      trigger_row.tgname
    );
  end loop;
end $$;

create or replace function public.check_game_reservation_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  copies integer;
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

  select greatest(coalesce(g.copies_count, 1), 1)
    into copies
  from public.games g
  where g.id = new.game_id;

  if copies is null then
    raise exception 'Jeu introuvable.';
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

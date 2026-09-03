-- KBG — Priorité d'affichage des événements
-- À exécuter dans Supabase SQL Editor.
--
-- Ajoute une colonne "priority" (1 à 3, 1 = priorité la plus faible,
-- 3 = priorité la plus élevée) sur la table events.
-- Cette valeur permet de choisir quel événement est mis en avant
-- dans le cadre "Prochain événement" de la page d'accueil, avant
-- même de regarder la date : à priorité égale, l'événement le plus
-- proche dans le temps l'emporte.

alter table public.events
  add column if not exists priority smallint not null default 1;

update public.events
set priority = 1
where priority is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'events_priority_range'
  ) then
    alter table public.events
      add constraint events_priority_range check (priority between 1 and 3);
  end if;
end $$;

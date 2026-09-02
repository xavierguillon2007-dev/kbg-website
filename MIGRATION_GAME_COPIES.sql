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

-- KBG — Correction des droits administrateurs sur les événements
-- À exécuter dans Supabase SQL Editor.
-- Les droits sont désormais basés uniquement sur public.admin_users.

alter table public.events enable row level security;

drop policy if exists "events_admin_all" on public.events;
create policy "events_admin_all"
on public.events
for all
to authenticated
using (public.is_admin_user(auth.uid()))
with check (public.is_admin_user(auth.uid()));

-- Les administrateurs restent membres approuvés, y compris ceux
-- ajoutés après la migration initiale.
-- (La fonction existe déjà dans MIGRATION_ADMIN_USERS.sql.)

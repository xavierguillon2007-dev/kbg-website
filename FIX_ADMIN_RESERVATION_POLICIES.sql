-- KBG — Harmonisation des droits administrateur
-- À exécuter dans Supabase SQL Editor.
-- Les administrateurs sont ceux présents dans public.admin_users.

create or replace function public.is_kbg_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin_user(auth.uid());
$$;

revoke all on function public.is_kbg_admin() from public;
grant execute on function public.is_kbg_admin() to anon, authenticated;

-- Une seule logique pour savoir si un utilisateur peut réserver.
create or replace function public.is_approved_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_approved_member(auth.uid());
$$;

revoke all on function public.is_approved_member() from public;
grant execute on function public.is_approved_member() to anon, authenticated;

-- La policy admin existante devient cohérente avec admin_users.
drop policy if exists "reservations_admin_all" on public.reservations;
create policy "reservations_admin_all"
on public.reservations
as permissive
for all
to authenticated
using (public.is_kbg_admin())
with check (public.is_kbg_admin());


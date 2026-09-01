-- =========================================================
-- KBG — INSCRIPTIONS AUX ÉVÉNEMENTS
-- À exécuter dans Supabase > SQL Editor
-- =========================================================

create table if not exists public.event_participants (
  event_id bigint not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

alter table public.event_participants enable row level security;

-- Les membres connectés peuvent voir leur propre inscription.
drop policy if exists "event_participants_select_own" on public.event_participants;
create policy "event_participants_select_own"
on public.event_participants
for select
to authenticated
using (user_id = auth.uid());

-- Les administrateurs peuvent voir toutes les inscriptions.
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

-- Un membre peut s'inscrire uniquement pour son propre compte.
drop policy if exists "event_participants_insert_own" on public.event_participants;
create policy "event_participants_insert_own"
on public.event_participants
for insert
to authenticated
with check (
  user_id = auth.uid()
  and first_name = coalesce(auth.jwt() -> 'user_metadata' ->> 'first_name', '')
  and last_name = coalesce(auth.jwt() -> 'user_metadata' ->> 'last_name', '')
);

-- Un membre peut annuler uniquement sa propre inscription.
drop policy if exists "event_participants_delete_own" on public.event_participants;
create policy "event_participants_delete_own"
on public.event_participants
for delete
to authenticated
using (user_id = auth.uid());

-- Empêche les membres de modifier les noms stockés après inscription.
-- Le site utilise uniquement INSERT / DELETE, pas UPDATE.

-- Compteurs publics : permet d'afficher le nombre d'inscrits
-- sans exposer les noms des participants aux visiteurs.
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

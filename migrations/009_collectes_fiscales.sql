-- Historique des paramètres fiscaux récupérés : une ligne par propriétaire,
-- millésime DE REVENUS et source. Le millésime 2025 (revenus 2025, déclarés
-- en 2026) ne doit pas être confondu avec l'année de publication du barème.
--
-- À exécuter dans Supabase SQL Editor après les migrations 004 et 008.
-- Append-only pour les clients : aucune mise à jour ni suppression autorisée.
-- Ces collectes sont des DONNÉES SOURCÉES, non des barèmes approuvés : le moteur
-- fiscal ne les utilise pas avant que tous les paramètres nécessaires soient
-- disponibles et que les changements de règle aient été pris en charge.
create table if not exists public.pf2_fiscal_collectes (
    user_id uuid not null default auth.uid() references auth.users(id),
    annee_revenus integer not null check (annee_revenus between 2000 and 2100),
    source text not null check (source in ('openfisca_bareme_ir')),
    valeurs jsonb not null check (jsonb_typeof(valeurs) = 'object'),
    source_url text not null check (source_url = 'https://api.fr.openfisca.org/latest/parameter/impot_revenu/bareme_ir_depuis_1945/bareme'),
    recupere_le timestamptz not null default now(),
    primary key (user_id, annee_revenus, source)
);

alter table public.pf2_fiscal_collectes enable row level security;
revoke all on table public.pf2_fiscal_collectes from anon, authenticated;
grant select, insert on table public.pf2_fiscal_collectes to authenticated;
grant select on table public.pf2_fiscal_collectes to service_role;
drop policy if exists fiscal_collectes_lecture on public.pf2_fiscal_collectes;
drop policy if exists fiscal_collectes_ajout on public.pf2_fiscal_collectes;
create policy fiscal_collectes_lecture on public.pf2_fiscal_collectes
    for select to authenticated using (auth.uid() = user_id);
create policy fiscal_collectes_ajout on public.pf2_fiscal_collectes
    for insert to authenticated with check (auth.uid() = user_id);

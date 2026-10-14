-- À exécuter APRÈS 009. Ne supprime aucune donnée de 009, même si la collecte
-- IR a déjà été utilisée. Une rectification d'une année crée la révision N+1.
-- Une nouvelle année crée sa révision 1 ; les autres années sont inchangées.
-- À faire dans Supabase SQL Editor une seule fois (script rejouable).

begin;

alter table public.pf2_fiscal_collectes
    add column if not exists revision integer not null default 1;
alter table public.pf2_fiscal_collectes
    drop constraint if exists pf2_fiscal_collectes_pkey;
alter table public.pf2_fiscal_collectes
    add constraint pf2_fiscal_collectes_pkey
    primary key (user_id, annee_revenus, source, revision);

-- Copie complète des PARAMÈTRES embarqués (pas des informations personnelles).
-- Ces lignes sont historiques, pas certifiées par l'administration fiscale.
-- Service role = écriture ; l'APK connectée = lecture seule ; jamais anon.
create table if not exists public.pf2_fiscal_annees (
    user_id uuid not null references auth.users(id),
    annee_revenus integer not null check (annee_revenus between 2000 and 2100),
    revision integer not null check (revision >= 1),
    parametres jsonb not null check (
        jsonb_typeof(parametres) = 'object'
        and parametres ?& array['bareme', 'prelevements_sociaux', 'ir_forfaitaire',
                                 'abattement_10', 'forfait_repas', 'bareme_km']),
    origine text not null check (origine in ('reprise_code_non_verifiee', 'nouvelle_publication')),
    source_ref text not null,
    cree_le timestamptz not null default now(),
    primary key (user_id, annee_revenus, revision)
);

alter table public.pf2_fiscal_annees enable row level security;
revoke all on table public.pf2_fiscal_annees from anon, authenticated;
grant select on table public.pf2_fiscal_annees to authenticated;
grant select, insert on table public.pf2_fiscal_annees to service_role;
drop policy if exists fiscal_annees_lecture on public.pf2_fiscal_annees;
create policy fiscal_annees_lecture on public.pf2_fiscal_annees
    for select to authenticated using (auth.uid() = user_id);

commit;

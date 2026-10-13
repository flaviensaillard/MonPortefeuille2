-- Migration de structure uniquement. Autorisée par le propriétaire sous réserve
-- d'une sauvegarde chiffrée récente, restaurée et comparée à la lecture seule.
-- À exécuter après 010 ; ne publie aucune révision, n'active aucun calcul.
-- Le futur lecteur de règles et la publication R2 restent des étapes distinctes.
-- Le propriétaire des titres n'est pas un paramètre fiscal de cette table :
-- user_id identifie le compte applicatif, pas un conjoint ou un co-titulaire.

begin;

alter table public.pf2_fiscal_annees
    add column if not exists statut_validation text not null default 'historique_non_verifie';
alter table public.pf2_fiscal_annees
    add column if not exists perimetre_validation jsonb not null default '{}'::jsonb;
alter table public.pf2_fiscal_annees
    add column if not exists actif boolean not null default false;

-- Toutes les lignes 2022–2026 déjà présentes héritent du défaut : ni
-- homologation implicite de R1, ni activation du fait de la migration.
alter table public.pf2_fiscal_annees
    drop constraint if exists pf2_fiscal_annees_validation_check;
alter table public.pf2_fiscal_annees
    add constraint pf2_fiscal_annees_validation_check check (
        statut_validation in ('historique_non_verifie', 'brouillon', 'valide_pour_perimetre')
        and jsonb_typeof(perimetre_validation) = 'object'
        and (not actif or (
            statut_validation = 'valide_pour_perimetre'
            and perimetre_validation ->> 'couverture' = 'integrale_parametres_utilises'
        ))
    );

-- Une seule révision active par compte et par année de revenus ; une loi
-- rectificative exigera une nouvelle révision, sans effacer l'ancienne.
create unique index if not exists pf2_fiscal_annees_une_active_par_annee
    on public.pf2_fiscal_annees (user_id, annee_revenus) where actif;

-- Aucun trigger d'activation et aucun droit d'écriture ajouté à l'APK.
-- Le prédicat SQL ne prouve PAS que les règles fiscales sont correctes :
-- un futur lecteur devra contrôler le contenu et refuser les cas non couverts.
commit;

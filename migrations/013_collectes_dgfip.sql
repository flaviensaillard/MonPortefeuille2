-- Historique des collectes DGFiP : élargit `pf2_fiscal_collectes` aux sources
-- réellement lues par l'application (BOFiP, aides du simulateur, brochures et
-- notices PDF de la DGFiP).
--
-- À exécuter dans Supabase SQL Editor APRÈS 012, une seule fois, avec l'accord du
-- propriétaire et après sauvegarde chiffrée récente restaurée et comparée.
-- Script rejouable : il ne supprime ni ne modifie aucune ligne existante, et les
-- sources OpenFisca historiques restent autorisées (aucune ligne n'est orpheline).
-- Ne pas rejouer 009/010/011/012.
--
-- Ce que cette migration NE fait PAS :
--   * elle ne publie aucune règle et n'active aucun calcul : `pf2_fiscal_annees`
--     reste en écriture `service_role` uniquement, et une ligne de collecte n'est
--     qu'une donnée sourcée (commentaire de 009) ;
--   * elle n'autorise ni UPDATE ni DELETE : la table reste append-only pour les
--     clients (grant select, insert), une rectification du même millésime crée la
--     révision suivante ;
--   * elle n'élargit pas la RLS : chaque compte ne lit et n'écrit que ses lignes
--     (auth.uid() = user_id).
--
-- Aucune donnée personnelle n'est stockée ici : `valeurs` ne contient que des
-- paramètres publics (barème, décote, plafond, taux, forfaits) et les références
-- du document lu. Aucun montant du foyer, aucun taux de prélèvement à la source,
-- aucune ligne de déclaration.

begin;

-- 1) Sources autorisées. Les deux valeurs OpenFisca sont conservées pour les
--    lignes déjà écrites ; aucune n'est ajoutée par cette migration.
alter table public.pf2_fiscal_collectes
    drop constraint if exists pf2_fiscal_collectes_source_check;
alter table public.pf2_fiscal_collectes
    add constraint pf2_fiscal_collectes_source_check check (source in (
        'openfisca_bareme_ir',            -- historique (009), lecture seule
        'openfisca_parametres',           -- historique (012), lecture seule
        'dgfip_bofip_ir',                 -- BOI-IR-LIQ-20-10, barème de l'impôt
        'dgfip_bofip_decote',             -- BOI-IR-LIQ-20-20-30, décote
        'dgfip_bofip_qf',                 -- BOI-IR-LIQ-20-20-20, plafond du quotient familial
        'dgfip_frais',                    -- aide du simulateur : barème km et abattement de 10 %
        'dgfip_frais_repas',              -- forfait repas (aide du simulateur ou page DGFiP)
        'dgfip_regimes_titres',           -- aide du simulateur : PS et PFU des plus-values de titres
        'dgfip_brochure_rcm',             -- brochure IR, chapitre revenus de capitaux mobiliers
        'dgfip_brochure_charges',         -- brochure IR, chapitre charges déductibles (CSG)
        'dgfip_brochure_plus_values',     -- brochure IR, chapitre plus-values de cession de titres
        'dgfip_notice_2086',              -- notice du formulaire 2086 (cessions d'actifs numériques)
        'dgfip_nouveautes'                -- brochure IR, chapitre principales nouveautés
    ));

-- 2) Adresse de chaque source : hôte DGFiP exact, en https, chemin imposé. Une
--    adresse d'un autre hôte, ou devinée, est refusée par la contrainte.
alter table public.pf2_fiscal_collectes
    drop constraint if exists pf2_fiscal_collectes_source_url_check;
alter table public.pf2_fiscal_collectes
    add constraint pf2_fiscal_collectes_source_url_check check (
        (source = 'openfisca_bareme_ir' and source_url =
            'https://api.fr.openfisca.org/latest/parameter/impot_revenu/bareme_ir_depuis_1945/bareme')
        or (source = 'openfisca_parametres' and source_url =
            'https://api.fr.openfisca.org/latest/parameter')
        -- BOFiP : permalien verrouillé sur la version lue, ou adresse courte de la
        -- version en vigueur (redirigée sur le même hôte par le pont Android).
        or (source in ('dgfip_bofip_ir', 'dgfip_bofip_decote', 'dgfip_bofip_qf') and (
                source_url ~ '^https://bofip\.impots\.gouv\.fr/bofip/[0-9]+-PGP\.html/identifiant=BOI-IR-LIQ-20-[0-9-]+-[0-9]{8}$'
             or source_url ~ '^https://bofip\.impots\.gouv\.fr/doctrine/BOI-IR-LIQ-20-[0-9-]+$'))
        -- Aides du simulateur : répertoire de l'année de DÉCLARATION (revenus + 1).
        or (source = 'dgfip_frais' and
                source_url ~ '^https://simulateur-ir-ifi\.impots\.gouv\.fr/calcul_impot/[0-9]{4}/aides/frais\.htm$')
        or (source = 'dgfip_frais_repas' and (
                source_url ~ '^https://simulateur-ir-ifi\.impots\.gouv\.fr/calcul_impot/[0-9]{4}/aides/frais\.htm$'
             or source_url = 'https://www.impots.gouv.fr/particulier/frais-de-repas'))
        or (source = 'dgfip_regimes_titres' and
                source_url ~ '^https://simulateur-ir-ifi\.impots\.gouv\.fr/calcul_impot/[0-9]{4}/aides/gains\.htm$')
        -- Brochures IR : chapitre du sommaire de la brochure de l'année de déclaration.
        or (source in ('dgfip_brochure_rcm', 'dgfip_brochure_charges',
                       'dgfip_brochure_plus_values', 'dgfip_nouveautes') and
                source_url ~ '^https://www\.impots\.gouv\.fr/www2/fichiers/documentation/brochure/ir_[0-9]{4}/pdf_som/[A-Za-z0-9._-]+\.pdf$')
        -- Notice 2086 : soit dans le sommaire de la brochure, soit avec le formulaire.
        or (source = 'dgfip_notice_2086' and (
                source_url ~ '^https://www\.impots\.gouv\.fr/www2/fichiers/documentation/brochure/ir_[0-9]{4}/pdf_som/2086\.pdf$'
             or source_url ~ '^https://www\.impots\.gouv\.fr/sites/default/files/formulaires/2086/[0-9]{4}/2086_[0-9]+\.pdf$'))
    );

commit;

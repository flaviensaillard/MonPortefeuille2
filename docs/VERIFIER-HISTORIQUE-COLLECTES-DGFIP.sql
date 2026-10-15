-- ============================================================================
--  SONDE EN LECTURE SEULE — « Est-ce que mes collectes DGFiP s'écrivent bien
--  dans ma table Supabase ? »
-- ============================================================================
--
--  À coller dans Supabase SQL Editor, puis Run. Aucune saisie, aucun secret.
--
--  Ce fichier ne contient QU'UNE SEULE instruction SELECT : aucune écriture,
--  aucune modification de structure, aucun droit touché. C'est vérifié par
--  `tests/test_verifier_collectes_dgfip.py`, qui rejoue la sonde sur un
--  PostgreSQL réel dans les deux états de la base (013 absente, puis 013
--  appliquée) et interdit tout mot-clé d'écriture.
--
--  Aucune donnée personnelle n'est affichée : ni user_id, ni montant, ni
--  adresse de document, ni taux de prélèvement à la source. La sonde ne montre
--  que des comptes, des noms de sources et des droits.
--
--  Prérequis : les migrations 009 et 010 ont été appliquées (c'est le cas,
--  elles l'ont été le 12/10/2026). Si la table est absente, l'éditeur le dira —
--  et ce sera déjà la réponse.
--
--  LECTURE DU RÉSULTAT
--  -------------------
--  Ligne 1  NON  → la migration 013 n'est pas appliquée : l'APK ne PEUT PAS
--                   écrire de collecte DGFiP, la base la refuserait. Exécuter
--                   `migrations/013_collectes_dgfip.sql` (une seule fois, après
--                   012, après sauvegarde chiffrée récente restaurée et
--                   comparée).
--  Ligne 1  OUI  → la base accepte les sources DGFiP.
--  Ligne 4  0    → aucune collecte DGFiP n'a encore été historisée. C'est
--                   attendu tant qu'aucune APK contenant
--                   `js/fiscal_historique_supabase.js` n'a été installée et
--                   qu'aucun clic sur le bouton de collecte n'a suivi.
--  Ligne 6/7     → les droits de l'APK doivent rester : écriture + lecture sur
--                   l'historique de collecte, LECTURE SEULE sur les règles
--                   publiées. Toute autre valeur signifie que la sécurité de la
--                   table a changé.
--  Ligne 9  0    → aucune clé personnelle dans les lignes DGFiP.
-- ============================================================================

with sources_attendues(n) as (
    values ('dgfip_bofip_ir'), ('dgfip_bofip_decote'), ('dgfip_bofip_qf'),
           ('dgfip_frais'), ('dgfip_frais_repas'), ('dgfip_regimes_titres'),
           ('dgfip_brochure_rcm'), ('dgfip_brochure_charges'),
           ('dgfip_brochure_plus_values'), ('dgfip_notice_2086'),
           ('dgfip_nouveautes')
), contrainte_source as (
    -- Nom stable : 009 la crée implicitement sous ce nom, 012 puis 013 la
    -- recréent sous le même nom. Son texte dit exactement ce qui est autorisé.
    select coalesce(max(pg_get_constraintdef(c.oid)), '') as def
      from pg_constraint c
     where c.conrelid = to_regclass('public.pf2_fiscal_collectes')
       and c.conname = 'pf2_fiscal_collectes_source_check'
), droits as (
    select r.table_name as table_name,
           string_agg(r.privilege_type, ', ' order by r.privilege_type) as privileges
      from information_schema.role_table_grants r
     where r.table_schema = 'public'
       and r.table_name in ('pf2_fiscal_collectes', 'pf2_fiscal_annees')
       and r.grantee = 'authenticated'
     group by r.table_name
), rls as (
    select count(*) as activees
      from pg_class t
     where t.oid in (to_regclass('public.pf2_fiscal_collectes'),
                     to_regclass('public.pf2_fiscal_annees'))
       and t.relrowsecurity
)
select 1 as ordre,
       'Migration 013 appliquée (sources DGFiP autorisées par la base)' as controle,
       case when def like '%dgfip\_bofip\_ir%' escape '\' then 'OUI'
            else 'NON - executer migrations/013_collectes_dgfip.sql' end as resultat
  from contrainte_source
union all
select 2, 'Sources DGFiP autorisées (attendu : 11 sur 11)',
       (select count(*)::text from sources_attendues s, contrainte_source c
         where position(s.n in c.def) > 0)
union all
select 3, 'Sources OpenFisca historiques toujours autorisées (attendu : 2 sur 2)',
       (select count(*)::text
          from (values ('openfisca_bareme_ir'), ('openfisca_parametres')) as o(n),
               contrainte_source c
         where position(o.n in c.def) > 0)
union all
select 4, 'Lignes de collecte DGFiP déjà historisées',
       (select count(*)::text from public.pf2_fiscal_collectes
         where source like 'dgfip\_%' escape '\')
union all
select 5, 'Millésimes de revenus historisés en DGFiP',
       coalesce((select string_agg(distinct annee_revenus::text, ', '
                                    order by annee_revenus::text)
                   from public.pf2_fiscal_collectes
                  where source like 'dgfip\_%' escape '\'), 'aucun')
union all
select 6, 'Droits de l''APK sur l''historique de collecte (attendu : INSERT, SELECT)',
       coalesce((select privileges from droits
                  where table_name = 'pf2_fiscal_collectes'), 'aucun')
union all
select 7, 'Droits de l''APK sur les règles publiées (attendu : SELECT seul)',
       coalesce((select privileges from droits
                  where table_name = 'pf2_fiscal_annees'), 'aucun')
union all
select 8, 'Tables fiscales protégées par RLS (attendu : 2)',
       (select activees::text from rls)
union all
select 9, 'Clés personnelles dans les lignes DGFiP (attendu : 0)',
       (select count(*)::text
          from public.pf2_fiscal_collectes f
         where f.source like 'dgfip\_%' escape '\'
           and exists (select 1 from jsonb_object_keys(f.valeurs) as k
                        where k in ('numeroFiscal', 'tauxPas', 'tauxPersonnalise',
                                    'nom', 'prenom', 'adresse', 'email', 'siren',
                                    'user_id', 'declarant', 'conjoint')))
order by ordre;

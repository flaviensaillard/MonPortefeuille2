-- ===========================================================================
-- MonPortefeuille 2.1.0 — complétude des snapshots
-- (revue 2.0.1, constats D-01 / F-20)
--
-- Un snapshot dont la valorisation est incomplète (cours manquant, liquidité
-- sans taux) est écrit — il reste visible et alerté — mais porte
-- `complet = false` et la liste des composants manquants. Les séries de
-- performance (TWR, retraite) excluent les points partiels : un point faux
-- vaut mieux dehors qu'à moitié dedans.
--
-- À exécuter dans Supabase : SQL Editor > New query > coller ce fichier > Run.
-- Prérequis : 001_init.sql. Indépendant de 004_auth_rls.sql.
-- IDEMPOTENT : rejouable sans erreur.
-- ===========================================================================

alter table pf2_snapshots add column if not exists complet boolean not null default true;
alter table pf2_snapshots add column if not exists manquantes text;

comment on column pf2_snapshots.complet is
  'true si toutes les composantes (positions, liquidités, taux) sont valorisées ; '
  'false si le point est partiel. Les points partiels sont exclus des séries TWR.';
comment on column pf2_snapshots.manquantes is
  'Liste lisible des composants non valorisés (tickers, devises) quand complet = false.';

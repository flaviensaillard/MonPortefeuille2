-- ===========================================================================
-- MonPortefeuille 2 — schéma initial
--
-- Ces tables sont NOUVELLES. Les tables de la v1 (Config, Donnees, Transaction,
-- Historique, Inflation, Projections) ne sont pas touchées : la v1 continue de
-- fonctionner pendant la transition, et la migration est réversible par simple
-- suppression de ce schéma.
--
-- À exécuter dans l'éditeur SQL de Supabase.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Transactions : l'unique source de vérité.
--
-- La v1 tenait les quantités dans une table `Donnees` remplie à la main, en
-- parallèle de `Transaction`. Les deux pouvaient diverger. Ici, les positions
-- sont un RÉSULTAT calculé depuis cette table. Rien d'autre n'est à saisir.
-- ---------------------------------------------------------------------------
create table if not exists pf2_transactions (
    id            bigint generated always as identity primary key,
    ticker        text        not null,
    sens          text        not null check (sens in ('achat', 'vente')),
    date          date        not null,
    quantite      numeric     not null check (quantite > 0),
    cours         numeric     not null check (cours > 0),
    frais         numeric     not null default 0 check (frais >= 0),
    devise        text        not null,   -- devise de cotation du titre
    source        text        default 'manuel',  -- 'manuel' | 'swissquote' | 'revolut'
    reference     text,                    -- référence du relevé d'origine
    note          text,
    cree_le       timestamptz default now()
);

create index if not exists pf2_transactions_date_idx   on pf2_transactions (date);
create index if not exists pf2_transactions_ticker_idx on pf2_transactions (ticker);

-- Anti-doublon : même titre, même sens, même date, même quantité, même cours.
-- Protège des imports rejoués.
create unique index if not exists pf2_transactions_dedup_idx
    on pf2_transactions (ticker, sens, date, quantite, cours);

-- ---------------------------------------------------------------------------
-- Apports de fonds propres (et retraits).
-- `montant_or` est le nombre d'onces que l'apport représentait au cours du jour :
-- la v1 le collectait et ne s'en servait jamais. La v2 en fait une métrique.
-- ---------------------------------------------------------------------------
create table if not exists pf2_apports (
    id          bigint generated always as identity primary key,
    date        date        not null,
    sens        text        not null check (sens in ('apport', 'retrait')),
    montant_eur numeric     not null,
    montant_or  numeric,                  -- onces d'or au cours du jour
    cours_or    numeric,                  -- cours de l'or retenu (traçabilité)
    compte      text,                     -- 'swissquote' | 'revolut' | 'livret_chf'
    reference   text,
    note        text,
    cree_le     timestamptz default now()
);

create index if not exists pf2_apports_date_idx on pf2_apports (date);

-- ---------------------------------------------------------------------------
-- Snapshots quotidiens, écrits par GitHub Actions.
-- `valeur_or_equivalent` = valeur du portefeuille investi exprimée en onces.
-- C'est la métrique de référence de Gave : pas des euros, des onces.
-- ---------------------------------------------------------------------------
create table if not exists pf2_snapshots (
    id                     bigint generated always as identity primary key,
    date                   date        not null unique,
    patrimoine_total_eur   numeric     not null,
    patrimoine_investi_eur numeric     not null,
    precaution_eur         numeric     not null default 0,
    courant_eur            numeric     not null default 0,
    cours_or_usd           numeric,
    equivalent_or_oz       numeric,    -- patrimoine_investi_eur / cours_or
    poche_rv_eur           numeric,
    poche_energie_eur      numeric,
    poche_asie_eur         numeric,
    poche_jgb_eur          numeric,
    cree_le                timestamptz default now()
);

create index if not exists pf2_snapshots_date_idx on pf2_snapshots (date);

-- ---------------------------------------------------------------------------
-- Cours du jour (cache). Le robot les rafraîchit ; l'app les lit.
-- ---------------------------------------------------------------------------
create table if not exists pf2_cours (
    ticker      text        not null,
    date        date        not null,
    cours       numeric     not null,
    devise      text        not null,
    variation   numeric,                -- variation du jour, en %
    primary key (ticker, date)
);

-- ---------------------------------------------------------------------------
-- Taux de change du jour (cache).
-- ---------------------------------------------------------------------------
create table if not exists pf2_fx (
    devise      text        not null,
    contre      text        not null default 'EUR',
    date        date        not null,
    taux        numeric     not null,
    primary key (devise, contre, date)
);

-- ---------------------------------------------------------------------------
-- Inflation annuelle, en %.
--
-- ATTENTION : la v1 avait une ligne 2026 à 0,00 % et l'appliquait telle quelle,
-- ce qui rendait la performance réelle de l'année en cours égale à la nominale.
-- Ici, une année sans donnée est absente de la table, et l'application le dit.
-- ---------------------------------------------------------------------------
create table if not exists pf2_inflation (
    annee       int primary key,
    inflation   numeric     not null,   -- en %, ex. 2.0 pour 2 %
    source      text,
    maj_le      timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- Alertes (fiscales, rééquilibrage, données manquantes).
-- ---------------------------------------------------------------------------
create table if not exists pf2_alertes (
    id          bigint generated always as identity primary key,
    date        timestamptz not null default now(),
    titre       text        not null,
    message     text        not null,
    niveau      text        not null default 'info'
                check (niveau in ('info', 'attention', 'critique')),
    lue         boolean     default false
);

create index if not exists pf2_alertes_date_idx on pf2_alertes (date desc);

-- ---------------------------------------------------------------------------
-- Sécurité : la v1 exposait ses credentials en dur dans un repo public.
-- On révoque l'ancienne clé publishable et on repart de zéro.
-- À faire AVANT le premier déploiement.
-- ---------------------------------------------------------------------------
-- 1. Supabase > Settings > API > révoquer l'ancienne clé publishable
--    (elle était commitée dans take_snapshot.py et calc_perf.py de la v1).
-- 2. Créer une nouvelle clé publishable.
-- 3. La stocker dans les secrets GitHub (SUPABASE_URL, SUPABASE_KEY) et dans
--    .streamlit/secrets.toml — jamais dans le code.
-- 4. Activer RLS sur chaque table et n'autoriser que le rôle de service, ou
--    verrouiller par politique si l'app est publique.

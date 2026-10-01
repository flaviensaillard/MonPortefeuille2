-- Correctif RLS — à exécuter une seule fois dans Supabase.
-- SQL Editor > New query > coller ceci > Run.
-- Idempotent : vous pouvez le relancer sans risque.

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- ATTENTION : ce bloc manquait, et il manquait d'une façon particulièrement
-- traître. Les tables `pf2_` ont été créées avec RLS actif. Sans aucune
-- politique, PostgreSQL refuse toute ÉCRITURE avec la clé publique :
--
--     42501  new row violates row-level security policy for table "pf2_..."
--
-- mais les LECTURES, elles, aboutissent — en renvoyant zéro ligne. Le
-- contrôle d'existence du code interroge `select("*").limit(1)` et conclut
-- « la table est là », alors qu'elle est simplement illisible en écriture.
-- D'où un import qui passe tous ses contrôles puis échoue au premier INSERT.
--
-- Ce bloc accorde les quatre opérations aux rôles `anon` (clé publique) et
-- `authenticated`. Portée strictement limitée aux tables `pf2_` : les tables
-- de la v1 (`Transaction`, `Historique`, `Donnees`...) ne sont pas touchées.
--
-- Ce que ça implique, en clair : quiconque détient la clé publique peut lire
-- et écrire ces sept tables. Cette clé ne doit donc JAMAIS être commitée dans
-- le dépôt — elle vit dans les secrets GitHub et dans les secrets Streamlit,
-- qui sont privés et côtés serveur.

alter table pf2_transactions enable row level security;
alter table pf2_apports enable row level security;
alter table pf2_snapshots enable row level security;
alter table pf2_cours enable row level security;
alter table pf2_fx enable row level security;
alter table pf2_inflation enable row level security;
alter table pf2_alertes enable row level security;

drop policy if exists pf2_acces_public on pf2_transactions;
create policy pf2_acces_public on pf2_transactions
    for all
    to anon, authenticated
    using (true)
    with check (true);

drop policy if exists pf2_acces_public on pf2_apports;
create policy pf2_acces_public on pf2_apports
    for all
    to anon, authenticated
    using (true)
    with check (true);

drop policy if exists pf2_acces_public on pf2_snapshots;
create policy pf2_acces_public on pf2_snapshots
    for all
    to anon, authenticated
    using (true)
    with check (true);

drop policy if exists pf2_acces_public on pf2_cours;
create policy pf2_acces_public on pf2_cours
    for all
    to anon, authenticated
    using (true)
    with check (true);

drop policy if exists pf2_acces_public on pf2_fx;
create policy pf2_acces_public on pf2_fx
    for all
    to anon, authenticated
    using (true)
    with check (true);

drop policy if exists pf2_acces_public on pf2_inflation;
create policy pf2_acces_public on pf2_inflation
    for all
    to anon, authenticated
    using (true)
    with check (true);

drop policy if exists pf2_acces_public on pf2_alertes;
create policy pf2_acces_public on pf2_alertes
    for all
    to anon, authenticated
    using (true)
    with check (true);

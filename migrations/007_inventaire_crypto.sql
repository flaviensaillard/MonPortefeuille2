-- 2.1.0 (revue 2.0.1, constat T-02 / priorité 5) : inventaire des crypto-actifs
-- détenus HORS des transactions suivies par l'application.
--
-- L'article 150 VH bis du CGI fixe la valeur globale du portefeuille crypto à la
-- date de cession : tous les crypto-actifs détenus par le cédant, toutes
-- plateformes et tous wallets confondus. Sans cette table, le dénominateur du
-- 2086 ignorait tout ce qui n'était pas saisi dans l'application.
--
-- Une ligne = un SOLDE DE RÉFÉRENCE hors application, à une date :
--   - quantite             : quantité détenue à cette date ;
--   - cout_acquisition_eur : prix d'acquisition cumulé de cette position (EUR) ;
--   - source               : plateforme ou wallet (ex. « Kraken », « Ledger »).
-- Le solde valable à une date de cession est le plus récent au plus tard à cette date.
--
-- Donnée personnelle : même protection que les autres tables pf2_ (migration 004).

create table if not exists pf2_inventaire_crypto (
    id bigserial primary key,
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    date date not null,
    actif text not null,
    quantite numeric not null check (quantite >= 0),
    cout_acquisition_eur numeric not null check (cout_acquisition_eur >= 0),
    source text not null default '',
    created_at timestamptz not null default now()
);

create index if not exists pf2_inventaire_crypto_user_actif_date
    on pf2_inventaire_crypto (user_id, actif, date);

alter table pf2_inventaire_crypto enable row level security;

drop policy if exists inventaire_crypto_select on pf2_inventaire_crypto;
create policy inventaire_crypto_select on pf2_inventaire_crypto
    for select to authenticated using (auth.uid() = user_id);

drop policy if exists inventaire_crypto_insert on pf2_inventaire_crypto;
create policy inventaire_crypto_insert on pf2_inventaire_crypto
    for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists inventaire_crypto_update on pf2_inventaire_crypto;
create policy inventaire_crypto_update on pf2_inventaire_crypto
    for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists inventaire_crypto_delete on pf2_inventaire_crypto;
create policy inventaire_crypto_delete on pf2_inventaire_crypto
    for delete to authenticated using (auth.uid() = user_id);

-- Aucun droit pour les visiteurs anonymes ; les seuls utilisateurs authentifiés
-- accèdent à leurs lignes (RLS ci-dessus).
revoke all on pf2_inventaire_crypto from public, anon;
grant select, insert, update, delete on pf2_inventaire_crypto to authenticated;
grant usage, select on sequence pf2_inventaire_crypto_id_seq to authenticated;

-- ===========================================================================
-- MonPortefeuille 2.1.0 — SÉCURITÉ : fin des politiques `USING (true)`
-- (revue 2.0.1, constat S-01, BLOQUANT)
--
-- Ce que fait cette migration :
--   1. chaque table `pf2_` reçoit une colonne `user_id` (propriétaire) ;
--   2. les lignes existantes sont rattachées à VOTRE compte Supabase ;
--   3. les politiques publiques `pf2_acces_public` (SELECT/INSERT/UPDATE/DELETE
--      pour `anon`) sont SUPPRIMÉES et remplacées par des politiques par
--      opération, par utilisateur : `auth.uid() = user_id` ;
--   4. les écritures couplées (titre + mouvement de compte, apport + mouvement)
--      passent par des fonctions RPC PostgreSQL transactionnelles :
--      pf2_enregistrer_transaction / pf2_modifier_transaction /
--      pf2_enregistrer_apport / pf2_modifier_apport.
--
-- CONSÉQUENCE VOLONTAIRE : la clé publishable (`anon`) ne donne plus AUCUN
-- accès — ni lecture, ni écriture. Un client doit s'authentifier (Supabase
-- Auth, écran de connexion de l'application 2.1.0). Les APK ≤ 2.0.1 ne peuvent
-- plus ni lire ni écrire : c'est le but de la migration.
--
-- MODE D'EMPLOI (Supabase > SQL Editor > New query > Run). L'ordre complet de
-- la mise en service est la checklist du § 1 de telechargements/notes-2.1.0.md.
--   ÉTAPE 1 — le compte propriétaire existe AVANT ce script : Authentication >
--             Users > Add user > Create new user, e-mail et mot de passe, case
--             « Auto Confirm User » cochée. (Ce script attache les lignes
--             existantes à un uid : sans compte, il n'y a pas d'uid.)
--   ÉTAPE 2 — copiez son uid (Authentication > Users > colonne User UID) et
--             remplacez <VOTRE-UID> dans la ligne « select set_config » ci-dessous.
--   ÉTAPE 3 — exécutez CE fichier seul, puis 005, 006, 007, puis 008 (même uid).
--
-- IDEMPOTENT : chaque instruction peut être rejouée sans erreur.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 0. Le propriétaire des lignes existantes. REMPLACEZ <VOTRE-UID>.
--    `set_config(..., false)` : valable pour la session (le script entier).
-- ---------------------------------------------------------------------------
select set_config('pf2.owner_uid', '<VOTRE-UID>', false);


-- ---------------------------------------------------------------------------
-- 1. Colonne propriétaire sur les neuf tables pf2_.
--    Valeur par défaut `auth.uid()` : une écriture authentisée qui n'indique
--    pas `user_id` reçoit automatiquement l'uid de l'appelant.
-- ---------------------------------------------------------------------------
alter table pf2_transactions      add column if not exists user_id uuid default auth.uid();
alter table pf2_apports           add column if not exists user_id uuid default auth.uid();
alter table pf2_snapshots         add column if not exists user_id uuid default auth.uid();
alter table pf2_cours             add column if not exists user_id uuid default auth.uid();
alter table pf2_fx                add column if not exists user_id uuid default auth.uid();
alter table pf2_inflation         add column if not exists user_id uuid default auth.uid();
alter table pf2_alertes           add column if not exists user_id uuid default auth.uid();
alter table pf2_comptes           add column if not exists user_id uuid default auth.uid();
alter table pf2_operations_compte add column if not exists user_id uuid default auth.uid();

-- Idempotence des écritures couplées côté serveur (rejeu après timeout) :
-- une commande rejouée avec la même clé ne réécrit pas.
alter table pf2_transactions add column if not exists idempotence uuid;
alter table pf2_apports      add column if not exists idempotence uuid;

create unique index if not exists pf2_transactions_idempotence_idx
    on pf2_transactions (user_id, idempotence) where idempotence is not null;
create unique index if not exists pf2_apports_idempotence_idx
    on pf2_apports (user_id, idempotence) where idempotence is not null;


-- ---------------------------------------------------------------------------
-- 2. Rattachement des lignes existantes à votre compte.
--    Si une ligne n'a toujours pas de propriétaire et que pf2.owner_uid n'est
--    pas défini (placeholder non remplacé), le script ÉCHOUE avec un message
--    explicite : on ne laisse jamais de données sans propriétaire.
-- ---------------------------------------------------------------------------
do $$
declare
    v_owner uuid;
    v_orphelines bigint;
begin
    begin
        v_owner := nullif(trim(current_setting('pf2.owner_uid', true)), '')::uuid;
    exception when others then
        v_owner := null;
    end;

    select count(*) into v_orphelines
    from (
        select user_id from pf2_transactions union all
        select user_id from pf2_apports union all
        select user_id from pf2_snapshots union all
        select user_id from pf2_cours union all
        select user_id from pf2_fx union all
        select user_id from pf2_inflation union all
        select user_id from pf2_alertes union all
        select user_id from pf2_comptes union all
        select user_id from pf2_operations_compte
    ) t
    where user_id is null;

    -- Le uid est OBLIGATOIRE, même si aucune ligne n'est à rattacher : un
    -- marqueur non remplacé arrête le script ici (notes de version 2.1.0, § 1, étape 3).
    if v_owner is null then
        raise exception
          'uid du propriétaire absent ou invalide : remplacez la valeur de pf2.owner_uid en tête de script par l''uid de votre compte (Supabase > Authentication > Users > User UID), puis relancez. Lignes à rattacher : %.', v_orphelines;
    end if;

    if v_owner is not null then
        update pf2_transactions      set user_id = v_owner where user_id is null;
        update pf2_apports           set user_id = v_owner where user_id is null;
        update pf2_snapshots         set user_id = v_owner where user_id is null;
        update pf2_cours             set user_id = v_owner where user_id is null;
        update pf2_fx                set user_id = v_owner where user_id is null;
        update pf2_inflation         set user_id = v_owner where user_id is null;
        update pf2_alertes           set user_id = v_owner where user_id is null;
        update pf2_comptes           set user_id = v_owner where user_id is null;
        update pf2_operations_compte set user_id = v_owner where user_id is null;
    end if;
end $$;

-- Après rattachement : personne ne peut posséder « personne ». Toute écriture
-- future devra porter un propriétaire authentifié (ou passer par la service
-- role, qui fournit user_id explicitement).
alter table pf2_transactions      alter column user_id set not null;
alter table pf2_apports           alter column user_id set not null;
alter table pf2_snapshots         alter column user_id set not null;
alter table pf2_cours             alter column user_id set not null;
alter table pf2_fx                alter column user_id set not null;
alter table pf2_inflation         alter column user_id set not null;
alter table pf2_alertes           alter column user_id set not null;
alter table pf2_comptes           alter column user_id set not null;
alter table pf2_operations_compte alter column user_id set not null;

-- Cohérence référentielle avec les comptes Supabase (une ligne ne peut pas
-- appartenir à un utilisateur qui n'existe pas).
do $$
declare t text;
begin
    foreach t in array array[
        'pf2_transactions', 'pf2_apports', 'pf2_snapshots', 'pf2_cours',
        'pf2_fx', 'pf2_inflation', 'pf2_alertes', 'pf2_comptes',
        'pf2_operations_compte'
    ]
    loop
        if not exists (
            select 1 from pg_constraint
            where conname = t || '_user_fk' and conrelid = t::regclass
        ) then
            execute format(
                'alter table %I add constraint %I foreign key (user_id) references auth.users (id)',
                t, t || '_user_fk'
            );
        end if;
    end loop;
end $$;


-- ---------------------------------------------------------------------------
-- 3. Fin des politiques publiques. RLS reste actif ; chaque opération a sa
--    politique, limitée à l'utilisateur connecté. `anon` n'a plus rien :
--    sans politique applicable, SELECT renvoie zéro ligne et toute écriture
--    est refusée (42501).
-- ---------------------------------------------------------------------------
alter table pf2_transactions enable row level security;
alter table pf2_apports enable row level security;
alter table pf2_snapshots enable row level security;
alter table pf2_cours enable row level security;
alter table pf2_fx enable row level security;
alter table pf2_inflation enable row level security;
alter table pf2_alertes enable row level security;
alter table pf2_comptes enable row level security;
alter table pf2_operations_compte enable row level security;

drop policy if exists pf2_acces_public on pf2_transactions;
drop policy if exists pf2_acces_public on pf2_apports;
drop policy if exists pf2_acces_public on pf2_snapshots;
drop policy if exists pf2_acces_public on pf2_cours;
drop policy if exists pf2_acces_public on pf2_fx;
drop policy if exists pf2_acces_public on pf2_inflation;
drop policy if exists pf2_acces_public on pf2_alertes;
drop policy if exists pf2_acces_public on pf2_comptes;
drop policy if exists pf2_acces_public on pf2_operations_compte;

-- Génère les quatre politiques d'une table (select / insert / update / delete).
do $$
declare t text;
begin
    foreach t in array array[
        'pf2_transactions', 'pf2_apports', 'pf2_snapshots', 'pf2_cours',
        'pf2_fx', 'pf2_inflation', 'pf2_alertes', 'pf2_comptes',
        'pf2_operations_compte'
    ]
    loop
        execute format('drop policy if exists pf2_select_proprietaire on %I', t);
        execute format('drop policy if exists pf2_insert_proprietaire on %I', t);
        execute format('drop policy if exists pf2_update_proprietaire on %I', t);
        execute format('drop policy if exists pf2_delete_proprietaire on %I', t);

        execute format(
            'create policy pf2_select_proprietaire on %I for select to authenticated
             using (auth.uid() = user_id)', t);
        execute format(
            'create policy pf2_insert_proprietaire on %I for insert to authenticated
             with check (auth.uid() = user_id)', t);
        execute format(
            'create policy pf2_update_proprietaire on %I for update to authenticated
             using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
        execute format(
            'create policy pf2_delete_proprietaire on %I for delete to authenticated
             using (auth.uid() = user_id)', t);
    end loop;
end $$;


-- ---------------------------------------------------------------------------
-- 4. Écritures couplées ATOMIQUES (revue D-03) : la transaction de titre et
--    son mouvement de compte sont écrits dans UNE fonction PostgreSQL — une
--    seule transaction, impossible de n'écrire que la moitié. Les fonctions
--    sont SECURITY DEFINER (elles s'exécutent avec les droits du propriétaire
--    de la base, donc au-dessus de RLS) : elles appliquent donc elles-mêmes la
--    règle de propriété, systématiquement, avec auth.uid().
-- ---------------------------------------------------------------------------

create or replace function pf2_enregistrer_transaction(
    p_ticker text, p_sens text, p_date date, p_quantite numeric, p_cours numeric,
    p_frais numeric default 0, p_devise text default null, p_source text default 'appli',
    p_reference text default null, p_note text default null,
    p_compte_id text default null, p_montant_operation numeric default null,
    p_type_operation text default null, p_date_operation date default null,
    p_note_operation text default null, p_idempotence uuid default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
    v_tx_id bigint;
    v_op_id bigint;
begin
    if auth.uid() is null then
        raise exception 'authentification requise';
    end if;

    if p_idempotence is not null
       and exists (select 1 from pf2_transactions
                   where user_id = auth.uid() and idempotence = p_idempotence) then
        return jsonb_build_object('ok', true, 'deja_ecrit', true);
    end if;

    insert into pf2_transactions
        (user_id, ticker, sens, date, quantite, cours, frais, devise, source,
         reference, note, idempotence)
    values
        (auth.uid(), p_ticker, p_sens, p_date, p_quantite, p_cours,
         coalesce(p_frais, 0), p_devise, coalesce(p_source, 'appli'),
         p_reference, p_note, p_idempotence)
    returning id into v_tx_id;

    if p_compte_id is not null then
        if not exists (select 1 from pf2_comptes
                       where id = p_compte_id and user_id = auth.uid()) then
            raise exception 'compte introuvable ou appartenant à un autre utilisateur';
        end if;
        insert into pf2_operations_compte
            (user_id, compte_id, type, montant, date, transaction_id, note)
        values
            (auth.uid(), p_compte_id, p_type_operation, p_montant_operation,
             coalesce(p_date_operation, p_date), v_tx_id, p_note_operation)
        returning id into v_op_id;
    end if;

    return jsonb_build_object('ok', true, 'transaction_id', v_tx_id,
                              'operation_id', v_op_id);
end $$;


create or replace function pf2_modifier_transaction(
    p_tx_id bigint,
    p_ticker text, p_sens text, p_date date, p_quantite numeric, p_cours numeric,
    p_frais numeric default 0, p_devise text default null, p_source text default 'appli',
    p_reference text default null, p_note text default null,
    p_compte_id text default null, p_operation_id bigint default null,
    p_montant_operation numeric default null, p_type_operation text default null,
    p_date_operation date default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
    if auth.uid() is null then
        raise exception 'authentification requise';
    end if;

    if not exists (select 1 from pf2_transactions
                   where id = p_tx_id and user_id = auth.uid()) then
        raise exception 'transaction introuvable ou appartenant à un autre utilisateur';
    end if;

    update pf2_transactions
       set ticker = p_ticker, sens = p_sens, date = p_date, quantite = p_quantite,
           cours = p_cours, frais = coalesce(p_frais, 0), devise = p_devise,
           source = coalesce(p_source, 'appli'), reference = p_reference, note = p_note
     where id = p_tx_id and user_id = auth.uid();

    if p_compte_id is not null then
        if not exists (select 1 from pf2_comptes
                       where id = p_compte_id and user_id = auth.uid()) then
            raise exception 'compte introuvable ou appartenant à un autre utilisateur';
        end if;
        if p_operation_id is not null then
            if not exists (select 1 from pf2_operations_compte
                           where id = p_operation_id and user_id = auth.uid()
                             and transaction_id = p_tx_id) then
                raise exception 'opération introuvable pour cette transaction';
            end if;
            update pf2_operations_compte
               set compte_id = p_compte_id, montant = p_montant_operation,
                   date = coalesce(p_date_operation, p_date), type = p_type_operation
             where id = p_operation_id and user_id = auth.uid();
        else
            insert into pf2_operations_compte
                (user_id, compte_id, type, montant, date, transaction_id)
            values
                (auth.uid(), p_compte_id, p_type_operation, p_montant_operation,
                 coalesce(p_date_operation, p_date), p_tx_id);
        end if;
    end if;

    return jsonb_build_object('ok', true);
end $$;


create or replace function pf2_enregistrer_apport(
    p_date date, p_sens text, p_montant_eur numeric,
    p_montant_or numeric default null, p_cours_or numeric default null,
    p_compte text default null, p_reference text default null,
    p_compte_id text default null, p_montant_operation numeric default null,
    p_type_operation text default null, p_date_operation date default null,
    p_idempotence uuid default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
    v_apport_id bigint;
    v_op_id bigint;
begin
    if auth.uid() is null then
        raise exception 'authentification requise';
    end if;

    if p_idempotence is not null
       and exists (select 1 from pf2_apports
                   where user_id = auth.uid() and idempotence = p_idempotence) then
        return jsonb_build_object('ok', true, 'deja_ecrit', true);
    end if;

    insert into pf2_apports
        (user_id, date, sens, montant_eur, montant_or, cours_or, compte, reference, idempotence)
    values
        (auth.uid(), p_date, p_sens, p_montant_eur, p_montant_or, p_cours_or,
         p_compte, p_reference, p_idempotence)
    returning id into v_apport_id;

    if p_compte_id is not null then
        if not exists (select 1 from pf2_comptes
                       where id = p_compte_id and user_id = auth.uid()) then
            raise exception 'compte introuvable ou appartenant à un autre utilisateur';
        end if;
        insert into pf2_operations_compte
            (user_id, compte_id, type, montant, date, apport_id)
        values
            (auth.uid(), p_compte_id, p_type_operation, p_montant_operation,
             coalesce(p_date_operation, p_date), v_apport_id)
        returning id into v_op_id;
    end if;

    return jsonb_build_object('ok', true, 'apport_id', v_apport_id,
                              'operation_id', v_op_id);
end $$;


create or replace function pf2_modifier_apport(
    p_apport_id bigint,
    p_date date, p_sens text, p_montant_eur numeric,
    p_montant_or numeric default null, p_cours_or numeric default null,
    p_compte text default null, p_reference text default null,
    p_compte_id text default null, p_operation_id bigint default null,
    p_montant_operation numeric default null, p_type_operation text default null,
    p_date_operation date default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
    if auth.uid() is null then
        raise exception 'authentification requise';
    end if;

    if not exists (select 1 from pf2_apports
                   where id = p_apport_id and user_id = auth.uid()) then
        raise exception 'apport introuvable ou appartenant à un autre utilisateur';
    end if;

    update pf2_apports
       set date = p_date, sens = p_sens, montant_eur = p_montant_eur,
           montant_or = p_montant_or, cours_or = p_cours_or,
           compte = p_compte, reference = p_reference
     where id = p_apport_id and user_id = auth.uid();

    if p_compte_id is not null then
        if not exists (select 1 from pf2_comptes
                       where id = p_compte_id and user_id = auth.uid()) then
            raise exception 'compte introuvable ou appartenant à un autre utilisateur';
        end if;
        if p_operation_id is not null then
            if not exists (select 1 from pf2_operations_compte
                           where id = p_operation_id and user_id = auth.uid()
                             and apport_id = p_apport_id) then
                raise exception 'opération introuvable pour cet apport';
            end if;
            update pf2_operations_compte
               set compte_id = p_compte_id, montant = p_montant_operation,
                   date = coalesce(p_date_operation, p_date), type = p_type_operation
             where id = p_operation_id and user_id = auth.uid();
        else
            insert into pf2_operations_compte
                (user_id, compte_id, type, montant, date, apport_id)
            values
                (auth.uid(), p_compte_id, p_type_operation, p_montant_operation,
                 coalesce(p_date_operation, p_date), p_apport_id);
        end if;
    end if;

    return jsonb_build_object('ok', true);
end $$;


-- Exécution des RPC : refusée à `anon` et au public, accordée aux seuls
-- utilisateurs authentifiés. La fonction vérifie elle-même la propriété.
revoke all on function pf2_enregistrer_transaction(text, text, date, numeric, numeric, numeric, text, text, text, text, text, numeric, text, date, text, uuid) from public, anon;
revoke all on function pf2_modifier_transaction(bigint, text, text, date, numeric, numeric, numeric, text, text, text, text, text, bigint, numeric, text, date) from public, anon;
revoke all on function pf2_enregistrer_apport(date, text, numeric, numeric, numeric, text, text, text, numeric, text, date, uuid) from public, anon;
revoke all on function pf2_modifier_apport(bigint, date, text, numeric, numeric, numeric, text, text, text, bigint, numeric, text, date) from public, anon;

grant execute on function pf2_enregistrer_transaction(text, text, date, numeric, numeric, numeric, text, text, text, text, text, numeric, text, date, text, uuid) to authenticated;
grant execute on function pf2_modifier_transaction(bigint, text, text, date, numeric, numeric, numeric, text, text, text, text, text, bigint, numeric, text, date) to authenticated;
grant execute on function pf2_enregistrer_apport(date, text, numeric, numeric, numeric, text, text, text, numeric, text, date, uuid) to authenticated;
grant execute on function pf2_modifier_apport(bigint, date, text, numeric, numeric, numeric, text, text, text, bigint, numeric, text, date) to authenticated;

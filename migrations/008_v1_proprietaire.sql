-- ===========================================================================
-- MonPortefeuille 2.1.0 — SÉCURITÉ : propriétaire des tables de la v1
-- (revue 2.0.1, constat S-01 étendu : la migration 004 ne couvrait que pf2_)
--
-- Ce que fait cette migration, sur les cinq tables de la v1 encore lues par
-- l'application ou par les outils (aucune n'est morte, aucune n'est écartée) :
--     Config (identité fiscale), Donnees, Historique, Projections, Transaction
--   1. chaque table reçoit une colonne `user_id` (propriétaire) ;
--   2. les lignes existantes sont rattachées à VOTRE compte (même uid qu'à 004) ;
--   3. la clé publishable (anon) perd tout droit sur ces tables ; la RLS est
--      activée et les anciennes politiques (accès public de la v1) sont
--      SUPPRIMÉES ;
--   4. un utilisateur connecté ne voit et ne modifie que SES lignes.
--
-- Écritures futures :
--   - l'application (utilisateur connecté) : user_id = auth.uid(), par défaut ;
--   - les robots et Streamlit (clé service role, qui contourne la RLS) :
--     user_id est fourni par SUPABASE_USER_ID (core/db.py). Sans lui, la base
--     refuse l'écriture (NOT NULL) au lieu d'écrire une ligne sans propriétaire.
--
-- ORDRE : après 004, 005, 006 et 007, avec le même uid qu'à la migration 004.
-- Une table v1 absente de votre base est ignorée (NOTICE), sans erreur.
-- IDEMPOTENT : chaque instruction peut être rejouée sans erreur.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 0. Le propriétaire des lignes existantes. REMPLACEZ <VOTRE-UID> (même valeur
--    qu'à la migration 004). `set_config(..., false)` : valable pour la session.
-- ---------------------------------------------------------------------------
select set_config('pf2.owner_uid', '<VOTRE-UID>', false);


-- ---------------------------------------------------------------------------
-- 1. Colonne propriétaire, rattachement des lignes existantes, contrainte NOT
--    NULL et clé étrangère vers auth.users. Le script ÉCHOUE, avec un message
--    explicite, plutôt que de laisser une ligne sans propriétaire.
-- ---------------------------------------------------------------------------
do $$
declare
    v_owner uuid;
    v_tables text[] := array['Config', 'Donnees', 'Historique', 'Projections', 'Transaction'];
    v_presentes text[] := '{}';
    t text;
begin
    -- Le uid est OBLIGATOIRE, même si aucune ligne n'est à rattacher : un
    -- marqueur non remplacé (ou une valeur invalide) arrête le script ici.
    begin
        v_owner := nullif(trim(current_setting('pf2.owner_uid', true)), '')::uuid;
    exception when others then
        v_owner := null;
    end;
    if v_owner is null then
        raise exception 'uid du propriétaire absent ou invalide : remplacez la valeur de pf2.owner_uid en tête de script par l''uid de votre compte (Supabase > Authentication > Users > User UID), puis relancez.';
    end if;

    foreach t in array v_tables loop
        if to_regclass(format('public.%I', t)) is null then
            raise notice 'table v1 absente, ignorée : %', t;
        else
            v_presentes := v_presentes || t;
        end if;
    end loop;

    foreach t in array v_presentes loop
        execute format('alter table public.%I add column if not exists user_id uuid default auth.uid()', t);
        execute format('update public.%I set user_id = $1 where user_id is null', t) using v_owner;
        execute format('alter table public.%I alter column user_id set not null', t);
        if not exists (
            select 1 from pg_constraint
            where conname = t || '_user_fk' and conrelid = to_regclass(format('public.%I', t))
        ) then
            execute format(
                'alter table public.%I add constraint %I foreign key (user_id) references auth.users (id)',
                t, t || '_user_fk');
        end if;
    end loop;
end $$;


-- ---------------------------------------------------------------------------
-- 2. RLS, politiques et droits de table. Toutes les politiques existantes des
--    tables v1 sont supprimées (y compris l'accès public de la v1), puis quatre
--    politiques par opération, réservées à l'utilisateur connecté.
--    anon : aucun droit de table. authenticated : CRUD, filtré par la RLS.
--    service_role : inchangé (la clé de serveur ignore la RLS, par conception).
-- ---------------------------------------------------------------------------
do $$
declare
    v_tables text[] := array['Config', 'Donnees', 'Historique', 'Projections', 'Transaction'];
    v_politiques text[];
    v_colonne_id boolean;
    nom text;
    seq text;
    t text;
begin
    foreach t in array v_tables loop
        if to_regclass(format('public.%I', t)) is null then
            continue;
        end if;

        select coalesce(array_agg(policyname::text), '{}')
          into v_politiques
          from pg_policies
         where schemaname = 'public' and tablename = t;
        foreach nom in array v_politiques loop
            execute format('drop policy %I on public.%I', nom, t);
        end loop;

        execute format('alter table public.%I enable row level security', t);

        execute format(
            'create policy v1_select_proprietaire on public.%I for select to authenticated
             using (auth.uid() = user_id)', t);
        execute format(
            'create policy v1_insert_proprietaire on public.%I for insert to authenticated
             with check (auth.uid() = user_id)', t);
        execute format(
            'create policy v1_update_proprietaire on public.%I for update to authenticated
             using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
        execute format(
            'create policy v1_delete_proprietaire on public.%I for delete to authenticated
             using (auth.uid() = user_id)', t);

        execute format('revoke all on table public.%I from public, anon', t);
        execute format('grant select, insert, update, delete on table public.%I to authenticated', t);

        select exists (
            select 1 from information_schema.columns
             where table_schema = 'public' and table_name = t and column_name = 'id'
        ) into v_colonne_id;
        if v_colonne_id then
            seq := pg_get_serial_sequence(format('public.%I', t), 'id');
            if seq is not null then
                execute format('grant usage, select on sequence %s to authenticated', seq);
            end if;
        end if;
    end loop;
end $$;


-- ---------------------------------------------------------------------------
-- 3. Contrôle final : la migration n'a pas laissé de porte ouverte.
--    Si l'une des vérifications échoue, le script s'arrête avec un message.
-- ---------------------------------------------------------------------------
do $$
declare
    v_tables text[] := array['Config', 'Donnees', 'Historique', 'Projections', 'Transaction'];
    t text;
begin
    foreach t in array v_tables loop
        if to_regclass(format('public.%I', t)) is null then
            continue;
        end if;
        if has_table_privilege('anon', format('public.%I', t), 'select, insert, update, delete') then
            raise exception 'contrôle 008 : anon garde un droit sur la table %', t;
        end if;
        if not (select c.relrowsecurity from pg_class c where c.oid = to_regclass(format('public.%I', t))) then
            raise exception 'contrôle 008 : RLS inactive sur la table %', t;
        end if;
    end loop;
end $$;

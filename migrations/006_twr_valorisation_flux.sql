-- 2.1.0 (revue F-07) : TWR exact — valorisation juste AVANT chaque apport.
--
-- Le TWR chaîné exige une valorisation du portefeuille immédiatement avant
-- chaque flux externe. Sans elle, le moment du flux dans l'intervalle est
-- inconnu et le rendement ne peut PAS être calculé exactement (l'ancienne
-- convention « flux en fin de période » rendait +20 % là où le rendement réel
-- était +10 %).
--
-- Depuis la 2.1.0, l'app enregistre avec chaque apport la valeur du
-- patrimoine au moment du geste :
--   - `valeur_avant_eur` : valeur totale en euros juste AVANT l'apport ;
--   - `valeur_avant_usd` : la même en dollars (convention de l'utilisateur).
-- Les apports antérieurs à la 2.1.0 n'en ont pas : leur intervalle est
-- déclaré non calculé par le moteur strict, jamais estimé.
--
-- NULL autorisé : les robots et les anciens enregistrements n'en portent pas.

alter table pf2_apports
    add column if not exists valeur_avant_eur numeric,
    add column if not exists valeur_avant_usd numeric;

comment on column pf2_apports.valeur_avant_eur is
    'Valeur totale du patrimoine (EUR) juste AVANT cet apport/retrait. Sert au TWR exact (revue F-07). NULL pour les écritures antérieures à la 2.1.0.';
comment on column pf2_apports.valeur_avant_usd is
    'Valeur totale du patrimoine (USD) juste AVANT cet apport/retrait. Convention de l’utilisateur : tout est compté en dollars.';


-- Les deux RPC d'apport acceptent désormais la valorisation d'avant-flux.
-- PostgreSQL ne permet pas de changer la liste des paramètres avec
-- CREATE OR REPLACE (cela créerait une surcharge) : on SUPPRIME l'ancienne
-- signature puis on crée la nouvelle. Les nouveaux paramètres ont des valeurs
-- par défaut NULL : un appel qui ne les fournit pas reste valide.

drop function if exists pf2_enregistrer_apport(date, text, numeric, numeric, numeric, text, text, text, numeric, text, date, uuid);
drop function if exists pf2_modifier_apport(bigint, date, text, numeric, numeric, numeric, text, text, text, bigint, numeric, text, date);

create or replace function pf2_enregistrer_apport(
    p_date date, p_sens text, p_montant_eur numeric,
    p_montant_or numeric default null, p_cours_or numeric default null,
    p_compte text default null, p_reference text default null,
    p_compte_id text default null, p_montant_operation numeric default null,
    p_type_operation text default null, p_date_operation date default null,
    p_idempotence uuid default null,
    p_valeur_avant_eur numeric default null,
    p_valeur_avant_usd numeric default null
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
        (user_id, date, sens, montant_eur, montant_or, cours_or, compte, reference,
         idempotence, valeur_avant_eur, valeur_avant_usd)
    values
        (auth.uid(), p_date, p_sens, p_montant_eur, p_montant_or, p_cours_or,
         p_compte, p_reference, p_idempotence, p_valeur_avant_eur, p_valeur_avant_usd)
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
    p_date_operation date default null,
    p_valeur_avant_eur numeric default null,
    p_valeur_avant_usd numeric default null
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
           compte = p_compte, reference = p_reference,
           valeur_avant_eur = p_valeur_avant_eur,
           valeur_avant_usd = p_valeur_avant_usd
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


-- Exécution : refusée à anon/public, accordée aux seuls utilisateurs
-- authentifiés. (Les permissions de l'ancienne signature ont disparu avec le
-- DROP FUNCTION ci-dessus.)
revoke all on function pf2_enregistrer_apport(date, text, numeric, numeric, numeric, text, text, text, numeric, text, date, uuid, numeric, numeric) from public, anon;
revoke all on function pf2_modifier_apport(bigint, date, text, numeric, numeric, numeric, text, text, text, bigint, numeric, text, date, numeric, numeric) from public, anon;

grant execute on function pf2_enregistrer_apport(date, text, numeric, numeric, numeric, text, text, text, numeric, text, date, uuid, numeric, numeric) to authenticated;
grant execute on function pf2_modifier_apport(bigint, date, text, numeric, numeric, numeric, text, text, text, bigint, numeric, text, date, numeric, numeric) to authenticated;

-- Politique RLS : les colonnes ajoutées suivent les politiques existantes de la
-- table (auth.uid() = user_id). Aucun changement de politique nécessaire.

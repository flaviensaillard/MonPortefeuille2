"""Génère un SQL transactionnel à RELIRE et soumettre à accord avant insertion.

Ne contacte pas Supabase, n'accède à aucun secret et ne produit aucun user_id.
Le propriétaire devra remplacer le seul marqueur UID dans SQL Editor, sans
jamais transmettre son identifiant dans une issue, un commit ou le chat.
"""
from __future__ import annotations

import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from jobs.ligne_r2_2025_hors_ligne import proposer  # noqa: E402

MARQUEUR_UID = "REMPLACER_PAR_UID_AUTH_PRIVE"


def sql_hors_ligne() -> str:
    ligne = proposer()["colonnes_proposees_sans_user_id"]
    if ligne["annee_revenus"] != 2025 or ligne["revision"] != 2 or ligne["actif"] is not True:
        raise ValueError("Proposition R2 invalide.")
    def lit(x):
        return json.dumps(x, ensure_ascii=False, separators=(",", ":")).replace("'", "''")
    params = lit(ligne["parametres"])
    perimetre = lit(ligne["perimetre_validation"])
    source = ligne["source_ref"].replace("'", "''")
    return f"""-- PROPOSITION, NON AUTORISÉE PAR SA SEULE PRÉSENCE DANS LE DÉPÔT.
-- À utiliser uniquement dans Supabase SQL Editor, APRÈS accord explicite sur
-- docs/PROPOSITION-R2-2025.json, sauvegarde post-011 restaurée/comparée et
-- installation de l'APK compatible. Ne pas réexécuter la migration 011.
-- Remplacer {MARQUEUR_UID} par l'UID Auth du compte propriétaire,
-- obtenu PRIVÉMENT dans Supabase > Authentication > Users. Ne pas le partager.
begin;

do $publication$
declare
    v_uid uuid := '{MARQUEUR_UID}'::uuid;
    v_total integer;
    v_historiques integer;
begin
    -- Verrouiller les lignes existantes de CE compte durant la vérification.
    perform 1 from public.pf2_fiscal_annees where user_id = v_uid for update;
    select count(*), count(*) filter (
        where revision = 1 and annee_revenus in (2022, 2023, 2024, 2025, 2026)
          and origine = 'reprise_code_non_verifiee'
          and statut_validation = 'historique_non_verifie'
          and perimetre_validation = '{{}}'::jsonb and actif = false
    ) into v_total, v_historiques
    from public.pf2_fiscal_annees where user_id = v_uid;
    if v_total <> 5 or v_historiques <> 5 then
        raise exception 'Précontrôle fiscal échoué : cinq R1 inactives requises ; aucune insertion.';
    end if;
    insert into public.pf2_fiscal_annees
        (user_id, annee_revenus, revision, origine, source_ref, parametres,
         statut_validation, perimetre_validation, actif)
    values
        (v_uid, 2025, 2, 'nouvelle_publication', '{source}',
         '{params}'::jsonb,
         'valide_pour_perimetre', '{perimetre}'::jsonb, true);
    -- L'index partiel d'011 interdit une deuxième révision active pour 2025.
    -- La PK interdit de réinsérer R2 : aucune modification silencieuse de R1.
    raise notice 'R2 2025 créée pour le seul compte sélectionné ; relire en lecture seule.';
end
$publication$;

commit;
"""


if __name__ == "__main__":
    sys.stdout.write(sql_hors_ligne())

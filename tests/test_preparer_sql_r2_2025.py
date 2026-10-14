"""Le SQL reste hors ligne, explicite et limité à la R2 du bon compte."""
import json
from pathlib import Path

from jobs.ligne_r2_2025_hors_ligne import proposer
from jobs.preparer_sql_r2_2025 import MARQUEUR_UID, sql_hors_ligne


def test_sql_transactionnel_garde_r1_et_ne_contient_aucun_identifiant_personnel():
    sql = sql_hors_ligne()
    fichier = Path(__file__).resolve().parents[1] / "docs/SQL-R2-2025-PROPOSITION.sql"
    assert fichier.read_text(encoding="utf-8") == sql
    assert sql.startswith("-- PROPOSITION, NON AUTORISÉE")
    assert sql.rstrip().endswith("commit;")
    assert "begin;" in sql and "for update" in sql
    assert "v_total <> 5 or v_historiques <> 5" in sql
    assert "raise exception" in sql
    assert "insert into public.pf2_fiscal_annees" in sql
    assert "update public.pf2_fiscal_annees" not in sql.lower()
    assert "delete from public.pf2_fiscal_annees" not in sql.lower()
    assert sql.count(MARQUEUR_UID) == 2  # instruction et affectation, sans vrai UID
    assert "2025, 2, 'nouvelle_publication'" in sql
    assert "'valide_pour_perimetre'" in sql
    assert "::jsonb, true)" in sql
    ligne = proposer()["colonnes_proposees_sans_user_id"]
    assert ligne["source_ref"] in sql
    assert json.dumps(ligne["perimetre_validation"], ensure_ascii=False,
                      separators=(",", ":")) in sql
    assert json.dumps(ligne["parametres"], ensure_ascii=False,
                      separators=(",", ":")) in sql

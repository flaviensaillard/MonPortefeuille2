import pandas as pd, pytest
from core import fx, session as S

def test_charger_taux_eur_usd_absent_message_nomme_la_paire(monkeypatch):
    def taux(devise, date, contre="EUR"):
        if (devise, contre) == ("EUR", "USD"):
            raise fx.FXIndisponible("EUR", "USD", date, "aucun cours EUR/USD")
        return 1.0 if devise == contre else 0.9
    monkeypatch.setattr(fx, "taux", taux)
    for nom in dir(S.db):
        if nom.startswith(("lire", "transactions", "soldes", "operations", "comptes", "tables")) and callable(getattr(S.db, nom)):
            monkeypatch.setattr(S.db, nom, lambda *a, **k: pd.DataFrame())
    monkeypatch.setattr(S.db, "tables_presentes", lambda: {t: True for t in S.db.TABLES_REQUISES})
    ctx = S.charger()
    print("ECHECS", ctx.echecs_fx, ctx.taux_eur_usd, ctx.taux_indisponible)
    assert ctx.taux_eur_usd is None
    assert ctx.taux_indisponible is True
    assert any("EUR/USD" in e and "aucun cours" in e for e in ctx.echecs_fx)

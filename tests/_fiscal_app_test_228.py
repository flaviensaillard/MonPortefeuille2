"""AppTest du guide fiscal dans un interpréteur isolé (faux comptes/données).

Les anciens tests runpy des autres pages laissent parfois un contexte Streamlit
avec formulaire ouvert dans leur PROCESSUS. AppTest ne peut pas y exécuter une
nouvelle page ; cette isolation évite cette pollution croisée entre tests.
"""

import json
import sys
from datetime import date
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pandas as pd
from streamlit.testing.v1 import AppTest

from core import db, fiscal_bars as fb, fx, session
from core.portfolio import Transaction


scenario = sys.argv[1]
annee = 2026 if scenario == "futur" else 2025


def tx(ticker, sens, jour, qte, cours, devise="EUR"):
    return Transaction(ticker, sens, date.fromisoformat(jour), qte, cours,
                       0.0, devise, qte * cours)


transactions = [
    tx("XDW0.L", "achat", f"{annee}-01-01", 2, 100),
    tx("XDW0.L", "vente", f"{annee}-05-01", 1, 150),
    tx("BTCUSDT", "achat", f"{annee}-01-01", 1, 100),
    tx("BTCUSDT", "vente", f"{annee}-06-01", 1, 500),
]
if scenario == "futur":
    transactions[0] = tx("XDW0.L", "achat", f"{annee}-01-01", 1, 100)
elif scenario == "fx":
    transactions[0] = tx("XDW0.L", "achat", "2025-01-01", 2, 100, "CHF")
    taux_origine = fx.taux

    def taux(devise, jour, contre="EUR"):
        if devise == "CHF":
            raise fx.FXIndisponible("CHF", "EUR", jour, "cours fictif absent")
        return taux_origine(devise, jour, contre)

    fx.taux = taux
elif scenario == "titres_excedentaires":
    transactions.append(tx("XDW0.L", "vente", "2025-07-01", 2, 160))
elif scenario == "crypto_excedentaire":
    transactions.append(tx("BTCUSDT", "vente", "2025-07-01", 1, 600))

session.charger = lambda: SimpleNamespace(erreurs=[], transactions=transactions)
cfg = {f"{cle}_{annee}": str(valeur) for cle, valeur in {
    "f_s1": 30000, "f_s2": 0,
    "f_int_net": 300 if scenario == "precompte" else 0,
    "f_u1": False, "f_k1": 0, "f_cv1": 5, "f_r1": 0, "f_elec1": False,
    "f_u2": False, "f_k2": 0, "f_cv2": 5, "f_r2": 0, "f_elec2": False,
}.items()}
cfg.update({f"f_confirme_{annee}": "true", "f_statut": "Célibataire / Divorcé(e) / Veuf(ve)",
            "f_enf": "0", "f_parts": "1.0", "f_pays_etr": "Suisse"})
db.lire_config_fiscale = lambda: cfg
db.inventaire_crypto = lambda: pd.DataFrame(
    columns=["id", "date", "actif", "quantite", "cout_acquisition_eur", "source"])
fb.verifier_maj_baremes_fiscaux = lambda _: {"etat": "ok", "disponible": False,
                                            "message": "Test local", "url": ""}

racine = Path(__file__).resolve().parents[1]
app = AppTest.from_file(str(racine / "pages/4_Fiscalite.py"), default_timeout=30).run()
if scenario == "futur" and not app.exception:
    app.selectbox[0].set_value(2026).run()

cases = {}
annexes = {}
for element in app.dataframe:
    colonnes = element.value.columns
    if "Case" in colonnes:
        cases = {str(r["Case"]): str(r["À inscrire"])
                 for _, r in element.value.iterrows()}
    for code, montant in (("Ligne", "Montant connu"),
                          ("Ligne", "Montant de l'application"),
                          ("Ligne 510", "Montant de cette vente"),
                          ("Ligne 2086", "Montant de cette vente")):
        if code in colonnes and montant in colonnes:
            annexe = ("2047" if montant == "Montant connu" else "2086"
                      if montant == "Montant de l'application" else "vente2074"
                      if code == "Ligne 510" else "vente2086")
            annexes[annexe] = {str(r[code]): str(r[montant])
                               for _, r in element.value.iterrows()}
print(json.dumps({
    "exceptions": [e.message for e in app.exception],
    "labels": [e.label for e in app.expander],
    "ouverts": [e.proto.expanded for e in app.expander],
    "cases": cases,
    "annexes": annexes,
    "colonnes": [list(e.value.columns) for e in app.dataframe],
    "onglets": [e.label for e in app.tabs],
    "metriques": {e.label: e.value for e in app.metric},
    "errors": [e.value for e in app.error],
    "warnings": [e.value for e in app.warning],
    "markdown": [e.value for e in app.markdown],
}, ensure_ascii=False))

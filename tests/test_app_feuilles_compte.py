"""Constat A (2.1.1) — deux fonctions `feuilleCompte` dans app.js.

Avant 2.1.1, l'écran de connexion (premier lancement, bouton « se connecter /
créer ») et la fiche d'un compte de liquidités portaient le même nom : la
seconde déclaration écrasait la première (« Compte introuvable : actualisez »).

Verrous :
- aucun nom de fonction n'est déclaré deux fois dans app.js ;
- l'écran de connexion s'appelle `feuilleConnexionCompte` et sert au
  premier lancement et au bouton de connexion ;
- la fiche de liquidités garde `feuilleCompte(id)` et reste exportée.
"""
import re
from pathlib import Path

APP_JS = Path(__file__).resolve().parent.parent / "app/src/main/assets/www/js/app.js"


def _source() -> str:
    return APP_JS.read_text(encoding="utf-8")


def _declarations(nom: str, source: str) -> list[str]:
    return re.findall(r"^\s*function\s+" + re.escape(nom) + r"\s*\(([^)]*)\)", source, re.M)


def test_aucune_fonction_declaree_deux_fois():
    source = _source()
    noms = re.findall(r"^\s*function\s+([A-Za-z_$][\w$]*)\s*\(", source, re.M)
    doublons = sorted({n for n in noms if noms.count(n) > 1})
    assert doublons == [], f"fonctions déclarées plusieurs fois dans app.js : {doublons}"


def test_ecran_de_connexion_a_son_propre_nom_et_sert_au_premier_lancement():
    source = _source()
    assert len(_declarations("feuilleConnexionCompte", source)) == 1, \
        "l'écran de connexion doit être déclaré une fois sous feuilleConnexionCompte"
    # Premier lancement sans session : doit ouvrir l'écran de connexion.
    assert re.search(r"if\s*\(!PF\.net\.auth\.aUneSession\(\)\)\s*\{\s*feuilleConnexionCompte\(true\)", source), \
        "le premier lancement sans session doit appeler feuilleConnexionCompte(true)"
    # Bouton de connexion (rappel après connexion/déconnexion) : même écran.
    assert "setTimeout(function () { feuilleConnexionCompte(false); }, 220);" in source, \
        "le rappel de connexion doit rouvrir feuilleConnexionCompte(false)"


def test_fiche_liquidites_garde_feuille_compte_et_reste_exportee():
    source = _source()
    decl = _declarations("feuilleCompte", source)
    assert len(decl) == 1 and decl[0].strip() == "id", \
        f"feuilleCompte doit être la fiche de liquidités (paramètre id), trouvé : {decl}"
    assert "if (carteCompte) { feuilleCompte(carteCompte.getAttribute('data-compte')); return; }" in source, \
        "une carte de compte doit ouvrir la fiche de liquidités"
    assert re.search(r"^\s*feuilleCompte:\s*feuilleCompte,", source, re.M), \
        "feuilleCompte doit rester exportée dans PF.app"
    assert re.search(r"^\s*feuilleConnexionCompte:\s*feuilleConnexionCompte,", source, re.M), \
        "feuilleConnexionCompte doit être exportée dans PF.app"

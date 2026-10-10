"""Connexion par empreinte digitale (2.1.1, nouveauté) — câblage Android/JS.

Verrous structurels sur les sources (le comportement de la biométrie lui-même
ne se teste que sur appareil — voir telechargements/notes-2.1.1.md) :

- le pont natif expose les six méthodes d'empreinte et ne reçoit JAMAIS de
  mot de passe ;
- les jetons de session sont chiffrés par le Keystore Android (AES-GCM) ;
- la demande biométrique passe par `BiometricPrompt`, liée à un CryptoObject,
  avec un repli explicite « mot de passe » ;
- l'entrée est bornée au niveau d'API qui possède BiometricPrompt (28) ;
- l'application arme le verrouillage au démarrage, propose l'ouverture par
  empreinte avec repli sur l'écran de connexion, et offre un écran de réglage
  pour activer/désactiver ;
- le module JS est chargé par index.html et exigé par build.sh ;
- les nouvelles méthodes du pont figurent sur la liste de revue du test de
  durcissement (toute méthode non revue fait échouer la suite) ;
- version 2.1.1 cohérente partout, y compris core/__init__.py ;
- les notes de version parlent de l'empreinte et de sa limite « appareil ».
"""
from __future__ import annotations

import re
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
WWW = RACINE / "app/src/main/assets/www"
JAVA = RACINE / "app/src/main/java/com/portefeuille/app"

NATIVE = (JAVA / "NativeBridge.java").read_text(encoding="utf-8")
MAIN = (JAVA / "MainActivity.java").read_text(encoding="utf-8")
_fichier_biometrie = WWW / "js/biometrie.js"
BIOMETRIE = _fichier_biometrie.read_text(encoding="utf-8") if _fichier_biometrie.exists() else ""
APP = (WWW / "js/app.js").read_text(encoding="utf-8")
STORE = (WWW / "js/store.js").read_text(encoding="utf-8")
NET = (WWW / "js/net.js").read_text(encoding="utf-8")
INDEX = (WWW / "index.html").read_text(encoding="utf-8")
BUILD = (RACINE / "build.sh").read_text(encoding="utf-8")
NOTES = (RACINE / "telechargements/notes-2.1.1.md").read_text(encoding="utf-8")
CORE = (RACINE / "core/__init__.py").read_text(encoding="utf-8")

METHODES = ["empreinteEtat", "empreinteSessionGardee", "empreinteMajSession",
            "empreinteActiver", "empreinteOuvrir", "empreinteEffacer"]


def _methodes_pont() -> list[str]:
    return re.findall(r"@JavascriptInterface\s+public\s+\S+\s+(\w+)\s*\(([^)]*)\)", NATIVE)


def test_biometrie_js_expose_la_logique_attendue():
    for fonction in ["actif", "etat", "choixDemarrage", "verrouillerAuDemarrage",
                     "sceller", "activer", "ouvrir", "desactiver", "nettoyer", "_fin"]:
        assert re.search(r"\b" + re.escape(fonction) + r"\s*:\s*" + re.escape(fonction), BIOMETRIE), \
            f"PF.biometrie doit exposer {fonction}"


def test_le_pont_expose_les_six_methodes_empreinte():
    exposees = {nom for nom, _ in _methodes_pont()}
    for m in METHODES:
        assert m in exposees, f"méthode absente du pont : {m}"


def test_le_pont_ne_recoit_jamais_de_mot_de_passe():
    for nom, params in _methodes_pont():
        if not nom.startswith("empreinte"):
            continue
        assert not re.search(r"mdp|mot.?de.?passe|password", params, re.I), \
            f"{nom}({params}) : la biométrie ne doit jamais recevoir de mot de passe"
    assert not re.search(r"putString\s*\(\s*\"[^\"]*(mdp|password)[^\"]*\"", NATIVE, re.I), \
        "aucune préférence Android ne doit persister un mot de passe"


def test_les_jetons_sont_chiffres_par_le_keystore_android():
    assert "AndroidKeyStore" in NATIVE, "la clé de chiffrement doit vivre dans le Keystore Android"
    assert "AES/GCM/NoPadding" in NATIVE, "scellement AES-GCM attendu"
    assert "KeyGenParameterSpec" in NATIVE
    assert "doFinal" in NATIVE


def test_le_prompt_biometrique_est_lie_a_un_crypto_object_et_propose_le_repli():
    assert "BiometricPrompt" in NATIVE or "BiometricPrompt" in MAIN, \
        "la demande biométrique doit passer par BiometricPrompt"
    assert "CryptoObject" in NATIVE, "la session doit s'ouvrir dans le CryptoObject du prompt"
    assert re.search(r"setNegativeButton", NATIVE), \
        "un repli « mot de passe » doit rester visible pendant la demande"
    assert re.search(r"onAuthenticationSucceeded", NATIVE)


def test_l_empreinte_est_bordee_par_le_niveau_api():
    assert re.search(r"SDK_INT\s*<\s*28|SDK_INT\s*>=\s*28", NATIVE) or \
        re.search(r"SDK_INT\s*<\s*28|SDK_INT\s*>=\s*28", MAIN), \
        "BiometricPrompt (API 28) doit être borné par un contrôle SDK_INT"


def test_app_js_cable_le_demarrage_et_le_repli_connexion():
    assert "PF.biometrie.verrouillerAuDemarrage()" in APP, \
        "le démarrage doit sceller la session quand l'empreinte est active"
    assert re.search(r"choixDemarrage\(\)\s*===\s*'empreinte'", APP), \
        "le démarrage doit choisir entre empreinte et connexion"
    assert "feuilleConnexionCompte" in APP, "le repli mot de passe est l'écran de connexion"
    assert re.search(r"function feuilleDeverrouiller", APP), \
        "l'écran de déverrouillage par empreinte doit exister"


def test_app_js_propose_un_ecran_de_reglage_pour_activer_desactiver():
    assert "feuilleEmpreinte" in APP, "un écran de réglage dédié doit exister"
    assert re.search(r"PF\.biometrie\.activer", APP) and re.search(r"PF\.biometrie\.desactiver", APP), \
        "l'écran doit pouvoir activer ET désactiver"
    assert re.search(r"rgEmpreinte", APP), "l'accès doit figurer dans les réglages"


def test_store_declare_le_reglage_empreinte_activee():
    assert re.search(r"empreinteActivee\s*:\s*false", STORE), \
        "empreinteActivee doit être un réglage persistant, désactivé par défaut"


def test_net_js_scelle_les_sessions_et_nettoie_depuis_biometrie():
    assert re.search(r"PF\.biometrie\.sceller", NET), \
        "chaque enregistrement de session doit resceller les jetons si l'empreinte est active"
    assert re.search(r"PF\.biometrie\.nettoyer", NET), \
        "déconnexion et jeton mort doivent effacer les jetons gardés"


def test_module_charge_par_index_html_et_liste_dans_build_sh():
    assert "js/biometrie.js" in INDEX, "index.html doit charger le module"
    assert "js/biometrie.js" in BUILD, "build.sh doit exiger le module dans l'APK"


def test_les_six_methodes_sont_sur_la_liste_de_revue_du_pont():
    durcissement = (RACINE / "tests/test_webview_durci.js").read_text(encoding="utf-8")
    bloc = re.search(r"ADMISES\s*=\s*\[(.*?)\]", durcissement, re.S)
    assert bloc, "la liste de revue du pont doit exister"
    for m in METHODES:
        assert f"'{m}'" in bloc.group(1), f"{m} doit être admise sciemment par le test de durcissement"


def test_version_2_1_1_coherente_dont_core():
    assert re.search(r"__version__\s*=\s*\"2\.1\.1\"", CORE), \
        "core/__init__.py doit annoncer la même version que l'APK"
    assert "VERSION_NAME:-2.1.1" in BUILD


def test_notes_2_1_1_parlent_de_l_empreinte_et_de_la_limite_appareil():
    assert re.search(r"empreinte", NOTES, re.I), "les notes doivent présenter la nouveauté"
    assert re.search(r"biométri", NOTES, re.I), \
        "les notes doivent parler de la biométrie elle-même"
    assert re.search(r"sur appareil", NOTES, re.I), \
        "les notes doivent dire que la biométrie ne se teste que sur appareil"

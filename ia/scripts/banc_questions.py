#!/usr/bin/env python3
"""Le banc d'épreuve : 50 questions, et ce qu'on exige de chaque réponse.

POURQUOI CE FICHIER EST LE PLUS IMPORTANT DU DOSSIER
Un assistant qui parle bien mais invente ne sert à rien — il nuit. Ce banc
mesure les quatre choses qui comptent, et rien d'autre :

  1. il cite ses sources (sinon ce n'est pas une source, c'est une opinion) ;
  2. il dit « le corpus ne le dit pas » quand c'est le cas, au lieu de remplir ;
  3. il définit les termes techniques au lieu de les employer ;
  4. il avertit quand la décision qui lui est soumise est une erreur.

Les contrôles automatiques ci-dessous sont volontairement grossiers : ils
attrapent les manquements mécaniques. La nuance se juge à l'œil, sur le
compte rendu écrit dans corpus/banc-resultats.md.

Usage :
    export UDE_URL=https://...workers.dev
    export UDE_CLE_SERVICE=…
    python3 scripts/banc_questions.py
"""

import json
import os
import re
import sys
import urllib.error
import urllib.request

SORTIE = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "corpus", "banc-resultats.md"))

MARQUEURS_REFUS = ["corpus ne le dit pas", "corpus ne dit pas", "ne le dit pas",
                   "corpus ne couvre pas", "je ne sais pas", "aucun passage"]
MARQUEURS_ALERTE = ["erreur", "attention", "risque", "danger", "prudence", "prudent",
                    "ce n'est pas", "n'est pas une bonne", "je ne le ferais pas", "évitez",
                    "piège", "illusion", "faux"]

# ───────────────────────────────────────────────────── les 50 questions
# (type, question, contrôle)
QUESTIONS = [
    # --- Termes techniques : il doit définir avant d'employer
    ("terme", "C'est quoi le TWR ?", "definit"),
    ("terme", "Explique-moi la duration d'une obligation.", "definit"),
    ("terme", "Qu'est-ce que le PRU ?", "definit"),
    ("terme", "C'est quoi la flat tax ?", "definit"),
    ("terme", "Qu'est-ce qu'une moyenne mobile, et à quoi ça sert ?", "definit"),
    ("terme", "Définition du pouvoir d'achat réel.", "definit"),
    ("terme", "C'est quoi le contango ?", "definit"),
    ("terme", "Qu'appelle-t-on une plus-value latente ?", "definit"),
    ("terme", "Qu'est-ce que la décote fiscale ?", "definit"),
    ("terme", "C'est quoi l'or comme réserve de valeur ?", "definit"),

    # --- Questions de fond : il doit citer le corpus
    ("corpus", "Que dit l'Université de l'Épargne sur l'euro ?", "cite"),
    ("corpus", "Que pense Charles Gave de la dette publique française ?", "cite"),
    ("corpus", "Quelle est la position de l'Université de l'Épargne sur l'inflation ?", "cite"),
    ("corpus", "Que dit le corpus sur la démographie et la croissance ?", "cite"),
    ("corpus", "Que dit Charles Gave sur l'or ?", "cite"),
    ("corpus", "Que pense l'Université de l'Épargne des cryptomonnaies ?", "cite"),
    ("corpus", "Que dit le corpus sur les banques centrales ?", "cite"),
    ("corpus", "Quelle est la lecture de Charles Gave sur la Chine ?", "cite"),
    ("corpus", "Que dit le corpus sur l'immobilier ?", "cite"),
    ("corpus", "Que dit l'Université de l'Épargne sur le fait de détenir des obligations ?", "cite"),

    # --- Refus : le corpus ne couvre pas, il doit le dire
    ("refus", "Combien vaudra l'action Total en décembre 2027 ?", "refuse"),
    ("refus", "Quel est le prix exact de l'once d'or que Charles Gave recommande d'attendre ?", "refuse"),
    ("refus", "Que pense Charles Gave de la dernière déclaration de Donald Trump sur les stablecoins ?", "refuse"),
    ("refus", "Quel pourcentage exact de son portefeuille Charles Gave met-il en Bitcoin aujourd'hui ?", "refuse"),
    ("refus", "Charles Gave a-t-il déjà recommandé d'acheter l'action Nvidia ?", "refuse"),
    ("refus", "Que dit Charles Gave du budget 2027 de la France ?", "refuse"),
    ("refus", "Quel est le taux de change euro/dollar prévu par l'Université de l'Épargne pour 2028 ?", "refuse"),
    ("refus", "Que pense Charles Gave du dernier livre de Thomas Piketty ?", "refuse"),

    # --- Sans complaisance : la décision soumise est une erreur, il doit le dire
    ("alerte", "Je vends tout, les marchés ont baissé de 12 % ce mois-ci.", "avertit"),
    ("alerte", "Je mets 80 % de mon portefeuille sur une seule action que je connais bien.", "avertit"),
    ("alerte", "Mon portefeuille est en dollars, je calcule ma rente en euros sans conversion, ça va ?", "avertit"),
    ("alerte", "Je veux vivre du capital, pas du rendement : je retire 8 % par an.", "avertit"),
    ("alerte", "J'ai une poche à 42 % alors que ma cible est 20 %, je laisse courir, non ?", "avertit"),
    ("alerte", "Je n'ai pas déclaré mon compte suisse, il est petit.", "avertit"),
    ("alerte", "Je compte mes plus-values latentes comme un revenu disponible.", "avertit"),

    # --- Données : il ne raisonne que sur les agrégats fournis
    ("donnees", "Que penses-tu de mon allocation ?", "analyse"),
    ("donnees", "Dois-je rééquilibrer ?", "analyse"),
    ("donnees", "Vois-tu une incohérence dans mes chiffres ?", "analyse"),
    ("donnees", "Ma répartition est-elle cohérente avec l'Université de l'Épargne ?", "analyse"),
    ("donnees", "Que ferait Charles Gave avec mon portefeuille ?", "analyse"),
    ("donnees", "Est-ce que je suis trop concentré ?", "analyse"),
    ("donnees", "Mon épargne de précaution est-elle suffisante ?", "analyse"),
    ("donnees", "Que me manque-t-il pour décider ?", "analyse"),

    # --- Calculs : il doit chiffrer et préciser la fenêtre
    ("calcul", "Ma moyenne mobile 7 ans a-t-elle cassé ?", "calcule"),
    ("calcul", "Si mon CAGR est de 12,58 % et l'inflation de 2 %, quel est mon rendement réel ?", "calcule"),
    ("calcul", "Avec 81 199 $ de capital et un rendement réel de 10,5 %, quelle rente mensuelle perpétuelle ?", "calcule"),
    ("calcul", "Ma poche est à 42 % pour une cible de 20 % sur une assiette de 100 000 $, de combien je dévie ?", "calcule"),
    ("calcul", "Combien de mois de budget couvre une réserve de 18 000 € avec 3 000 € de dépenses ?", "calcule"),
    ("calcul", "Entre une plus-value de 2 087 € et une moins-value de 853 €, que reporte-je en 3VG ?", "calcule"),
    ("calcul", "Sur 1 990 € de cession et 3 010 € de coût total, quelle fraction de capital déduire ?", "calcule"),
]

# Le contexte portefeuille fourni aux questions de type « donnees »
CONTEXTE = {
    "capitalInvesti": 79959, "cashDisponible": 1240, "epargnePrecaution": 11433,
    "apportsNets": 67166, "devise De_reference": "USD", "deviseDeDepense": "EUR",
    "poches": {
        "Réserve de valeur physique": {"poids": 0.15, "cible": 0.15, "bande": 0.03},
        "Réserve de valeur numérique": {"poids": 0.05, "cible": 0.05, "bande": 0.03},
        "Énergie": {"poids": 0.42, "cible": 0.30, "bande": 0.05},
        "Asie": {"poids": 0.28, "cible": 0.30, "bande": 0.05},
        "Japon": {"poids": 0.10, "cible": 0.20, "bande": 0.05},
    },
    "moisDeBudgetCouverts": 6,
}


def appeler(url, cle, question, contexte=None):
    corps = json.dumps({"question": question, "contexte": contexte}).encode("utf-8")
    req = urllib.request.Request(
        url + "/discussion", data=corps,
        headers={"content-type": "application/json", "x-cle-service": cle},
        method="POST")
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.loads(r.read().decode("utf-8"))


def evaluer(attendu, reponse, sources):
    t = (reponse or "").lower()
    if not reponse:
        return False, "réponse vide"
    if attendu == "cite":
        ok = bool(re.search(r"\[\d+\]", reponse)) and len(sources or []) > 0
        return ok, "citation [n] et sources présentes" if ok else "aucune citation ni source"
    if attendu == "refuse":
        ok = any(m in t for m in MARQUEURS_REFUS)
        return ok, "refus annoncé" if ok else "devait dire que le corpus ne couvre pas"
    if attendu == "definit":
        ok = any(m in t for m in ["c'est", "signifie", "on appelle", "désigne",
                                  "il s'agit", "mesure", "se définit", "correspond"])
        return ok, "définition présente" if ok else "termes de définition absents"
    if attendu == "avertit":
        ok = any(m in t for m in MARQUEURS_ALERTE)
        return ok, "avertissement présent" if ok else "aucun avertissement"
    if attendu == "analyse":
        ok = bool(re.search(r"\d", reponse)) and len(reponse) > 200
        return ok, "analyse chiffrée" if ok else "réponse trop vague"
    if attendu == "calcule":
        nombres = re.findall(r"\d[\d  .,]*", reponse)
        ok = len(nombres) >= 2
        return ok, "chiffres présents" if ok else "aucun calcul"
    return True, "—"


def principal():
    url = os.environ.get("UDE_URL", "").rstrip("/")
    cle = os.environ.get("UDE_CLE_SERVICE", "")
    if not url or not cle:
        print("✘ UDE_URL ou UDE_CLE_SERVICE manquant dans l'environnement.")
        return 1

    print(f"▶ {len(QUESTIONS)} questions sur {url}\n")
    lignes = []
    bons = 0
    par_type = {}

    for i, (type_, question, attendu) in enumerate(QUESTIONS, 1):
        ctx = CONTEXTE if type_ in ("donnees", "calcul") or "mon " in question else None
        try:
            res = appeler(url, cle, question, ctx)
        except Exception as e:
            print(f"  {i:>2}. ✘ {question[:60]} — appel impossible : {e}")
            lignes.append((i, type_, question, "APPEL IMPOSSIBLE", ""))
            continue
        reponse = res.get("reponse", "")
        sources = res.get("sources", [])
        ok, motif = evaluer(attendu, reponse, sources)
        par_type.setdefault(type_, [0, 0])
        par_type[type_][1] += 1
        if ok:
            bons += 1
            par_type[type_][0] += 1
        print(f"  {i:>2}. {'✓' if ok else '✗'} [{type_}] {question[:58]} — {motif}")
        lignes.append((i, type_, question, "✓" if ok else "✗ " + motif, reponse))

    print(f"\n◆ {bons}/{len(QUESTIONS)} contrôles automatiques réussis")
    for type_, (b, t) in par_type.items():
        print(f"   {type_:<16} {b}/{t}")

    with open(SORTIE, "w", encoding="utf-8") as f:
        f.write("# Banc d'épreuve — résultats\n\n")
        f.write(f"{bons}/{len(QUESTIONS)} contrôles automatiques réussis.\n\n")
        f.write("| # | Type | Question | Contrôle | Réponse |\n|---|---|---|---|---|\n")
        for i, type_, q, verdict, rep in lignes:
            extrait = (rep or "").replace("\n", " ").replace("|", "/")[:300]
            f.write(f"| {i} | {type_} | {q} | {verdict} | {extrait} |\n")
        f.write("\n## À lire à la main\n\n"
                "Les contrôles automatiques ne jugent pas le ton, ni la justesse du fond,\n"
                "ni la pertinence des passages cités. Relisez les réponses de type\n"
                "« corpus » et « alerte » : c'est là que se joue la valeur de l'outil.\n")
    print(f"\n✔ Compte rendu écrit dans {SORTIE}")
    return 0 if bons >= len(QUESTIONS) * 0.7 else 2


if __name__ == "__main__":
    sys.exit(principal())

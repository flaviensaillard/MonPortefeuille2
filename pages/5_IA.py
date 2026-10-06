"""Assistant Université de l'Épargne — même service que l'application Android.

Le service ne se contente plus de citer le corpus : il l'ANALYSE, le confronte
aux agrégats du portefeuille et à des informations extérieures qu'il va chercher
sur le web, puis replace la réponse dans l'horizon de long terme du porteur
(départ à la retraite, 2055 par défaut).

Les clés restent dans les secrets Streamlit. Le service reçoit uniquement des
agrégats du portefeuille, jamais les identifiants Supabase ni les écritures. La
question, elle, part chez le moteur de recherche extérieur : les montants en sont
retirés par le service avant l'envoi, et la case ci-dessous permet de tout
couper.
"""
from __future__ import annotations

import datetime as dt
import json
import urllib.error
import urllib.request

import streamlit as st

from core import session as S
from core import ui

st.set_page_config(page_title="IA", page_icon="◈", layout="wide")
ui.styliser_navigation()
st.title("◈ Université de l’Épargne — IA")
st.caption(
    "L’assistant répond en trois temps : « Selon le corpus, … », puis « En me basant sur tes "
    "données, sur le corpus et sur les informations extérieures que j’ai trouvées, … », puis ce "
    "qui dépend de toi. Chaque réponse est jugée à l’aune de ton horizon de long terme."
)


def secret(nom: str) -> str:
    try:
        return str(st.secrets.get(nom, "")).strip()
    except Exception:
        return ""


def reparer_adresse(u: str) -> str:
    """Rend utilisable une adresse collée en lien markdown, entre guillemets ou sans https.

    Exemple vu : « [a.dev/sante](http://a.dev/sante) » -> « https://a.dev ».
    """
    u = u.strip().strip('"').strip("'").strip("<>").strip()
    if not u:
        return ""
    if u.startswith("[") and "](" in u:
        u = u.split("](", 1)[0]
        u = u.lstrip("[")
    u = u.rstrip("/")
    for route in ("/sante", "/discussion", "/contexte", "/admin"):
        if route in u:
            u = u.split(route, 1)[0]
    if not u.startswith(("http://", "https://")):
        u = "https://" + u
    elif u.startswith("http://") and not any(h in u for h in ("localhost", "127.0.0.1", "[::1]")):
        u = "https://" + u[7:]
    return u


URL_BRUT = secret("UDE_URL")
URL = reparer_adresse(URL_BRUT)
if URL_BRUT and URL != URL_BRUT.rstrip("/"):
    st.warning("Adresse du service corrigée automatiquement : " + URL)


CLE = secret("UDE_CLE_SERVICE")


def requete(route: str, corps: dict | None = None) -> dict:
    data = json.dumps(corps or {}).encode("utf-8")
    req = urllib.request.Request(
        URL + route,
        data=data,
        headers={
            "content-type": "application/json",
            "x-cle-service": CLE,
            "User-Agent": "MonPortefeuille-streamlit/1.0 (+https://github.com/flaviensaillard/MonPortefeuille2)",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:300]
        raise RuntimeError(f"Service IA : HTTP {e.code} — {detail}") from e


def nombre_secret(nom: str, defaut):
    """Un réglage facultatif dans les secrets Streamlit, sinon la valeur par défaut."""
    brut = secret(nom)
    if not brut:
        return defaut
    try:
        return int(float(brut))
    except ValueError:
        return defaut


# L’horizon part avec chaque question. Il vient des secrets s’ils existent
# (`IA_HORIZON_ANNEE`), sinon de la configuration de l’application : la même
# valeur que la page Retraite, pour que les deux écrans ne divergent jamais.
from core import config as _config

ANNEE_DEPART = nombre_secret("IA_HORIZON_ANNEE", _config.DEFAUTS.annee_depart_retraite)
OBJECTIF = secret("IA_OBJECTIF") or (
    f"préparer la retraite : disposer à partir de {ANNEE_DEPART} d’un capital qui verse "
    "un revenu réel, sans entamer le pouvoir d’achat"
)


def horizon() -> dict:
    annee_courante = dt.date.today().year
    return {
        "anneeDepartRetraite": ANNEE_DEPART,
        "anneesRestantes": max(0, ANNEE_DEPART - annee_courante),
        "objectif": OBJECTIF,
    }


def agregats(ctx) -> dict:
    investi = float(ctx.total_investi_eur or 0)
    poches = []
    for e in ctx.ecarts:
        poches.append({
            "nom": e.poche_nom,
            "poids": round(float(e.poids_reel), 4),
            "cible": round(float(e.poids_cible), 4),
            "bande": round(float(e.bande), 4),
            "horsBande": bool(e.hors_bande),
        })
    actifs = sorted(ctx.actifs, key=lambda a: float(a.valeur_eur or 0), reverse=True)
    premiere = None
    if not ctx.snapshots.empty:
        try:
            col = "Date" if "Date" in ctx.snapshots.columns else "date"
            premiere = str(ctx.snapshots[col].min())[:10]
        except Exception:
            pass
    return {
        "horizon": horizon(),
        "uniteDeCompte": "EUR",
        "datePremierEnregistrement": premiere,
        "patrimoineTotal": round(float(ctx.patrimoine_total_eur or 0)),
        "capitalInvesti": round(investi),
        "cashDisponible": round(float(ctx.total_courant_eur or 0)),
        "epargnePrecaution": round(float(ctx.total_precaution_eur or 0)),
        "cagrInvestiPct": round((S.twr_annualise_portefeuille(ctx) or 0) * 100, 2),
        "poches": poches,
        "principalesLignes": [
            {"ticker": a.ticker, "poids": round(float(a.valeur_eur or 0) / investi, 4) if investi else 0}
            for a in actifs[:8]
        ],
    }


if not URL or not CLE:
    st.error(
        "L’IA n’est pas encore configurée. Dans Streamlit Cloud : votre application > "
        "Settings > Secrets, ajoutez UDE_URL et UDE_CLE_SERVICE, puis redémarrez l’application."
    )
    st.code('UDE_URL = "https://universite-epargne.VOTRE-NOM.workers.dev"\nUDE_CLE_SERVICE = "VOTRE_CLE"')
    st.stop()

ctx = S.charger()

# État et date du corpus
try:
    etat = requete("/sante")
    corpus = etat.get("corpus") or {}
    if corpus.get("majLe"):
        date_txt = str(corpus["majLe"]).replace("T", " ")[:16]
        st.success(f"Corpus mis à jour le {date_txt} UTC — {corpus.get('passages', '?')} passages.")
    else:
        st.warning("Corpus jamais indexé : terminez l’étape d’indexation du guide.")
    if etat.get("branchements", {}).get("supabase"):
        st.caption("✓ Le service Cloudflare peut lire les agrégats Supabase.")
except Exception as exc:
    st.error(f"Service IA inaccessible : {exc}")

colonne_gauche, colonne_droite = st.columns(2)
with colonne_gauche:
    joindre = st.checkbox(
        "Joindre mes agrégats de portefeuille", value=True,
        help="Capital, poids des poches, CAGR et concentrations. Aucun identifiant ni détail fiscal.",
    )
with colonne_droite:
    internet = st.checkbox(
        "Autoriser la recherche extérieure", value=True,
        help="L’assistant complète le corpus par des sources trouvées sur le web. "
             "Les montants sont retirés de la recherche avant l’envoi ; la question, elle, part "
             "chez le moteur. Décochez pour que rien ne sorte.",
    )

st.caption(
    f"Horizon transmis à l’assistant : départ à la retraite en {ANNEE_DEPART} "
    f"({horizon()['anneesRestantes']} ans)."
)

if "ude_messages" not in st.session_state:
    st.session_state.ude_messages = []

for m in st.session_state.ude_messages:
    with st.chat_message(m["role"]):
        st.markdown(m["contenu"])
        if m.get("sources"):
            st.markdown("**Sources du corpus :**")
            for source in m["sources"]:
                titre = source.get("titre") or "Source"
                url = source.get("url") or ""
                st.markdown(f"- [{titre}]({url})" if url else f"- {titre}")
        for source in (m.get("sourcesExternes") or []):
            titre = source.get("titre") or source.get("domaine") or "Source extérieure"
            url = source.get("url") or ""
            numero = source.get("numero") or "E"
            st.markdown(f"- **[{numero}]** " + (f"[{titre}]({url})" if url else titre))
        if m.get("internet", {}).get("note"):
            st.caption("Recherche extérieure — " + str(m["internet"]["note"]))
        elif m.get("internet", {}).get("utilise"):
            st.caption(
                f"Recherche extérieure : {m['internet'].get('resultats', 0)} résultat(s), "
                f"{m['internet'].get('pagesLues', 0)} page(s) lue(s)"
                + (f" · moteur : {m['internet']['moteur']}" if m["internet"].get("moteur") else "")
            )
        if m.get("interpretation"):
            st.warning(
                "Ni le corpus ni l’extérieur n’ont de passage sur ce point : ce qui précède est "
                "une interprétation du modèle, pas une source."
            )
        note = (m.get("verification") or {}).get("note")
        if note:
            if (m.get("verification") or {}).get("gravite") == "info":
                st.caption("Chiffres extérieurs — " + note)
            else:
                st.error("Filet anti-invention — " + note)
        elif (m.get("verification") or {}).get("verifie"):
            st.caption("✓ Chiffres retrouvés dans le corpus, dans les sources extérieures ou dans vos agrégats.")

question = st.chat_input("Posez votre question…")
if question:
    st.session_state.ude_messages.append({"role": "user", "contenu": question})
    with st.chat_message("user"):
        st.markdown(question)
    with st.chat_message("assistant"):
        with st.spinner("Recherche dans le corpus…"):
            try:
                resultat = requete("/discussion", {
                    "question": question,
                    "contexte": agregats(ctx) if joindre else None,
                    "horizon": horizon(),
                    "web": bool(internet),
                })
                texte = resultat.get("reponse", "Réponse vide.")
                st.markdown(texte)
                if resultat.get("interpretation"):
                    st.warning(
                        "Ni le corpus ni l’extérieur n’ont de passage sur ce point : ce qui "
                        "précède est une interprétation du modèle, pas une source."
                    )
                sources = resultat.get("sources") or []
                if sources:
                    st.markdown("**Sources du corpus :**")
                    for source in sources:
                        titre, url = source.get("titre") or "Source", source.get("url") or ""
                        st.markdown(f"- [{titre}]({url})" if url else f"- {titre}")
                externes = resultat.get("sourcesExternes") or []
                if externes:
                    st.markdown("**Sources extérieures (hors corpus) :**")
                    for source in externes:
                        titre = source.get("titre") or source.get("domaine") or "Source extérieure"
                        url = source.get("url") or ""
                        numero = source.get("numero") or "E"
                        date = source.get("date") or ""
                        libelle = titre + (f" · {date}" if date else "")
                        st.markdown(f"- **[{numero}]** " + (f"[{libelle}]({url})" if url else libelle))
                infos = resultat.get("internet") or {}
                if infos.get("note"):
                    st.caption("Recherche extérieure — " + str(infos["note"]))
                elif infos.get("utilise"):
                    st.caption(
                        f"Recherche extérieure : {infos.get('resultats', 0)} résultat(s), "
                        f"{infos.get('pagesLues', 0)} page(s) lue(s)"
                        + (f" · moteur : {infos['moteur']}" if infos.get("moteur") else "")
                    )
                note = (resultat.get("verification") or {}).get("note")
                if note:
                    if (resultat.get("verification") or {}).get("gravite") == "info":
                        st.caption("Chiffres extérieurs — " + note)
                    else:
                        st.error("Filet anti-invention — " + note)
                st.session_state.ude_messages.append({
                    "role": "assistant", "contenu": texte,
                    "sources": sources,
                    "sourcesExternes": externes,
                    "internet": infos,
                    "interpretation": resultat.get("interpretation", False),
                    "verification": resultat.get("verification") or {},
                })
            except Exception as exc:
                st.error(str(exc))

if st.button("Effacer la conversation"):
    st.session_state.ude_messages = []
    st.rerun()

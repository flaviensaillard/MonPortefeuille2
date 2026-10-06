"""Assistant Université de l'Épargne — même service que l'application Android.

Les clés restent dans les secrets Streamlit. Le service reçoit uniquement des
agrégats du portefeuille, jamais les identifiants Supabase ni les écritures.
"""
from __future__ import annotations

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
    "Assistant documenté par le corpus. S’il ne trouve pas la réponse, il écrit : "
    "« Le corpus ne le dit pas, mais selon mon interprétation: … ». "
    "Cette partie donne une idée : ce n’est ni une citation ni une source fiable."
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
        headers={"content-type": "application/json", "x-cle-service": CLE},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:300]
        raise RuntimeError(f"Service IA : HTTP {e.code} — {detail}") from e


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

joindre = st.checkbox(
    "Joindre mes agrégats de portefeuille", value=True,
    help="Capital, poids des poches, CAGR et concentrations. Aucun identifiant ni détail fiscal.",
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
        if m.get("interpretation"):
            st.warning("Interprétation du modèle : elle donne une idée, mais ce n’est pas une source fiable.")
        if m.get("verification", {}).get("note"):
            st.error("Filet anti-invention — " + m["verification"]["note"])
        elif m.get("verification", {}).get("verifie"):
            st.caption("✓ Chiffres retrouvés dans les sources ou dans vos agrégats.")

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
                })
                texte = resultat.get("reponse", "Réponse vide.")
                st.markdown(texte)
                if resultat.get("interpretation"):
                    st.warning("Interprétation du modèle : elle donne une idée, mais ce n’est pas une source fiable.")
                if (resultat.get("verification") or {}).get("note"):
                    st.error("Filet anti-invention — " + resultat["verification"]["note"])
                sources = resultat.get("sources") or []
                if sources:
                    st.markdown("**Sources du corpus :**")
                    for source in sources:
                        titre, url = source.get("titre") or "Source", source.get("url") or ""
                        st.markdown(f"- [{titre}]({url})" if url else f"- {titre}")
                st.session_state.ude_messages.append({
                    "role": "assistant", "contenu": texte,
                    "sources": sources,
                    "interpretation": resultat.get("interpretation", False),
                    "verification": resultat.get("verification") or {},
                })
            except Exception as exc:
                st.error(str(exc))

if st.button("Effacer la conversation"):
    st.session_state.ude_messages = []
    st.rerun()

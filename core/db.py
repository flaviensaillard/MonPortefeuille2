"""Couche d'accès Supabase.

CORRECTIONS PAR RAPPORT À LA V1
-------------------------------
1. **La table `Donnees` disparaît.** Dans la v1, les quantités étaient saisies à
   la main dans `Donnees` en parallèle de `Transaction`, et les deux pouvaient
   diverger sans que rien ne le détecte. Les positions sont désormais un
   *résultat* calculé depuis les transactions. Une seule source de vérité.

2. **Les credentials en dur sont supprimés.** `take_snapshot.py` et `calc_perf.py`
   de la v1 contenaient l'URL et la clé Supabase commitées en clair dans un repo
   public. Ici, tout passe par les variables d'environnement ou les secrets
   Streamlit, et l'absence de credential est une erreur explicite.

3. **Nouvelles tables, préfixe `pf2_`.** La base est partagée avec la v1 : on ne
   touche pas aux tables existantes, on en crée de nouvelles. La v1 continue de
   fonctionner, et la migration est réversible.
"""

from __future__ import annotations

import logging
import os

import pandas as pd
from . import dates

log = logging.getLogger(__name__)


class SecretsManquants(Exception):
    """Les credentials Supabase ne sont pas configurés."""


class ComptesGeresDansAppli(RuntimeError):
    """Un mouvement de cash ne peut plus s'écrire depuis Streamlit.

    Depuis la 2.0, les liquidités sont des comptes (`pf2_comptes`) alimentés par des
    opérations. Écrire le cash dans `Donnees` le ferait disparaître sans erreur, et un
    mouvement écrit sans son lien (transaction ou apport) compterait deux fois après
    une suppression. On refuse donc, avant toute écriture, avec ce message.
    """


MESSAGE_LECTURE_COMPTES = (
    "Les comptes se gèrent dans l’application. Cette page affiche vos liquidités en "
    "lecture seule : soldes, types, banques et opérations."
)

MESSAGE_COMPTES_2_0 = (
    "Les comptes se gèrent dans l’application : depuis la 2.0, les liquidités sont des "
    "comptes. Cette page les affiche en lecture seule ; rien n’a été enregistré."
)


# Tables de la nouvelle application.
T_TRANSACTIONS = "pf2_transactions"
T_APPORTS = "pf2_apports"
T_INVENTAIRE = "pf2_inventaire_crypto"   # 2.1.0 : crypto hors application (T-02)
T_SNAPSHOTS = "pf2_snapshots"
T_COURS = "pf2_cours"
T_FX = "pf2_fx"
T_INFLATION = "pf2_inflation"
T_ALERTES = "pf2_alertes"
T_COMPTES = "pf2_comptes"                    # migrations/003_comptes.sql
T_OPERATIONS_COMPTE = "pf2_operations_compte"

TOUTES_LES_TABLES = (
    T_TRANSACTIONS, T_APPORTS, T_SNAPSHOTS, T_COURS, T_FX, T_INFLATION, T_ALERTES,
)

# Sans ces tables, le robot ne peut pas tourner. Les tables de comptes sont OPTIONNELLES :
# tant que la migration 003 n'est pas passée, les liquidités se lisent dans `Donnees`.
TABLES_REQUISES = TOUTES_LES_TABLES
TABLES_OPTIONNELLES = (T_COMPTES, T_OPERATIONS_COMPTE)

# Tables v1 encore lues par l'application et les outils. Depuis la migration 008
# (revue 2.0.1, S-01 étendu), elles portent un propriétaire, comme les tables pf2_.
TABLES_V1_PROPRIETAIRE = ("Config", "Donnees", "Historique", "Projections", "Transaction")


def _credentials() -> tuple[str, str]:
    """Récupère les credentials. Lève `SecretsManquants` s'ils sont absents."""
    url = os.environ.get("SUPABASE_URL")
    cle = os.environ.get("SUPABASE_KEY")

    if not url or not cle:
        try:
            import streamlit as st
            url = url or st.secrets.get("SUPABASE_URL")
            cle = cle or st.secrets.get("SUPABASE_KEY")
        except Exception:
            pass

    if not url or not cle:
        raise SecretsManquants(
            "Credentials Supabase absents. Définissez SUPABASE_URL et SUPABASE_KEY "
            "en variables d'environnement (GitHub Actions) ou dans "
            ".streamlit/secrets.toml. Aucune valeur de repli n'est fournie : "
            "une application qui devine sa base de données est une application "
            "qui écrit au mauvais endroit."
        )
    return url, cle


_client = None


def client():
    """Client Supabase, mémoïsé."""
    global _client
    if _client is None:
        from supabase import create_client
        url, cle = _credentials()
        _client = create_client(url, cle)
    return _client


def reinitialiser() -> None:
    global _client
    _client = None


# ---------------------------------------------------------------------------
# Lecture / écriture générique
# ---------------------------------------------------------------------------

def _traduire_erreur(table: str, exc: Exception) -> Exception:
    """Transforme une erreur PostgREST en message exploitable.

    Deux cas comptent depuis la migration 004 (revue S-01) :

    - `42501`, la violation de Row Level Security. Les politiques exigent
      `auth.uid() = user_id` : avec la clé publique seule, on ne lit plus rien
      et on n'écrit plus. L'échec dit de s'authentifier (application) ou de
      vérifier la migration 004.

    - `23502`, la contrainte NOT NULL sur `user_id` violée. C'est le cas d'un
      robot qui tourne en `service_role` sans fournir le propriétaire : la clé
      service contourne RLS mais pas la colonne obligatoire. Le correctif est
      la variable `SUPABASE_USER_ID`.
    """
    code = str(getattr(exc, "code", None) or "")
    message = str(getattr(exc, "message", "") or exc)

    if code == "23502" and "user_id" in message:
        return PermissionError(
            f"Écriture sur `{table}` sans propriétaire.\n"
            f"Depuis les migrations 004 et 008, chaque ligne (pf2_ et tables v1) "
            f"exige `user_id`. Les robots et Streamlit (clé service role) doivent "
            f"fournir le propriétaire : ajoutez SUPABASE_USER_ID (l'uid de votre "
            f"compte Supabase), variable d'environnement du job ou secrets.toml.\n"
            f"(détail technique : {message})"
        )
    if code == "42501" or "row-level security" in message:
        return PermissionError(
            f"Écriture refusée sur `{table}` par la sécurité de Supabase "
            f"(Row Level Security).\n"
            f"Les politiques exigent un utilisateur authentifié (auth.uid()). "
            f"La clé publique seule ne suffit plus depuis la migration 004.\n"
            f"Correctif : utilisez un compte via l'application, ou vérifiez que "
            f"`migrations/004_auth_rls.sql` a bien été exécutée.\n"
            f"(détail technique : {message})"
        )
    if code == "PGRST204" or "schema cache" in message:
        return ValueError(
            f"Colonne inconnue dans `{table}` : {message}\n"
            f"Le code écrit une colonne que la table n'a pas. Vérifiez que "
            f"`migrations/001_init.sql` a bien été exécuté en entier."
        )
    return exc


def verifier_ecriture() -> None:
    """Vérifie qu'une écriture est possible, AVANT de lancer l'opération.

    Pourquoi un contrôle séparé : l'échec RLS est **muet en lecture**. Une table
    verrouillée en écriture se comporte comme une table vide — le contrôle
    d'existence la déclare présente, et la catastrophe n'arrive qu'au premier
    INSERT, après des minutes de traitement.

    On sonde donc `pf2_alertes`, la table la plus simple (tous ses champs ont
    une valeur par défaut sauf titre et message), puis on supprime la sonde.
    Si l'écriture est refusée, on lève tout de suite une erreur qui dit quoi
    faire.
    """
    sonde = {
        "titre": "Sonde d'écriture",
        "message": "Ligne de contrôle, supprimée immédiatement.",
    }
    sonde = _avec_proprietaire(T_ALERTES, [sonde])[0]
    try:
        rep = client().table(T_ALERTES).insert(sonde).execute()
    except Exception as exc:
        raise _traduire_erreur(T_ALERTES, exc) from exc

    for ligne in rep.data or []:
        try:
            _restreint_au_proprietaire(
                client().table(T_ALERTES).delete().eq("id", ligne["id"]), T_ALERTES,
            ).execute()
        except Exception:
            # La sonde reste : sans importance, elle est inoffensive et visible.
            log.warning("Sonde d'écriture non supprimée (id=%s).", ligne.get("id"))


# ---------------------------------------------------------------------------
# Pagination (2.1.0, revue D-05) : Supabase limite chaque réponse à 1 000
# lignes. Un unique select("*") tronquait donc l'historique au bout de ~2,7
# ans de snapshots quotidiens — silencieusement. On enchaîne des pages de
# 1 000 lignes sur un ordre STABLE propre à chaque table. Une page qui échoue
# fait échouer toute la lecture : jamais de troncature invisible.
# ---------------------------------------------------------------------------

PAGE_MAX = 1000

ORDRE_PAGINATION = {
    T_TRANSACTIONS: "id",
    T_APPORTS: "id",
    T_INVENTAIRE: "id",
    T_SNAPSHOTS: "date,id",
    T_COURS: "ticker,date",
    T_FX: "devise,contre,date",
    T_INFLATION: "annee",
    T_ALERTES: "id",
    T_COMPTES: "id",
    T_OPERATIONS_COMPTE: "id",
    # Tables v1 encore lues par l'application.
    "Donnees": "id",
    "Transaction": "id",
    "Historique": "id",
    "Projections": "id",
}


def lire(table: str) -> pd.DataFrame:
    """Lit une table entière, page par page.

    Chaque page est demandée avec `.range(debut, fin)` sur un ordre stable ;
    la boucle s'arrête quand une page rend moins de `PAGE_MAX` lignes. Si une
    page échoue, l'exception remonte telle quelle : mieux vaut une erreur
    qu'un historique amputé.
    """
    ordre = ORDRE_PAGINATION.get(table)
    lignes: list[dict] = []
    debut = 0
    while True:
        requete = client().table(table).select("*")
        if ordre:
            requete = requete.order(ordre)
        rep = requete.range(debut, debut + PAGE_MAX - 1).execute()
        page = rep.data or []
        lignes.extend(page)
        if len(page) < PAGE_MAX:
            break
        debut += PAGE_MAX
    return pd.DataFrame(lignes)


def proprietaire_service() -> str | None:
    """UID du propriétaire des lignes écrites par les robots et par Streamlit.

    Depuis les migrations 004 et 008 (revue S-01 étendu), chaque ligne `pf2_` et
    chaque ligne des tables v1 porte un propriétaire (`user_id`, NOT NULL). Les
    robots et Streamlit tournent avec la clé `service_role`, qui contourne RLS :
    `auth.uid()` est donc nul pour eux, et ils doivent fournir l'uid.

    Source, dans l'ordre : la variable d'environnement `SUPABASE_USER_ID` (secret
    GitHub Actions des robots), puis `.streamlit/secrets.toml` pour l'application
    lancée en local. Sans uid, rien n'est inventé : l'écriture échoue AVANT l'envoi
    (ProprietaireAbsent). C'est voulu : un robot ne doit jamais écrire de ligne
    apatride.
    """
    uid = os.environ.get("SUPABASE_USER_ID")
    if not uid:
        try:
            import streamlit as st
            uid = st.secrets.get("SUPABASE_USER_ID")
        except Exception:
            uid = None
    return uid or None


class ProprietaireAbsent(PermissionError):
    """Écriture serveur sur une table propriétaire, alors que SUPABASE_USER_ID manque.

    Levée AVANT tout envoi à la base (revue robots, 2.1.0) : rien ne part, aucun NULL
    n'est écrit. Sous-classe de PermissionError : même famille que le refus de la base,
    et les appelants existants (pages, tests v1) la traitent de la même façon.
    """


def _est_proprietaire(table: str) -> bool:
    """Tables dont chaque ligne porte un propriétaire (migrations 004 et 008)."""
    return table.startswith("pf2_") or table in TABLES_V1_PROPRIETAIRE


def _uid_requis(table: str) -> str:
    """L'uid du propriétaire, ou ProprietaireAbsent. Jamais de repli."""
    uid = proprietaire_service()
    if not uid:
        raise ProprietaireAbsent(
            f"Écriture sur `{table}` sans propriétaire.\n"
            "Les robots et l'application (clé service_role) doivent connaître l'uid de "
            "votre compte : ajoutez le secret SUPABASE_USER_ID (GitHub Actions : "
            "Settings > Secrets and variables > Actions ; en local : .streamlit/secrets.toml).\n"
            "Rien n'a été envoyé à la base."
        )
    return uid


def _avec_proprietaire(table: str, lignes: list[dict]) -> list[dict]:
    """Point de passage unique des insertions et upserts serveur (revue robots, 2.1.0).

    Toute ligne d'une table propriétaire reçoit `user_id = SUPABASE_USER_ID`. Sans uid,
    on lève ProprietaireAbsent AVANT l'envoi : jamais de ligne apatride, et l'échec dit
    quoi faire. Une ligne qui désigne un AUTRE propriétaire est refusée, pas réattribuée.
    """
    if not _est_proprietaire(table) or not lignes:
        return lignes
    uid = _uid_requis(table)
    for ligne in lignes:
        if ligne.get("user_id") not in (None, "", uid):
            raise ValueError(
                f"Écriture sur `{table}` : ligne attribuée à un autre propriétaire "
                "que SUPABASE_USER_ID. Refusée.")
    return [{**ligne, "user_id": uid} for ligne in lignes]


def _restreint_au_proprietaire(requete, table: str):
    """Restreint une mise à jour ou une suppression au propriétaire (revue robots, 2.1.0).

    La clé service_role contourne RLS : `delete().eq("id", 42)` supprimerait la ligne 42
    de n'importe quel propriétaire. Tout filtre d'écriture sur une table propriétaire
    ajoute donc `user_id = SUPABASE_USER_ID`, et échoue sans uid.
    """
    if not _est_proprietaire(table):
        return requete
    return requete.eq("user_id", _uid_requis(table))


def ecrire(table: str, lignes: list[dict]) -> int:
    """Insère des lignes. Retourne le nombre inséré."""
    if not lignes:
        return 0
    try:
        rep = client().table(table).insert(_avec_proprietaire(table, lignes)).execute()
    except Exception as exc:
        raise _traduire_erreur(table, exc) from exc
    return len(rep.data or [])


def remplacer(table: str, lignes: list[dict], on_conflict: str | None = None) -> None:
    """Insère ou met à jour des lignes (upsert), de façon idempotente.

    CORRECTION : la première version faisait `delete().neq("id", -1)` puis
    réinsérait. Deux défauts. D'abord, `pf2_cours`, `pf2_fx` et `pf2_inflation`
    n'ont pas de colonne `id`, donc le delete échouait. Ensuite, un delete suivi
    d'un insert n'est pas idempotent : une panne entre les deux perd les données.

    L'upsert règle les deux problèmes. `on_conflict` permet de cibler un index
    unique quand la clé primaire n'est pas la bonne — cas de `pf2_transactions`,
    dont la clé primaire est `id` mais dont l'unicité réelle porte sur le tuple
    ticker/sens/date/quantite/cours.

    ATTENTION à la forme de l'appel : dans postgrest-py (le client bas niveau de
    supabase-py), `on_conflict` est un **paramètre mot-clé de `upsert()`**, pas
    une méthode chaînable. `builder.upsert(...).on_conflict(...)` lève
    `AttributeError: 'SyncQueryRequestBuilder' object has no attribute
    'on_conflict'`. Il faut donc `upsert(lignes, on_conflict=...)`.

    Aucune suppression ici : un upsert ne supprime rien. Le propriétaire est injecté
    par `_avec_proprietaire`, qui échoue avant l'envoi si SUPABASE_USER_ID manque.
    """
    if not lignes:
        return
    try:
        requete = client().table(table).upsert(
            _avec_proprietaire(table, lignes), on_conflict=on_conflict or "")
        requete.execute()
    except Exception as exc:
        raise _traduire_erreur(table, exc) from exc


def maj_ligne(table: str, id_ligne, champs: dict) -> None:
    """Met à jour une ligne par son `id`, restreint au propriétaire (2.1.0)."""
    try:
        requete = client().table(table).update(champs).eq("id", id_ligne)
        _restreint_au_proprietaire(requete, table).execute()
    except Exception as exc:
        raise _traduire_erreur(table, exc) from exc


def supprimer_lignes(table: str, *, dans: tuple[str, list] | None = None, **egal) -> None:
    """Supprime les lignes de `table` qui satisfont TOUS les filtres, et seulement celles
    du propriétaire (revue robots, 2.1.0).

    Filtres : `colonne=valeur` (égalités) et, à part, `dans=(colonne, valeurs)`.
    Sans aucun filtre, la fonction refuse : ce module ne sait pas supprimer une table
    entière. L'import v1 le faisait, sans filtre propriétaire.
    """
    if not egal and dans is None:
        raise ValueError(f"Suppression sur `{table}` sans filtre : refusée.")
    try:
        requete = client().table(table).delete()
        for colonne, valeur in egal.items():
            requete = requete.eq(colonne, valeur)
        if dans is not None:
            requete = requete.in_(dans[0], list(dans[1]))
        _restreint_au_proprietaire(requete, table).execute()
    except Exception as exc:
        raise _traduire_erreur(table, exc) from exc


def existe(table: str) -> bool:
    """Vrai si la table existe et est accessible.

    CORRECTION : la v1 de cette fonction faisait `select("id")`, ce qui supposait
    que toute table possède une colonne `id`. Ce n'est pas le cas de `pf2_cours`,
    `pf2_fx` et `pf2_inflation`, dont la clé primaire est composite. On interroge
    donc `*` avec une limite d'une ligne : ça marche quelle que soit la structure.
    """
    try:
        client().table(table).select("*").limit(1).execute()
        return True
    except Exception as exc:
        log.warning("Table %s inaccessible : %s", table, exc)
        return False


def tables_presentes() -> dict[str, bool]:
    """État de toutes les tables attendues (requises et optionnelles) — pour l'affichage."""
    return {t: existe(t) for t in TABLES_REQUISES + TABLES_OPTIONNELLES}


def tables_requises_manquantes() -> list[str]:
    """Les tables REQUISES absentes. Une table optionnelle absente n'arrête rien."""
    return [t for t in TABLES_REQUISES if not existe(t)]


def comptes_liquidites() -> list[dict] | None:
    """Lignes de `pf2_comptes`. None si la table n'existe pas : on lit alors Donnees.

    Une table présente mais vide renvoie []. Une erreur de lecture est levée, pas avalée.
    """
    if not existe(T_COMPTES):
        return None
    rep = client().table(T_COMPTES).select("*").execute()
    return rep.data or []


def operations_compte() -> list[dict]:
    """Toutes les opérations de comptes (le solde se calcule à partir d'elles)."""
    rep = client().table(T_OPERATIONS_COMPTE).select("*").execute()
    return rep.data or []


def cash_gere_par_comptes() -> bool:
    """Vrai quand au moins un compte existe : les liquidités viennent alors des comptes."""
    return bool(comptes_liquidites())


def verifier_ecriture_cash() -> None:
    """Lève `ComptesGeresDansAppli` si le cash ne doit plus s'écrire depuis Streamlit.

    À appeler AVANT la première écriture d'un mouvement : une transaction écrite puis un
    cash refusé laisserait une transaction sans son mouvement de compte.
    """
    if cash_gere_par_comptes():
        raise ComptesGeresDansAppli(MESSAGE_COMPTES_2_0)


# ---------------------------------------------------------------------------
# Accès métier
# ---------------------------------------------------------------------------

def transactions() -> pd.DataFrame:
    return lire(T_TRANSACTIONS)


def apports() -> pd.DataFrame:
    return lire(T_APPORTS)


def snapshots() -> pd.DataFrame:
    """Lit `pf2_snapshots`, colonne de date renommee en `Date`.

    La table stocke `date` en snake_case (voyez migrations/001_init.sql) ; les
    pages, elles, lisent `Date` — comme pour les transactions, ou
    `ALIAS_COLONNES` fait le meme pont. Sans ce renommage, la PREMIERE ligne de
    `pf2_snapshots` faisait sauter toute l'application avec `KeyError: 'Date'`.

    Le defaut est reste invisible des mois parce que la table etait vide : le
    `if df.empty` court-circuitait avant la ligne fautive. Il a surgi le jour ou
    la reconstitution de l'historique a enfin ecrit des lignes. Un garde-fou
    contre une table vide ne prouve rien sur une table pleine.
    """
    df = lire(T_SNAPSHOTS)
    if df.empty:
        return df

    # La colonne de date s'appelle `date` dans le schéma pf2, mais `Date` dans
    # un import v1. On accepte les deux. Si elle n'a aucun des deux noms, on le
    # DIT au lieu de laisser un `KeyError: 'Date'` muet : l'utilisateur ne peut
    # pas corriger ce qu'il ne peut pas voir.
    colonne = next((c for c in ("Date", "date") if c in df.columns), None)
    if colonne is None:
        raise ValueError(
            "La table pf2_snapshots n'a aucune colonne de date. Colonnes "
            f"trouvées : {', '.join(map(str, df.columns))}. Exécutez "
            "migrations/001_init.sql dans Supabase."
        )
    if colonne != "Date":
        df = df.rename(columns={colonne: "Date"})

    # COMPLÉTUDE (2.1.0, revues D-01 / F-20) : un snapshot marqué
    # `complet = false` est une valorisation partielle (cours ou taux manquant).
    # Il reste en base, visible et alerté, mais il n'entre JAMAIS dans les
    # séries : TWR, retraite et graphiques ne doivent pas consommer un point
    # qui ne représente qu'une partie du patrimoine. Les lignes antérieures à
    # la migration 005 n'ont pas la colonne : elles restent toutes admises.
    if "complet" in df.columns:
        partiels = df["complet"].eq(False)
        if partiels.any():
            log.info(
                "%d snapshot(s) partiel(s) écarté(s) des séries : %s",
                int(partiels.sum()),
                ", ".join(map(str, df.loc[partiels, "Date"].tolist()[:10])),
            )
        df = df[~partiels]

    df["Date_DT"] = dates.parser(df["Date"])
    return df.dropna(subset=["Date_DT"]).sort_values("Date_DT").reset_index(drop=True)


def inflation() -> pd.DataFrame:
    """Lit `pf2_inflation`, colonnes renommées en `Annee` / `Inflation`.

    DÉFAUT TROUVÉ À L'AUDIT — c'est LUI qui vidait la page Performance.

    La table stocke `annee` et `inflation` en minuscules (voyez
    migrations/001_init.sql). Toutes les pages, elles, lisent `Annee` et
    `Inflation`, en majuscules. `snapshots()` faisait déjà ce pont pour `date`
    -> `Date` ; `inflation()` ne le faisait pas.

    Conséquence : `session._inflation_par_annee` cherchait `Annee`, ne la
    trouvait pas, et retournait un dictionnaire VIDE — sans erreur, sans
    message. Le robot écrivait bien les chiffres en base ; l'application ne les
    voyait jamais. La page Performance affichait « ⚠️ non renseignée » pour
    chaque année, et la performance réelle était incalculable.

    Le défaut a survécu parce qu'il était SILENCIEUX. Une table vide et une
    table illisible produisaient exactement le même résultat. C'est pourquoi
    cette fonction lève maintenant une erreur explicite quand elle trouve des
    lignes qu'elle ne sait pas nommer.
    """
    df = lire(T_INFLATION)
    if df.empty:
        return df

    renommage = {}
    for attendu, candidats in (
        ("Annee", ("Annee", "annee")),
        ("Inflation", ("Inflation", "inflation")),
    ):
        colonne = next((c for c in candidats if c in df.columns), None)
        if colonne is None:
            raise ValueError(
                f"La table pf2_inflation n'a pas de colonne « {attendu} ». "
                f"Colonnes trouvées : {', '.join(map(str, df.columns))}. "
                "Exécutez migrations/001_init.sql dans Supabase."
            )
        if colonne != attendu:
            renommage[colonne] = attendu
    if renommage:
        df = df.rename(columns=renommage)
    return df


def ajouter_snapshot(ligne: dict) -> None:
    """Ajoute un snapshot daté, de façon idempotente.

    Utilise l'upsert sur la contrainte d'unicité de `date` : relancer le robot
    deux fois le même jour met à jour la ligne au lieu d'en créer une deuxième.
    """
    try:
        ligne = _avec_proprietaire(T_SNAPSHOTS, [ligne])[0]
        client().table(T_SNAPSHOTS).upsert(ligne, on_conflict="date").execute()
    except Exception as exc:
        raise _traduire_erreur(T_SNAPSHOTS, exc) from exc


def ajouter_alerte(titre: str, message: str, niveau: str = "info") -> None:
    """Écrit une alerte dans `pf2_alertes`.

    CORRECTION : cette fonction écrivait `Date`, `Titre`, `Message`, `Niveau`
    avec une majuscule, alors que la table déclare `date`, `titre`, `message`,
    `niveau`. PostgreSQL replie les identifiants non quotés, donc ça passait
    souvent — mais c'est fragile, incohérent avec le reste du code, et ça
    cassait dès qu'une politique ou une vue intervenait.

    On écrit donc les noms exacts du schéma. Et on ne fournit plus `date` : la
    colonne est `timestamptz default now()`, l'horodatage appartient à la base,
    pas au client.
    """
    ecrire(T_ALERTES, [{
        "titre": titre,
        "message": message,
        "niveau": niveau,
    }])



class ErreurConfigFiscale(RuntimeError):
    """La configuration fiscale (table `Config`) ne peut être ni lue ni écrite.

    Revue 2.0.1, T-07 : une lecture en échec ne retombe JAMAIS sur des valeurs
    personnelles, et une écriture refusée n'est JAMAIS présentée comme réussie.
    """


def lire_config_fiscale() -> dict[str, str]:
    """Lit la configuration fiscale de la table `Config` (v1), sans repli personnel.

    Les clés d'identité ont un défaut NEUTRE (premier usage). Les données annuelles
    n'ont aucun défaut : une année sans donnée reste une lacune (voir core/foyer.py).

    Lève `ErreurConfigFiscale` si la lecture échoue.
    """
    defauts = {
        "f_statut": "Célibataire / Divorcé(e) / Veuf(ve)",
        "f_enf": "0",
        "f_parts": "1.0",
        "f_pays_etr": "",
    }
    try:
        df = lire("Config")
    except Exception as exc:
        raise ErreurConfigFiscale(f"lecture de la table Config impossible ({exc})") from exc
    if df is not None and not df.empty and {"Clé", "Valeur"} <= set(df.columns):
        for _, r in df.iterrows():
            k = str(r.get("Clé") or "").strip()
            v = r.get("Valeur")
            if k and v is not None and pd.notna(v):
                defauts[k] = str(v)
    return defauts


def sauver_config_fiscale(modifs: dict[str, object]) -> None:
    """Met à jour les clés fiscales dans la table `Config`.

    Lève `ErreurConfigFiscale` à la moindre écriture refusée : l'appelant ne doit
    jamais croire qu'une donnée est enregistrée alors qu'elle ne l'est pas.
    """
    if not modifs:
        return
    try:
        c = client()
        df = lire("Config")
        existantes: dict[str, int] = {}
        if df is not None and not df.empty and {"Clé", "id"} <= set(df.columns):
            for _, r in df.iterrows():
                k = str(r.get("Clé") or "").strip()
                if k and pd.notna(r.get("id")):
                    existantes[k] = int(r["id"])
        for k, v in modifs.items():
            val_str = "true" if v is True else ("false" if v is False else str(v))
            if k in existantes:
                _restreint_au_proprietaire(
                    c.table("Config").update({"Valeur": val_str}).eq("id", existantes[k]),
                    "Config").execute()
            else:
                c.table("Config").insert(
                    _avec_proprietaire("Config", [{"Clé": k, "Valeur": val_str}])[0]).execute()
    except Exception as exc:
        raise ErreurConfigFiscale(
            f"écriture de la table Config impossible ({_traduire_erreur('Config', exc)})") from exc


def inventaire_crypto() -> pd.DataFrame:
    """Soldes crypto détenus hors application (`pf2_inventaire_crypto`), 2.1.0 (T-02)."""
    return lire(T_INVENTAIRE)


def enregistrer_inventaire_crypto(lignes: list[dict], ids_supprimes: list[int]) -> None:
    """Crée, met à jour et supprime les soldes d'inventaire crypto.

    Une ligne sans `id` est créée, une ligne avec `id` est mise à jour, les
    `ids_supprimes` sont effacés. Toute erreur remonte : rien n'est avalé.
    """
    try:
        cl = client()
        for i in ids_supprimes:
            _restreint_au_proprietaire(
                cl.table(T_INVENTAIRE).delete().eq("id", int(i)), T_INVENTAIRE).execute()
        for ligne in lignes:
            champs = {k: v for k, v in ligne.items() if k != "id" and v is not None}
            if ligne.get("id") is not None:
                _restreint_au_proprietaire(
                    cl.table(T_INVENTAIRE).update(champs).eq("id", int(ligne["id"])),
                    T_INVENTAIRE).execute()
            else:
                cl.table(T_INVENTAIRE).insert(_avec_proprietaire(T_INVENTAIRE, [champs])).execute()
    except Exception as exc:
        raise _traduire_erreur(T_INVENTAIRE, exc) from exc


def lire_allocation_personnalisee() -> dict:
    """Lit la configuration d'allocation personnalisée (`pf2_allocation_json`) dans `Config`.

    Retourne le plan par défaut (`models.allocation_par_defaut()`) si aucune
    configuration personnalisée n'est enregistrée en base.
    """
    import json
    from .models import _migrer_poche_rv, allocation_par_defaut

    defaut = allocation_par_defaut()
    try:
        df = lire("Config")
        if df is not None and not df.empty and {"Clé", "Valeur"} <= set(df.columns):
            for _, r in df.iterrows():
                k = str(r.get("Clé") or "").strip()
                if k == "pf2_allocation_json":
                    v = r.get("Valeur")
                    if v is not None and pd.notna(v) and str(v).strip():
                        data = json.loads(str(v))
                        if isinstance(data, dict) and data.get("actifs"):
                            poches_m, actifs_m = _migrer_poche_rv(
                                list(data.get("poches") or defaut["poches"]),
                                list(data.get("actifs")),
                            )
                            return {"poches": poches_m, "actifs": actifs_m}
    except Exception:
        pass
    return defaut


def sauver_allocation_personnalisee(cfg_alloc: dict) -> None:
    """Sauvegarde la configuration d'allocation personnalisée (`pf2_allocation_json`) dans `Config`."""
    import json

    val_str = json.dumps(cfg_alloc, ensure_ascii=False)
    sauver_config_fiscale({"pf2_allocation_json": val_str})




PREFIXE_COURS_REFERENCE = "cours_ref:"


def valider_cours_de_reference(ticker: str, cours: float, devise: str, date_iso: str,
                               aujourdhui=None) -> dict:
    """Contrôle une saisie de cours de référence avant écriture. Lève `ValueError`.

    Un cours de référence ne vaut que s'il est fini, positif, daté au plus de
    `prices.DUREE_REFERENCE_MAX_JOURS` jours avant aujourd'hui, et jamais futur.
    """
    import datetime as _dt
    import math

    from . import prices

    t = str(ticker).upper().strip()
    if not t:
        raise ValueError("ticker manquant")
    if not (isinstance(cours, (int, float)) and math.isfinite(cours) and cours > 0):
        raise ValueError("le cours doit être un nombre strictement positif")
    devise = str(devise).upper().strip()
    if len(devise) != 3 or not devise.isalpha():
        raise ValueError("devise : code à trois lettres attendu (ex. EUR)")
    try:
        jour = _dt.date.fromisoformat(str(date_iso)[:10])
    except ValueError as exc:
        raise ValueError("date : format AAAA-MM-JJ attendu") from exc
    today = aujourdhui or _dt.date.today()
    age = (today - jour).days
    if age < 0:
        raise ValueError("la date ne peut pas être dans le futur")
    if age > prices.DUREE_REFERENCE_MAX_JOURS:
        raise ValueError(
            f"cours daté du {jour.isoformat()} : plus de {prices.DUREE_REFERENCE_MAX_JOURS} "
            "jours, refusé (une référence plus ancienne ne sert à rien)")
    return {"cours": float(cours), "devise": devise, "date": jour.isoformat()}


def cours_de_reference() -> dict[str, dict]:
    """Cours de référence saisis à la main, lus dans `Config` (clés `cours_ref:TICKER`).

    Une entrée illisible est ignorée (et écartée par `prices.cotation_actuelle`).
    Lève l'exception de lecture si `Config` est injoignable : l'appelant décide.
    """
    import json

    res: dict[str, dict] = {}
    df = lire("Config")
    if df is None or df.empty or not {"Clé", "Valeur"} <= set(df.columns):
        return res
    for _, r in df.iterrows():
        cle = str(r.get("Clé") or "").strip()
        if not cle.startswith(PREFIXE_COURS_REFERENCE):
            continue
        try:
            data = json.loads(str(r.get("Valeur") or ""))
        except ValueError:
            continue
        if isinstance(data, dict):
            res[cle[len(PREFIXE_COURS_REFERENCE):].upper()] = data
    return res


def sauver_cours_de_reference(ticker: str, cours: float, devise: str, date_iso: str,
                              aujourdhui=None) -> dict:
    """Enregistre un cours de référence saisi à la main, après contrôle. Lève `ValueError`
    si la saisie est refusée, `ErreurConfigFiscale` si l'écriture échoue."""
    import json

    valeur = valider_cours_de_reference(ticker, cours, devise, date_iso, aujourdhui)
    cle = PREFIXE_COURS_REFERENCE + str(ticker).upper().strip()
    sauver_config_fiscale({cle: json.dumps(valeur, ensure_ascii=False)})
    return valeur


def variations_donnees_v1() -> dict[str, dict]:
    """Lit les derniers cours et variations enregistrés dans la table `Donnees` (v1).

    Retourne `{ticker: {"cours_usd": float | None, "var_fraction": float | None}}`.
    """
    import re
    res: dict[str, dict] = {}
    try:
        df = lire("Donnees")
        if df is not None and not df.empty and "Ticker" in df.columns:
            for _, r in df.iterrows():
                t = str(r.get("Ticker") or "").strip().upper()
                if not t:
                    continue
                cours_u: float | None = None
                for col_c in ("Court Num", "Court"):
                    val_c = r.get(col_c)
                    if val_c is not None and pd.notna(val_c):
                        m_c = re.search(r"([+-]?\d+(?:[.,]\d+)?)", str(val_c).replace(" ", "").replace("\u202f", ""))
                        if m_c:
                            try:
                                v_f = float(m_c.group(1).replace(",", "."))
                                if v_f > 0:
                                    cours_u = v_f
                                    break
                            except Exception:
                                pass
                var_f: float | None = None
                for col_v in ("Var. Jour 🔒", "Var. Jour"):
                    if col_v in df.columns:
                        val_v = r.get(col_v)
                        if val_v is not None and pd.notna(val_v):
                            s_v = str(val_v).strip()
                            m_v = re.search(r"([+-]?\d+(?:[.,]\d+)?)", s_v.replace(" ", ""))
                            if m_v:
                                try:
                                    pct_val = float(m_v.group(1).replace(",", "."))
                                    if "↘" in s_v or "-" in s_v:
                                        pct_val = -abs(pct_val)
                                    elif "↗" in s_v or "+" in s_v:
                                        pct_val = abs(pct_val)
                                    var_f = pct_val / 100.0
                                    break
                                except Exception:
                                    pass
                res[t] = {"cours_usd": cours_u, "var_fraction": var_f}
    except Exception:
        pass
    return res


def soldes_comptes_liquidites() -> dict[str, dict]:
    """État des liquidités, même forme qu'avant la 2.0 : {devise: {ticker, nom, type,
    perimetre, quantite}}.

    Comptes renseignés → lus dans `pf2_comptes` et `pf2_operations_compte`, groupés par
    devise. Une devise qui a des comptes dans les deux poches garde deux entrées, clées
    `DEVISE:poche`. Sinon (table absente ou vide) → lecture de `Donnees`, comme la v1.
    """
    try:
        comptes = comptes_liquidites()
    except Exception as exc:
        log.warning("Comptes de liquidités illisibles, repli sur Donnees : %s", exc)
        comptes = None
    if comptes:
        from .portfolio import grouper_liquidites
        groupes = grouper_liquidites(comptes, operations_compte())
        par_devise: dict[str, int] = {}
        for g in groupes:
            par_devise[g["devise"]] = par_devise.get(g["devise"], 0) + 1
        resultat: dict[str, dict] = {}
        for g in groupes:
            cle = g["devise"] if par_devise[g["devise"]] == 1 else f'{g["devise"]}:{g["perimetre"]}'
            resultat[cle] = {
                "ticker": g["devise"],
                "nom": f'{g["devise"]} — ' + ("épargne de précaution" if g["perimetre"] == "precaution" else "compte courant"),
                "type": "🏦 Cash réserve" if g["perimetre"] == "precaution" else "💵 Cash",
                "perimetre": g["perimetre"],
                "quantite": g["quantite"],
            }
        return resultat

    comptes_defaut = [
        {"ticker": "USD", "nom": "💵 Compte courant USD (Cash disponible)", "type": "💵 Cash", "perimetre": "courant", "quantite": 0.0},
        {"ticker": "EUR", "nom": "💵 Compte courant EUR (Cash disponible)", "type": "💵 Cash", "perimetre": "courant", "quantite": 0.0},
        {"ticker": "CHF", "nom": "🏦 Épargne de précaution — Réserve CHF", "type": "🏦 Cash réserve", "perimetre": "precaution", "quantite": 0.0},
        {"ticker": "CNY", "nom": "🏦 Épargne de précaution — Réserve CNY", "type": "🏦 Cash réserve", "perimetre": "precaution", "quantite": 0.0},
    ]
    par_ticker = {c["ticker"]: dict(c) for c in comptes_defaut}
    try:
        df = lire("Donnees")
        if df is not None and not df.empty and "Ticker" in df.columns:
            for _, r in df.iterrows():
                t = str(r.get("Ticker") or "").strip().upper()
                typ = str(r.get("Type") or "")
                if t in par_ticker or "Cash" in typ:
                    try:
                        q = float(str(r.get("Quantité") or 0.0).replace(",", ".").replace(" ", ""))
                    except Exception:
                        q = 0.0
                    if t not in par_ticker:
                        par_ticker[t] = {
                            "ticker": t,
                            "nom": f"{typ or '💵 Cash'} ({t})",
                            "type": typ or "💵 Cash",
                            "perimetre": "precaution" if "réserve" in typ.lower() else "courant",
                            "quantite": q,
                        }
                    else:
                        par_ticker[t]["quantite"] = q
    except Exception:
        pass
    return par_ticker


def ajuster_solde_compte(
    ticker: str,
    delta_quantite: float,
    type_defaut: str = "💵 Cash",
    taux_usd: float | None = None,
) -> float:
    """Ajoute `delta_quantite` (positif ou négatif) à la ligne `ticker` dans `Donnees`.

    `taux_usd` est le cours de la devise en dollars (1.0 pour le dollar lui-même).
    Il est obligatoire : sans lui, la valeur en dollars de la ligne ne peut pas être
    écrite, et aucun taux de remplacement n'est inventé. Lève ValueError dans ce cas.

    Retourne le nouveau solde dans la devise du compte. Une écriture refusée LÈVE
    une exception (PermissionError si la base refuse, par ex. sans propriétaire) :
    un solde non écrit ne doit jamais être présenté comme écrit (revue 2.0.1).
    """
    verifier_ecriture_cash()
    if taux_usd is None or not taux_usd > 0:
        raise ValueError("taux EUR/USD indisponible : solde non ajusté, aucune valeur de repli")
    t_up = str(ticker).strip().upper()
    try:
        c = client()
        df = lire("Donnees")
        if df is not None and not df.empty and "Ticker" in df.columns:
            m = df[df["Ticker"].astype(str).str.strip().str.upper() == t_up]
            if not m.empty:
                row = m.iloc[0]
                try:
                    q_actuel = float(str(row.get("Quantité") or 0.0).replace(",", ".").replace(" ", ""))
                except Exception:
                    q_actuel = 0.0
                q_nouveau = round(max(0.0, q_actuel + float(delta_quantite)), 6)
                val_tot_usd = round(q_nouveau * float(taux_usd), 2)
                maj = {
                    "Quantité": q_nouveau,
                    "Valeur totale": f"$ {val_tot_usd:,.2f}".replace(",", " "),
                }
                if pd.notna(row.get("id")):
                    _restreint_au_proprietaire(
                        c.table("Donnees").update(maj).eq("id", int(row["id"])), "Donnees",
                    ).execute()
                else:
                    _restreint_au_proprietaire(
                        c.table("Donnees").update(maj).eq("Ticker", t_up), "Donnees",
                    ).execute()
                return q_nouveau
        # Si la ligne n'existe pas encore dans Donnees
        q_nouveau = round(max(0.0, float(delta_quantite)), 6)
        val_tot_usd = round(q_nouveau * float(taux_usd), 2)
        c.table("Donnees").insert(_avec_proprietaire("Donnees", [{
            "Ticker": t_up,
            "Type": type_defaut,
            "Devise Cotation": "Auto",
            "Court": f"$ {float(taux_usd):.2f}",
            "Quantité": q_nouveau,
            "Valeur totale": f"$ {val_tot_usd:,.2f}".replace(",", " "),
            "Pourcentage (%)": 0,
        }])[0]).execute()
        return q_nouveau
    except Exception as exc:
        raise _traduire_erreur("Donnees", exc) from exc


def ajouter_historique_v1(
    date_fr: str,
    sens: str,
    montant_usd: float,
    montant_eur: float,
    montant_or: float,
) -> None:
    """Ajoute une ligne dans `Historique` (v1) avec `Total_Apports_nets` à jour
    afin que les robots v1 et v2 restent parfaitement synchronisés."""
    try:
        c = client()
        df_h = lire("Historique")
        cumul = 0.0
        if df_h is not None and not df_h.empty and "Montant $" in df_h.columns:
            for _, r in df_h.iterrows():
                try:
                    m_u = float(str(r.get("Montant $") or 0.0).replace(",", ".").replace(" ", "").replace("$", ""))
                except Exception:
                    m_u = 0.0
                t_m = str(r.get("Type") or "").lower()
                cumul += m_u if ("ajout" in t_m or "apport" in t_m) else -m_u
        est_apport = sens.lower().startswith("apport") or "ajout" in sens.lower()
        nouveau_cumul = round(cumul + (montant_usd if est_apport else -montant_usd), 2)
        c.table("Historique").insert(_avec_proprietaire("Historique", [{
            "Date": date_fr,
            "Type": "Ajout de fond propre" if est_apport else "Retrait",
            "Montant $": round(montant_usd, 2),
            "Montant €": round(montant_eur, 2),
            "Montant Or": round(montant_or, 6),
            "Total_Apports_nets": nouveau_cumul,
        }])[0]).execute()
    except Exception as exc:
        # Une écriture refusée doit se voir : le journal n'est jamais « presque » écrit.
        raise _traduire_erreur("Historique", exc) from exc


def modifier_transaction(id_ligne: int, champs: dict) -> None:
    """Met à jour une ligne existante dans `pf2_transactions` par son `id`."""
    try:
        _restreint_au_proprietaire(
            client().table(T_TRANSACTIONS).update(champs).eq("id", int(id_ligne)),
            T_TRANSACTIONS).execute()
    except Exception as exc:
        raise _traduire_erreur(T_TRANSACTIONS, exc) from exc


def supprimer_transaction(id_ligne: int) -> None:
    """Supprime une ligne dans `pf2_transactions` par son `id`."""
    try:
        _restreint_au_proprietaire(
            client().table(T_TRANSACTIONS).delete().eq("id", int(id_ligne)),
            T_TRANSACTIONS).execute()
    except Exception as exc:
        raise _traduire_erreur(T_TRANSACTIONS, exc) from exc


def modifier_apport(id_ligne: int, champs: dict) -> None:
    """Met à jour un apport ou retrait existant dans `pf2_apports` par son `id`."""
    try:
        _restreint_au_proprietaire(
            client().table(T_APPORTS).update(champs).eq("id", int(id_ligne)),
            T_APPORTS).execute()
    except Exception as exc:
        raise _traduire_erreur(T_APPORTS, exc) from exc


def supprimer_apport(id_ligne: int) -> None:
    """Supprime un apport ou retrait dans `pf2_apports` par son `id`."""
    try:
        _restreint_au_proprietaire(
            client().table(T_APPORTS).delete().eq("id", int(id_ligne)),
            T_APPORTS).execute()
    except Exception as exc:
        raise _traduire_erreur(T_APPORTS, exc) from exc


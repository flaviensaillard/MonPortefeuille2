"""Modèles de données — MonPortefeuille 2.

Deux notions structurantes, absentes de la v1 :

1. La **poche** (sleeve). Un actif appartient à une poche, et une poche a un poids
   cible et une bande de tolérance. C'est la poche qu'on rééquilibre, jamais l'actif
   isolément. L'or et le bitcoin partagent la poche « réserve de valeur » parce que
   le porteur les traite comme substituables.

2. Le **périmètre**. Un actif est soit « investi » (il compte dans l'allocation et se
   rééquilibre), soit « hors portefeuille » (épargne de précaution, compte courant :
   il fait partie du patrimoine mais sa pondération n'a aucun sens). La v1 confondait
   les deux, ce qui faussait toutes les dérives.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class Classe(str, Enum):
    """Classe économique d'un actif. Détermine le régime fiscal."""

    OR = "or"                        # ETC or (IGLN.L) — régime valeurs mobilières
    OR_PHYSIQUE = "or_physique"      # Lingots, pièces — article 150 VI
    CRYPTO = "crypto"                # Bitcoin etc. — article 150 VH bis
    ACTION_ETF = "action_etf"        # Actions et ETF actions — article 150-0 A
    OBLIGATION_ETF = "obligation_etf"  # ETF obligataires — article 150-0 A
    ESPECE = "espece"                   # Cash, devises — hors champ des plus-values


# Régime fiscal applicable selon la classe.
REGIMES_FISCAUX: dict[Classe, str] = {
    Classe.OR: "150-0 A",
    Classe.OR_PHYSIQUE: "150 VI",
    Classe.CRYPTO: "150 VH bis",
    Classe.ACTION_ETF: "150-0 A",
    Classe.OBLIGATION_ETF: "150-0 A",
    Classe.ESPECE: "hors_champ",
}


class Perimetre(str, Enum):
    """Un actif investi se rééquilibre. Un actif hors portefeuille se suit seulement."""

    INVESTI = "investi"
    PRECAUTION = "precaution"   # Livret CHF — disponible en 5 minutes
    COURANT = "courant"         # Compte courant Revolut


@dataclass
class Poche:
    """Une poche d'allocation : un poids cible, une bande, des actifs membres."""

    cle: str
    nom: str
    cible: float                 # part du patrimoine investi, ex. 0.20
    bande: float                 # tolérance en points de pourcentage, ex. 0.03
    membres: list[str] = field(default_factory=list)
    perimetre: Perimetre = Perimetre.INVESTI
    description: str = ""

    @property
    def cle_perimetre(self) -> str:
        return self.perimetre.value

    @property
    def est_investi(self) -> bool:
        """Une poche hors portefeuille n'entre pas dans l'allocation."""
        return self.perimetre == Perimetre.INVESTI


# ---------------------------------------------------------------------------
# Le plan d'allocation du porteur.
#
# Les poids sont ceux qu'il a validés : il surpondère volontairement les actions
# pour la croissance, et traite l'or et le bitcoin comme une seule poche
# « réserve de valeur » substituable.
#
# Les bandes sont plus serrées sur la réserve de valeur (±3 pts) parce que c'est
# la poche qui porte la thèse anti-monnaie-fiduciaire : une dérive y est plus
# coûteuse en doctrine qu'en performance.
# ---------------------------------------------------------------------------

POCHES: list[Poche] = [
    Poche(
        cle="rv_physique",
        nom="Réserve de valeur physique",
        cible=0.15,
        bande=0.03,
        membres=["IGLN.L"],
        description="Or (ETC). Réserve de valeur physique face à la dépréciation monétaire.",
    ),
    Poche(
        cle="rv_numerique",
        nom="Réserve de valeur numérique",
        cible=0.05,
        bande=0.03,
        membres=["BTCUSDT"],
        description="Bitcoin. Réserve de valeur numérique face à la dépréciation monétaire.",
    ),
    Poche(
        cle="energie",
        nom="Énergie",
        cible=0.30,
        bande=0.05,
        membres=["XDW0.L"],
        description="ETF énergie. Surexposition volontaire à la croissance.",
    ),
    Poche(
        cle="asie",
        nom="Asie / Chine",
        cible=0.30,
        bande=0.05,
        membres=["FLXC.L"],
        description="ETF Chine (Franklin FTSE China). Surexposition volontaire à la croissance.",
    ),
    Poche(
        cle="jgb",
        nom="Obligations japonaises",
        cible=0.20,
        bande=0.05,
        membres=["XJSE.SW"],
        description="ETF dettes d'État japonaises. Poche de désinflation et de récession.",
    ),
    Poche(
        cle="precaution",
        nom="Épargne de précaution",
        cible=0.0,
        bande=0.0,
        membres=["CHF", "CNY"],
        perimetre=Perimetre.PRECAUTION,
        description="Livret CHF chez Swissquote. Disponible en 5 minutes. Jamais rééquilibré.",
    ),
    Poche(
        cle="courant",
        nom="Compte courant",
        cible=0.0,
        bande=0.0,
        membres=["EUR", "USD"],
        perimetre=Perimetre.COURANT,
        description="Revolut. Hors portefeuille d'investissement.",
    ),
]

POCHES_PAR_CLE: dict[str, Poche] = {p.cle: p for p in POCHES}
POCHES_INVESTIES: list[Poche] = [p for p in POCHES if p.perimetre == Perimetre.INVESTI]

# Actif -> poche, pour la résolution rapide.
ACTIF_VERS_POCHE: dict[str, str] = {
    ticker: p.cle for p in POCHES for ticker in p.membres
}


def poche_de(ticker: str) -> Poche | None:
    """Retourne la poche d'un ticker, ou None s'il est inconnu."""
    cle = ACTIF_VERS_POCHE.get(str(ticker).upper().strip())
    return POCHES_PAR_CLE.get(cle) if cle else None


@dataclass
class Actif:
    """Une ligne de portefeuille, valorisée."""

    ticker: str
    classe: Classe
    devise_cotation: str
    poche: str
    quantite: float = 0.0
    prix: float = 0.0                 # dans la devise de cotation
    valeur_eur: float = 0.0           # valorisation en euros (indication & fiscalité)
    valeur_usd: float = 0.0           # valorisation en dollars (unité de compte)
    dernier_taux: float | None = None # taux utilisé, pour traçabilité
    dernier_taux_usd: float | None = None
    variation_pct: float | None = None # variation en fraction depuis le dernier enregistrement (ex. +0.0081 pour +0,81 %)
    note_cours: str = ""              # origine du cours si ce n'est pas le listing natif (ex. « cours via XJSE.DE · EUR »)

    def __post_init__(self) -> None:
        if self.valeur_usd == 0.0 and self.valeur_eur != 0.0:
            self.valeur_usd = self.valeur_eur

    @property
    def regime_fiscal(self) -> str:
        return REGIMES_FISCAUX[self.classe]

    @property
    def est_investi(self) -> bool:
        p = POCHES_PAR_CLE.get(self.poche)
        return bool(p and p.perimetre == Perimetre.INVESTI)


# ---------------------------------------------------------------------------
# Allocation cible personnalisable par actif et par poche
# ---------------------------------------------------------------------------

POCHES_INVESTIES_DEFAUT: list[dict] = [
    {
        "cle": "rv_physique",
        "nom": "Réserve de valeur physique",
        "bande_pct": 3.0,
        "description": "Or (ETC). Réserve de valeur physique face à la dépréciation monétaire.",
    },
    {
        "cle": "rv_numerique",
        "nom": "Réserve de valeur numérique",
        "bande_pct": 3.0,
        "description": "Bitcoin. Réserve de valeur numérique face à la dépréciation monétaire.",
    },
    {
        "cle": "energie",
        "nom": "Énergie",
        "bande_pct": 5.0,
        "description": "ETF énergie. Surexposition volontaire à la croissance.",
    },
    {
        "cle": "asie",
        "nom": "Asie / Chine",
        "bande_pct": 5.0,
        "description": "ETF Chine (Franklin FTSE China). Surexposition volontaire à la croissance.",
    },
    {
        "cle": "jgb",
        "nom": "Obligations japonaises",
        "bande_pct": 5.0,
        "description": "ETF dettes d'État japonaises. Poche de désinflation et de récession.",
    },
]

ALLOCATION_ACTIFS_DEFAUT: list[dict] = [
    {"ticker": "IGLN.L", "nom": "Or (iShares Physical Gold ETC)", "poche": "rv_physique", "cible_pct": 15.0, "bande_pct": 3.0, "classe": "or", "devise": "USD"},
    {"ticker": "BTCUSDT", "nom": "Bitcoin", "poche": "rv_numerique", "cible_pct": 5.0, "bande_pct": 3.0, "classe": "crypto", "devise": "USD"},
    {"ticker": "XDW0.L", "nom": "Xtrackers MSCI World Energy", "poche": "energie", "cible_pct": 30.0, "bande_pct": 5.0, "classe": "action_etf", "devise": "USD"},
    {"ticker": "FLXC.L", "nom": "Franklin FTSE China UCITS ETF", "poche": "asie", "cible_pct": 30.0, "bande_pct": 5.0, "classe": "action_etf", "devise": "USD"},
    {"ticker": "XJSE.SW", "nom": "Xtrackers II Japan Govt Bond", "poche": "jgb", "cible_pct": 20.0, "bande_pct": 5.0, "classe": "obligation_etf", "devise": "JPY"},
]

CIBLES_ACTIFS: dict[str, float] = {
    a["ticker"]: float(a["cible_pct"]) / 100.0 for a in ALLOCATION_ACTIFS_DEFAUT
}
BANDES_ACTIFS: dict[str, float] = {
    a["ticker"]: float(a["bande_pct"]) / 100.0 for a in ALLOCATION_ACTIFS_DEFAUT
}
NOMS_ACTIFS: dict[str, str] = {
    a["ticker"]: str(a["nom"]) for a in ALLOCATION_ACTIFS_DEFAUT
}


def cible_actif(ticker: str) -> float:
    """Retourne l'allocation cible (en fraction, ex. 0.30 pour 30 %) d'un actif."""
    return CIBLES_ACTIFS.get(str(ticker).upper().strip(), 0.0)


def bande_actif(ticker: str) -> float:
    """Retourne la fenêtre de dérive (en fraction, ex. 0.05 pour ±5 pts, 0.02 pour ±2 pts) d'un actif."""
    tk = str(ticker).upper().strip()
    if tk in BANDES_ACTIFS:
        return BANDES_ACTIFS[tk]
    p = poche_de(tk)
    return p.bande if p else 0.05


def allocation_par_defaut() -> dict:
    """Retourne une copie neuve du plan d'allocation par défaut (poches + actifs)."""
    return {
        "poches": [dict(p) for p in POCHES_INVESTIES_DEFAUT],
        "actifs": [dict(a) for a in ALLOCATION_ACTIFS_DEFAUT],
    }


def slug_poche(nom: str) -> str:
    """Transforme un nom de poche libre en identifiant snake_case."""
    import re
    import unicodedata
    s = unicodedata.normalize("NFKD", str(nom or "").strip().lower())
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = re.sub(r"[^a-z0-9]+", "_", s).strip("_")
    if not s or s in ("precaution", "courant", "inconnu"):
        s = f"poche_{s or 'nouvelle'}"
    return s


def _lire_cible_pct_actif(a: dict) -> float:
    """Extrait la cible d'un actif en pourcentage (0 à 100 %), qu'elle soit stockée sous `cible` (0.10) ou `cible_pct` (10.0)."""
    if "cible" in a and a["cible"] is not None:
        val = float(a["cible"])
        return max(0.0, val * 100.0 if val <= 1.0 + 1e-6 else val)
    if "cible_pct" in a and a["cible_pct"] is not None:
        return max(0.0, float(a["cible_pct"]))
    return 0.0


def _lire_bande_pct_poche(p: dict) -> float:
    """Extrait la bande d'une poche en points de % (ex. 5.0), qu'elle soit stockée sous `bande` (0.05) ou `bande_pct` (5.0)."""
    if "bande" in p and p["bande"] is not None:
        val = float(p["bande"])
        return max(0.5, val * 100.0 if val <= 1.0 + 1e-6 else val)
    if "bande_pct" in p and p["bande_pct"] is not None:
        return max(0.5, float(p["bande_pct"]))
    return 5.0


def _lire_bande_pct_actif(a: dict, defaut_pct: float = 5.0) -> float:
    """Extrait la fenêtre de dérive d'un actif en points de % (ex. 2.0, 3.0, 5.0), qu'elle soit stockée sous `bande` (0.02) ou `bande_pct` (2.0)."""
    if "bande" in a and a["bande"] is not None:
        val = float(a["bande"])
        return max(0.5, val * 100.0 if val <= 1.0 + 1e-6 else val)
    if "bande_pct" in a and a["bande_pct"] is not None:
        return max(0.5, float(a["bande_pct"]))
    return max(0.5, float(defaut_pct))


def verifier_allocation_cible(cfg_alloc: dict | None = None) -> dict:
    """Vérifie la somme des allocations cibles des actifs (ou des poches investies).

    Retourne un dictionnaire contenant :
    - `total_pct` : total des allocations cibles en % (ex. 100.0, 115.0)
    - `depasse_100` : True si la répartition totale dépasse 100 % (> 100 %)
    - `inferieur_100` : True si la répartition totale est inférieure à 100 % (< 100 %)
    - `est_valide` / `equilibre_100` : True si la répartition totale vaut exactement 100 %
    - `ecart_pct` / `ecart_100_pct` : `total_pct - 100.0`
    - `message` : message d'alerte (ou chaîne vide si équilibré à 100 %).
    """
    if cfg_alloc and isinstance(cfg_alloc, dict) and "actifs" in cfg_alloc:
        total_pct = round(
            sum(_lire_cible_pct_actif(a) for a in cfg_alloc.get("actifs", [])),
            2,
        )
    else:
        total_pct = round(
            sum(p.cible * 100.0 for p in POCHES if p.perimetre == Perimetre.INVESTI),
            2,
        )

    depasse_100 = total_pct > 100.0 + 1e-4
    inferieur_100 = total_pct < 100.0 - 1e-4
    est_valide = not depasse_100 and not inferieur_100
    ecart_pct = round(total_pct - 100.0, 2)

    if depasse_100:
        message = (
            f"🚨 Alerte : la répartition cible totale de vos actifs représente **{total_pct:.1f} %** "
            f"(soit **+{ecart_pct:.1f} %** au-dessus de 100 %) ! "
            "Veuillez réduire l'allocation cible d'un ou plusieurs actifs pour revenir à 100 %."
        )
    elif inferieur_100:
        message = (
            f"⚠️ Attention : la répartition cible totale de vos actifs représente **{total_pct:.1f} %** "
            f"(il manque **{100.0 - total_pct:.1f} %** pour atteindre 100 %)."
        )
    else:
        message = ""

    return {
        "total_pct": total_pct,
        "depasse_100": depasse_100,
        "inferieur_100": inferieur_100,
        "est_valide": est_valide,
        "equilibre_100": est_valide,
        "ecart_pct": ecart_pct,
        "ecart_100_pct": ecart_pct,
        "message": message,
    }


def reinitialiser_allocation_par_defaut() -> dict:
    """Restaure en mémoire les poches et actifs par défaut."""
    return appliquer_allocation_personnalisee(allocation_par_defaut())


def _migrer_poche_rv(poches_cfg: list[dict], actifs_cfg: list[dict]) -> tuple[list[dict], list[dict]]:
    """Migre automatiquement toute ancienne poche `rv` (« Réserve de valeur ») en deux poches distinctes :
    - `rv_physique` (« Réserve de valeur physique ») pour l'or (`IGLN.L`),
    - `rv_numerique` (« Réserve de valeur numérique ») pour Bitcoin (`BTCUSDT`)."""
    a_migrer = any(str(p.get("cle", "")).strip() == "rv" for p in poches_cfg) or any(
        str(a.get("poche", "")).strip() == "rv" for a in actifs_cfg
    )
    if not a_migrer:
        return poches_cfg, actifs_cfg

    nouvelles_poches_cfg: list[dict] = []
    cles_deja: set[str] = set()
    for p in poches_cfg:
        cle_p = str(p.get("cle", "")).strip()
        if cle_p == "rv":
            for def_rv in POCHES_INVESTIES_DEFAUT[:2]:
                if def_rv["cle"] not in cles_deja:
                    nouvelles_poches_cfg.append(dict(def_rv))
                    cles_deja.add(def_rv["cle"])
        elif cle_p and cle_p not in cles_deja:
            nouvelles_poches_cfg.append(dict(p))
            cles_deja.add(cle_p)

    for def_rv in POCHES_INVESTIES_DEFAUT[:2]:
        if def_rv["cle"] not in cles_deja:
            nouvelles_poches_cfg.insert(0, dict(def_rv))
            cles_deja.add(def_rv["cle"])

    # Si IGLN.L et BTCUSDT étaient tous deux à l'ancien défaut 10 % / 10 % dans "rv",
    # on passe à 15 % (Or physique) et 5 % (Bitcoin numérique).
    cibles_rv = {
        str(a.get("ticker", "")).upper().strip(): _lire_cible_pct_actif(a)
        for a in actifs_cfg
        if str(a.get("poche", "")).strip() == "rv"
    }
    ancien_defaut_10_10 = (
        abs(cibles_rv.get("IGLN.L", 0.0) - 10.0) < 1e-4
        and abs(cibles_rv.get("BTCUSDT", 0.0) - 10.0) < 1e-4
    )

    nouveaux_actifs_cfg: list[dict] = []
    for a in actifs_cfg:
        a_copie = dict(a)
        tk = str(a_copie.get("ticker", "")).upper().strip()
        cls_a = str(a_copie.get("classe", "")).lower().strip()
        if str(a_copie.get("poche", "")).strip() == "rv":
            if tk == "BTCUSDT" or "crypto" in cls_a or "btc" in tk.lower():
                a_copie["poche"] = "rv_numerique"
                if ancien_defaut_10_10 and tk == "BTCUSDT":
                    a_copie["cible_pct"] = 5.0
                    a_copie.pop("cible", None)
            else:
                a_copie["poche"] = "rv_physique"
                if ancien_defaut_10_10 and tk == "IGLN.L":
                    a_copie["cible_pct"] = 15.0
                    a_copie.pop("cible", None)
        nouveaux_actifs_cfg.append(a_copie)

    return nouvelles_poches_cfg, nouveaux_actifs_cfg


def appliquer_allocation_personnalisee(cfg_alloc: dict | None = None) -> dict:
    """Applique en mémoire (dans `POCHES`, `POCHES_PAR_CLE`, `POCHES_INVESTIES`,
    `ACTIF_VERS_POCHE`, `CIBLES_ACTIFS`, `CLASSES`, `DEVISES_COTATION`) une
    configuration personnalisée d'actifs et de poches."""
    if not cfg_alloc or not isinstance(cfg_alloc, dict) or not cfg_alloc.get("actifs"):
        cfg_alloc = allocation_par_defaut()

    poches_cfg = [dict(p) for p in (cfg_alloc.get("poches") or POCHES_INVESTIES_DEFAUT)]
    actifs_cfg = [dict(a) for a in (cfg_alloc.get("actifs") or ALLOCATION_ACTIFS_DEFAUT)]
    poches_cfg, actifs_cfg = _migrer_poche_rv(poches_cfg, actifs_cfg)

    # S'assurer que toute poche référencée par un actif existe dans poches_cfg
    cles_connues = {str(p.get("cle", "")).strip() for p in poches_cfg if p.get("cle")}
    for a in actifs_cfg:
        p_cle = str(a.get("poche") or "rv_physique").strip()
        if p_cle and p_cle not in cles_connues and p_cle not in ("precaution", "courant"):
            poches_cfg.append({
                "cle": p_cle,
                "nom": str(a.get("poche_nom") or p_cle.replace("_", " ").title()),
                "bande_pct": float(a.get("bande_pct", 5.0)),
                "description": str(a.get("poche_description") or ""),
            })
            cles_connues.add(p_cle)

    CIBLES_ACTIFS.clear()
    BANDES_ACTIFS.clear()
    NOMS_ACTIFS.clear()
    membres_par_poche: dict[str, list[str]] = {str(p["cle"]): [] for p in poches_cfg}
    cible_par_poche: dict[str, float] = {str(p["cle"]): 0.0 for p in poches_cfg}
    bandes_actifs_par_poche: dict[str, list[tuple[float, float]]] = {str(p["cle"]): [] for p in poches_cfg}
    bandes_def_poche: dict[str, float] = {
        str(p["cle"]): _lire_bande_pct_poche(p) for p in poches_cfg
    }

    for a in actifs_cfg:
        tk = str(a.get("ticker") or "").upper().strip()
        if not tk:
            continue
        p_cle = str(a.get("poche") or "rv_physique").strip()
        c_pct = _lire_cible_pct_actif(a)
        b_def = bandes_def_poche.get(p_cle, 3.0 if p_cle.startswith("rv") else 5.0)
        b_a_pct = _lire_bande_pct_actif(a, defaut_pct=b_def)
        CIBLES_ACTIFS[tk] = c_pct / 100.0
        BANDES_ACTIFS[tk] = b_a_pct / 100.0
        NOMS_ACTIFS[tk] = str(a.get("nom") or tk)
        membres_par_poche.setdefault(p_cle, [])
        if tk not in membres_par_poche[p_cle]:
            membres_par_poche[p_cle].append(tk)
        cible_par_poche[p_cle] = cible_par_poche.get(p_cle, 0.0) + (c_pct / 100.0)
        if "bande" in a or "bande_pct" in a:
            bandes_actifs_par_poche.setdefault(p_cle, []).append((c_pct, b_a_pct))

    nouvelles_poches: list[Poche] = []
    for p_info in poches_cfg:
        cle = str(p_info["cle"]).strip()
        membres = membres_par_poche.get(cle, [])
        if not membres:
            continue
        cible_p = round(cible_par_poche.get(cle, 0.0), 6)
        b_liste = bandes_actifs_par_poche.get(cle, [])
        if b_liste:
            tot_w = sum(w for w, _ in b_liste)
            if tot_w > 0:
                bande_pct_eff = sum(w * b for w, b in b_liste) / tot_w
            else:
                bande_pct_eff = sum(b for _, b in b_liste) / len(b_liste)
            bande_p = max(0.005, round(bande_pct_eff / 100.0, 6))
        else:
            bande_p = max(0.005, _lire_bande_pct_poche(p_info) / 100.0)
        nouvelles_poches.append(Poche(
            cle=cle,
            nom=str(p_info.get("nom") or cle),
            cible=cible_p,
            bande=bande_p,
            membres=membres,
            perimetre=Perimetre.INVESTI,
            description=str(p_info.get("description") or ""),
        ))

    # Conserver les 2 poches hors portefeuille (precaution & courant)
    nouvelles_poches.append(Poche(
        cle="precaution",
        nom="Épargne de précaution",
        cible=0.0,
        bande=0.0,
        membres=["CHF", "CNY"],
        perimetre=Perimetre.PRECAUTION,
        description="Livret CHF chez Swissquote. Disponible en 5 minutes. Jamais rééquilibré.",
    ))
    nouvelles_poches.append(Poche(
        cle="courant",
        nom="Compte courant",
        cible=0.0,
        bande=0.0,
        membres=["EUR", "USD"],
        perimetre=Perimetre.COURANT,
        description="Revolut. Hors portefeuille d'investissement.",
    ))

    POCHES[:] = nouvelles_poches
    POCHES_PAR_CLE.clear()
    POCHES_PAR_CLE.update({p.cle: p for p in POCHES})
    POCHES_INVESTIES[:] = [p for p in POCHES if p.perimetre == Perimetre.INVESTI]
    ACTIF_VERS_POCHE.clear()
    ACTIF_VERS_POCHE.update({
        ticker: p.cle for p in POCHES for ticker in p.membres
    })

    # Enregistrer aussi la classe fiscale et la devise de cotation des actifs personnalisés
    try:
        from . import portfolio as _pf
        _ALIAS_CLASSE = {
            "action": Classe.ACTION_ETF,
            "action_etf": Classe.ACTION_ETF,
            "obligation": Classe.OBLIGATION_ETF,
            "obligation_etf": Classe.OBLIGATION_ETF,
            "or_papier": Classe.OR,
            "or_physique": Classe.OR,
            "or": Classe.OR,
            "crypto": Classe.CRYPTO,
        }
        for a in actifs_cfg:
            tk = str(a.get("ticker") or "").upper().strip()
            if not tk:
                continue
            cls_str = str(a.get("classe") or "action_etf").lower().strip()
            if cls_str in _ALIAS_CLASSE:
                _pf.CLASSES[tk] = _ALIAS_CLASSE[cls_str]
            else:
                for c_enum in Classe:
                    if c_enum.value == cls_str:
                        _pf.CLASSES[tk] = c_enum
                        break
            dev_str = str(a.get("devise") or "").upper().strip()
            if dev_str:
                _pf.DEVISES_COTATION[tk] = dev_str
    except Exception:
        pass

    return {"poches": poches_cfg, "actifs": actifs_cfg}



class TypeCompte(str, Enum):
    """Type d'un compte de liquidités (cahier 2.0). Il décide de la poche du compte."""

    RESERVE = "reserve"          # épargne de précaution : jamais investie, hors rééquilibrage
    DISPONIBLE = "disponible"    # compte courant : seul compte des achats et des ventes


POCHE_DE_TYPE_COMPTE = {
    TypeCompte.RESERVE: Perimetre.PRECAUTION,
    TypeCompte.DISPONIBLE: Perimetre.COURANT,
}


@dataclass(frozen=True)
class CompteCash:
    """Un compte de liquidités. Son solde n'est pas stocké : il se calcule à partir de
    ses opérations (`core.portfolio.soldes_par_compte`). Un compte archivé reste compté
    dans le patrimoine, mais sort des listes et des propositions d'achat."""

    id: str
    nom: str
    devise: str
    type: TypeCompte
    banque: str | None = None
    motif: str | None = None
    archive: bool = False
    note: str | None = None

    @property
    def perimetre(self) -> Perimetre:
        return POCHE_DE_TYPE_COMPTE[self.type]

"""Données du foyer fiscal, indexées par millésime (revue 2.0.1 — T-07, priorité 10).

Principe : rien n'est réutilisé d'une année à l'autre sans un geste explicite.

- `CLES_IDENTITE` : ce qui ne dépend pas de l'année (situation, enfants, parts,
  pays des intérêts). Clé simple dans la table `Config`.
- `CLES_ANNUELLES` : salaires, intérêts, kilomètres, puissance fiscale, repas,
  option des frais réels. Clé suffixée par le millésime : `f_s1_2025`.
- `CLE_CONFIRMATION` : « données de l'année N confirmées » (`f_confirme_2025`).

Une année sans donnée est une LACUNE : `valeurs_annee` rend None. Aucune valeur
d'une autre année, ni valeur personnelle de repli, n'est jamais substituée. La
reprise des anciennes clés (sans année) est une fonction distincte, appelée
seulement sur geste explicite de l'utilisateur.

Module pur (aucune entrée-sortie) : testable sans Supabase.
"""

from __future__ import annotations

CLES_IDENTITE = ("f_statut", "f_enf", "f_parts", "f_pays_etr")
CLES_ANNUELLES = (
    "f_s1", "f_s2", "f_int_net",
    "f_u1", "f_k1", "f_cv1", "f_r1", "f_elec1",
    "f_u2", "f_k2", "f_cv2", "f_r2", "f_elec2",
)
CLE_CONFIRMATION = "f_confirme"


def cle_annuelle(cle: str, annee: int) -> str:
    """`f_s1` + 2025 → `f_s1_2025`. Refuse ce qui n'est pas une donnée annuelle."""
    if cle not in CLES_ANNUELLES:
        raise ValueError(f"« {cle} » n'est pas une donnée annuelle du foyer")
    return f"{cle}_{int(annee)}"


def valeur_annuelle(cfg: dict, cle: str, annee: int) -> str | None:
    """Valeur brute de la donnée pour CETTE année, ou None (lacune)."""
    brut = cfg.get(cle_annuelle(cle, annee))
    if brut is None or str(brut).strip() == "":
        return None
    return str(brut)


def lacunes(cfg: dict, annee: int) -> list[str]:
    """Données annuelles absentes pour `annee` (aucune n'est remplacée)."""
    return [c for c in CLES_ANNUELLES if valeur_annuelle(cfg, c, annee) is None]


def valeurs_annee(cfg: dict, annee: int) -> dict | None:
    """Toutes les données annuelles de `annee`, ou None s'il manque la moindre."""
    if lacunes(cfg, annee):
        return None
    return {c: valeur_annuelle(cfg, c, annee) for c in CLES_ANNUELLES}


def est_confirmee(cfg: dict, annee: int) -> bool:
    return as_bool(cfg.get(f"{CLE_CONFIRMATION}_{int(annee)}"))


def reprise_sans_millesime(cfg: dict, annee: int) -> dict:
    """Copie les anciennes clés SANS année vers `annee`. Geste explicite uniquement.

    Une année déjà saisie n'est jamais écrasée par la reprise.
    """
    modifs: dict[str, str] = {}
    for c in CLES_ANNUELLES:
        ancienne = cfg.get(c)
        if ancienne is None or str(ancienne).strip() == "":
            continue
        if valeur_annuelle(cfg, c, annee) is None:
            modifs[cle_annuelle(c, annee)] = str(ancienne)
    return modifs


def _texte(valeur) -> str:
    if valeur is True:
        return "true"
    if valeur is False:
        return "false"
    return str(valeur)


def modifs_sauvegarde(params: dict, annee: int, confirmee: bool) -> dict:
    """Clés à écrire dans `Config` : identité sans année, annuel suffixé, confirmation."""
    modifs: dict[str, str] = {}
    for c in CLES_IDENTITE:
        if c in params:
            modifs[c] = _texte(params[c])
    for c in CLES_ANNUELLES:
        if c in params:
            modifs[cle_annuelle(c, annee)] = _texte(params[c])
    modifs[f"{CLE_CONFIRMATION}_{int(annee)}"] = "true" if confirmee else "false"
    return modifs


def as_float(valeur) -> float | None:
    """Nombre tolérant (« 1 234,5 »), ou None si illisible — jamais un défaut."""
    if valeur is None:
        return None
    texte = str(valeur).strip().replace(" ", "").replace("\u00a0", "").replace(",", ".")
    try:
        return float(texte)
    except ValueError:
        return None


def as_bool(valeur) -> bool:
    return str(valeur if valeur is not None else "").strip().lower() in ("true", "1", "oui", "yes")


def diff_inventaire(avant: list[dict], apres: list[dict]) -> tuple[list[dict], list[int]]:
    """Ce qu'il faut écrire pour passer de `avant` à `apres` (lignes avec `id`).

    Retourne `(lignes_a_ecrire, ids_a_supprimer)` : une ligne sans `id` est une
    création, une ligne avec `id` est écrite (mise à jour) ; un `id` présent dans
    `avant` et absent de `apres` est supprimé.
    """
    ids_avant = {int(l["id"]) for l in avant if l.get("id") is not None}
    ids_apres = {int(l["id"]) for l in apres if l.get("id") is not None}
    return list(apres), sorted(ids_avant - ids_apres)

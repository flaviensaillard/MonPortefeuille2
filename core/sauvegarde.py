"""Sauvegarde chiffrée des données (2.2.0, C) — format, chiffrement, vérification.

Ce module ne fait AUCUNE entrée/sortie réseau : il transforme des lignes en
archive chiffrée et réciproquement. Les jobs (jobs/sauvegarde.py,
jobs/restauration.py) lisent Supabase et écrivent les fichiers.

Format (fichier `.pf2`)
-----------------------
    MAGIC (8 octets, « PF2SAV1\\n ») | sel (16) | nonce (12) | AES-GCM(JSON)

- Clé : scrypt(phrase, sel, n=2**15, r=8, p=1) → 32 octets.
- Le MAGIC sert d'AAD : un en-tête modifié fait échouer le déchiffrement.
- Le JSON contient, par table : les lignes, leur nombre et un SHA-256 calculé
  sur la forme canonique (clés triées). Un SHA-256 global couvre l'ensemble,
  et une synthèse (nombre de lignes, sommes des montants) sert de contrôle
  de restauration.

Règles
------
- La phrase n'est jamais écrite dans le fichier, ni dans le journal.
- Une table OBLIGATOIRE absente ou illisible annule la sauvegarde : pas
  d'archive partielle présentée comme complète.
- Une table OPTIONNELLE absente est listée dans `absentes` (pas de silence).
- Une phrase de moins de 12 caractères est refusée.

Limite assumée
--------------
La phrase est la seule protection : une phrase faible se casse hors ligne.
L'utilisateur choisit la phrase ; le robot la reçoit d'un secret GitHub.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
from decimal import Decimal
from typing import Callable, Mapping

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

FORMAT = "pf2-sauvegarde"
VERSION = 1
MAGIC = b"PF2SAV1\n"
LONGUEUR_SEL = 16
LONGUEUR_NONCE = 12
PHRASE_MIN = 12

# Tables sauvegardées (noms de la base). `Config` porte les versions fiscales.
TABLES_OBLIGATOIRES = ("pf2_transactions", "pf2_apports", "pf2_snapshots", "Config")
TABLES_OPTIONNELLES = ("pf2_operations_compte", "pf2_comptes")

# Colonnes dont on additionne les valeurs numériques pour la synthèse.
COLONNES_SOMME = ("montant", "montant_eur", "valeur", "valeur_eur", "solde", "quantite")


class ErreurSauvegarde(Exception):
    """Sauvegarde impossible ou fichier invalide."""


class ErreurRestauration(ErreurSauvegarde):
    """Archive lue mais incohérente (somme de contrôle, nombre de lignes, synthèse)."""


def _defaut_json(objet):
    if isinstance(objet, (dt.date, dt.datetime)):
        return objet.isoformat()
    if isinstance(objet, Decimal):
        return str(objet)
    return str(objet)


def _canonique(objet) -> bytes:
    return json.dumps(objet, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=False, default=_defaut_json).encode("utf-8")


def sha256_octets(donnees: bytes) -> str:
    return hashlib.sha256(donnees).hexdigest()


def synthese(tables: Mapping[str, list[dict]]) -> dict[str, dict]:
    """Nombre de lignes et sommes des colonnes monétaires, par table."""
    resultat: dict[str, dict] = {}
    for nom in sorted(tables):
        lignes = tables[nom]
        sommes: dict[str, float] = {}
        for ligne in lignes:
            for col in COLONNES_SOMME:
                val = ligne.get(col)
                if isinstance(val, bool) or not isinstance(val, (int, float)):
                    continue
                sommes[col] = sommes.get(col, 0.0) + float(val)
        resultat[nom] = {
            "lignes": len(lignes),
            "sommes": {c: round(v, 6) for c, v in sorted(sommes.items())},
        }
    return resultat


def construire(tables: Mapping[str, list[dict]], *, genere_le: str,
               absentes: list[str] | None = None) -> dict:
    """Assemble le document de sauvegarde (non chiffré)."""
    manquantes = [t for t in TABLES_OBLIGATOIRES if t not in tables]
    if manquantes:
        raise ErreurSauvegarde(
            "sauvegarde annulée : table(s) obligatoire(s) absente(s) : " + ", ".join(manquantes))
    blocs: dict[str, dict] = {}
    for nom in sorted(tables):
        lignes = list(tables[nom])
        blocs[nom] = {
            "nb": len(lignes),
            "sha256": sha256_octets(_canonique(lignes)),
            "lignes": lignes,
        }
    sha_global = sha256_octets(_canonique({n: b["sha256"] for n, b in blocs.items()}))
    return {
        "format": FORMAT,
        "version": VERSION,
        "genere_le": genere_le,
        "absentes": sorted(absentes or []),
        "tables": blocs,
        "synthese": synthese(tables),
        "sha256_global": sha_global,
    }


def verifier(document: Mapping) -> list[str]:
    """Liste des anomalies du document (vide = intègre)."""
    anomalies: list[str] = []
    if document.get("format") != FORMAT:
        anomalies.append(f"format inconnu : {document.get('format')!r}")
        return anomalies
    if document.get("version") != VERSION:
        anomalies.append(f"version non prise en charge : {document.get('version')!r}")
    tables = document.get("tables") or {}
    lignes_par_table: dict[str, list[dict]] = {}
    for nom in TABLES_OBLIGATOIRES:
        if nom not in tables:
            anomalies.append(f"table obligatoire absente : {nom}")
    for nom, bloc in tables.items():
        lignes = bloc.get("lignes")
        if not isinstance(lignes, list):
            anomalies.append(f"{nom} : lignes illisibles")
            continue
        lignes_par_table[nom] = lignes
        if bloc.get("nb") != len(lignes):
            anomalies.append(f"{nom} : {len(lignes)} lignes, {bloc.get('nb')} annoncées")
        if sha256_octets(_canonique(lignes)) != bloc.get("sha256"):
            anomalies.append(f"{nom} : somme de contrôle différente (contenu altéré)")
    sha_par_table = {n: (b.get("sha256") if isinstance(b, Mapping) else None)
                     for n, b in sorted(tables.items())}
    if sha256_octets(_canonique(sha_par_table)) != document.get("sha256_global"):
        anomalies.append("somme de contrôle globale différente")
    if lignes_par_table and synthese(lignes_par_table) != document.get("synthese"):
        anomalies.append("synthèse (lignes, sommes) ne correspond pas au contenu")
    return anomalies


def restaurer(document: Mapping) -> dict[str, list[dict]]:
    """Rend les tables si et seulement si le document est intègre."""
    anomalies = verifier(document)
    if anomalies:
        raise ErreurRestauration("restauration refusée : " + " ; ".join(anomalies))
    return {nom: list(bloc["lignes"]) for nom, bloc in document["tables"].items()}


def _verifier_phrase(phrase: str) -> bytes:
    if not isinstance(phrase, str) or len(phrase) < PHRASE_MIN:
        raise ErreurSauvegarde(f"phrase de chiffrement absente ou trop courte (minimum {PHRASE_MIN} caractères)")
    return phrase.encode("utf-8")


def _cle(phrase: bytes, sel: bytes) -> bytes:
    return hashlib.scrypt(phrase, salt=sel, n=2 ** 15, r=8, p=1, dklen=32,
                          maxmem=64 * 1024 * 1024)


def chiffrer(document: Mapping, phrase: str) -> bytes:
    donnees = json.dumps(document, ensure_ascii=False, default=_defaut_json).encode("utf-8")
    sel = os.urandom(LONGUEUR_SEL)
    nonce = os.urandom(LONGUEUR_NONCE)
    chiffre = AESGCM(_cle(_verifier_phrase(phrase), sel)).encrypt(nonce, donnees, MAGIC)
    return MAGIC + sel + nonce + chiffre


def dechiffrer(blob: bytes, phrase: str) -> dict:
    if not blob.startswith(MAGIC):
        raise ErreurSauvegarde("fichier non reconnu (en-tête absent)")
    debut = len(MAGIC)
    sel = blob[debut:debut + LONGUEUR_SEL]
    nonce = blob[debut + LONGUEUR_SEL:debut + LONGUEUR_SEL + LONGUEUR_NONCE]
    chiffre = blob[debut + LONGUEUR_SEL + LONGUEUR_NONCE:]
    if len(sel) != LONGUEUR_SEL or len(nonce) != LONGUEUR_NONCE or not chiffre:
        raise ErreurSauvegarde("fichier tronqué")
    try:
        clair = AESGCM(_cle(_verifier_phrase(phrase), sel)).decrypt(nonce, chiffre, MAGIC)
    except InvalidTag as exc:
        raise ErreurSauvegarde("phrase incorrecte ou fichier altéré") from exc
    return json.loads(clair.decode("utf-8"))


def produire(lecteur: Callable[[str], list[dict]], phrase: str, *, genere_le: str) -> tuple[bytes, dict]:
    """Lit les tables avec `lecteur`, rend (fichier chiffré, document).

    Toute erreur de lecture d'une table OBLIGATOIRE annule l'ensemble. Une
    table OPTIONNELLE illisible l'est aussi : on ne la déclare pas « absente »
    par défaut, on arrête.
    """
    _verifier_phrase(phrase)
    tables: dict[str, list[dict]] = {}
    absentes: list[str] = []
    for nom in TABLES_OBLIGATOIRES:
        try:
            tables[nom] = lecteur(nom)
        except Exception as exc:
            raise ErreurSauvegarde(f"sauvegarde annulée : lecture de {nom} impossible ({exc})") from exc
    for nom in TABLES_OPTIONNELLES:
        try:
            tables[nom] = lecteur(nom)
        except LookupError:
            absentes.append(nom)
        except Exception as exc:
            raise ErreurSauvegarde(f"sauvegarde annulée : lecture de {nom} impossible ({exc})") from exc
    document = construire(tables, genere_le=genere_le, absentes=absentes)
    return chiffrer(document, phrase), document

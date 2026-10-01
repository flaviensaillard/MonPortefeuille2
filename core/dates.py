"""Dates — un seul endroit pour les bizarreries de pandas et de Yahoo.

Pourquoi ce module existe
-------------------------
`core/fx.py` et `core/prices.py` filtraient tous les deux une série de Yahoo
avec :

    serie[serie.index <= pd.Timestamp(une_date)]

Sauf que Yahoo renvoie un index **conscient du fuseau horaire** —
`datetime64[ns, Europe/London]` pour une paire de change, le fuseau de la place
de cotation pour un titre. Comparer un tel index à un `Timestamp` naive lève :

    TypeError: Invalid comparison between dtype=datetime64[ns, Europe/London]
               and Timestamp

Conséquence en production : **toute recherche de cours ou de taux à une date
passée échouait**. Un portefeuille acheté avant hier ne pouvait pas être
valorisé — l'application affichait « Taux de change USD/EUR indisponible au
2025-01-07 » alors que Yahoo avait parfaitement la donnée.

Le piège est resté invisible longtemps parce que la branche « aujourd'hui »
(`period="5d"`) ne fait aucune comparaison : seules les dates anciennes
tombaient dans le panneau. Et aucun test ne couvrait cette branche.
"""

from __future__ import annotations

import numpy as np
import pandas as pd


def index_sans_fuseau(index):
    """Rend un index de dates comparable à un `Timestamp` naive.

    On retire le fuseau en conservant l'heure locale du marché : c'est l'heure
    de la séance, et c'est bien elle qu'on veut comparer à une date de journée.
    Un index déjà naive repart inchangé.
    """
    idx = pd.DatetimeIndex(index)
    if idx.tz is not None:
        idx = idx.tz_localize(None)
    return idx


def normaliser(instant) -> pd.Timestamp:
    """Rend un `Timestamp` comparable à un index Yahoo, quel que soit son fuseau."""
    ts = pd.Timestamp(instant)
    if ts.tz is not None:
        ts = ts.tz_localize(None)
    return ts


def parser(valeur, erreurs: str = "coerce"):
    """Parse une date venant soit de la base, soit d'un CSV de la v1.

    Pourquoi `format="mixed"` est indispensable
    -------------------------------------------
    L'application stocke ses dates au format ISO (`2025-01-07`). La v1, elle,
    écrit `jj/mm/aaaa`. Or un `pd.to_datetime(..., dayfirst=True)` sans plus de
    précisions **interprète mal l'ISO** : `dayfirst` fait lire « 01 » comme le
    JOUR et « 07 » comme le MOIS. Le 7 janvier devient donc le 1er juillet.

    Le défaut est silencieux et il frappe large : toute date dont le jour est
    inférieur ou égal à 12 — environ 39 % des dates — est décalée. Les
    conséquences sont concrètes : un taux de change ou un cours historique
    recherché à la mauvaise date, donc une valorisation fausse. Et comme la
    branche « aujourd'hui » ne parse rien, le problème ne se voyait que sur
    l'historique.

    `format="mixed"` laisse pandas reconnaître le format de chaque valeur ;
    les deux écritures sont alors traitées correctement.
    """
    return pd.to_datetime(valeur, dayfirst=True, errors=erreurs, format="mixed")


def dernier_avant(serie: pd.Series, limite) -> pd.Series:
    """Sous-ensemble d'une série datée dont l'index est au plus tard à `limite`.

    Tolérant au fuseau horaire des deux côtés. C'est le remplaissant direct de
    `serie[serie.index <= limite]`, qui plantait sur les données Yahoo.

    Le filtrage est positionnel (masque booléen), donc sûr même si l'index
    contient des doublons ou n'est pas trié.
    """
    if serie is None or len(serie) == 0:
        return serie
    idx = index_sans_fuseau(serie.index)
    seuil = normaliser(limite)
    masque = np.asarray(idx <= seuil)
    return serie[masque]

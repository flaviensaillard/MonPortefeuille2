"""Devises ISO 4217 prises en charge (revue 2.0.1, constat D-04).

La liste ci-dessous est l'ensemble des codes ISO 4217 actifs. Elle sert de
garde-fou à la saisie et aux conversions : une devise absente, `NAN`, ou hors
de cette liste n'est JAMAIS valorisée au taux 1 — elle est signalée comme
indisponible. Le miroir JavaScript de cette liste vit dans
`app/src/main/assets/www/js/models.js` (`DEVISES_ISO`) ; un test de parité
(tests/test_devise_absente.py) interdit toute divergence entre les deux
moteurs.
"""

from __future__ import annotations

ISO_4217: frozenset[str] = frozenset("""
AED AFN ALL AMD ANG AOA ARS AUD AWG AZN
BAM BBD BDT BGN BHD BIF BMD BND BOB BOV BRL BSD BTN BWP BYN BZD
CAD CDF CHE CHF CHW CLF CLP CNY COP COU CRC CUP CVE CZK
DJF DKK DOP DZD
EGP ERN ETB EUR
FJD FKP
GBP GEL GHS GIP GMD GNF GTQ GYD
HKD HNL HTG HUF
IDR ILS INR IQD IRR ISK
JMD JOD JPY
KES KGS KHR KMF KPW KRW KWD KYD KZT
LAK LBP LKR LRD LSL LYD
MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MXV MYR MZN
NAD NGN NIO NOK NPR NZD
OMR
PAB PEN PGK PHP PKR PLN PYG
QAR
RON RSD RUB RWF
SAR SBD SCR SDG SEK SGD SHP SLE SLL SOS SRD SSP STN SVC SYP SZL
THB TJS TMT TND TOP TRY TTD TWD TZS
UAH UGX USD USN UYI UYU UYW UZS
VED VES VND VUV
WST
YER
ZAR ZMW ZWG
XAG XAU XBA XBB XBC XBD XDR XPD XPT XSU XUA
""".split())


def est_iso(devise: str) -> bool:
    """Vrai si le code est un code ISO 4217 actif (majuscules, 3 lettres)."""
    return str(devise or "").upper().strip() in ISO_4217

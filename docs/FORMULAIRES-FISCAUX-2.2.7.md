# Formulaires de fiscalité — 2.2.7 (revenus 2025 et après)

## Réponse au signalement

Le calcul/rendu des formulaires de l'APK 2.2.2 et de la 2.2.6 était identique :
`formulaires()`, `tableauCases()` et `formulairesIndisponibles()` étaient les mêmes
au caractère près. **Ce constat ne disculpe pas le guide** : il contenait déjà
des reports faux (2074 « 905 PV / 913 MV ») et des lignes omises (2086). En outre
il attendait le calcul asynchrone des transactions et disparaissait complètement
pour les années non simulables. La page Streamlit gardait aussi ses formulaires
repliés : le contenu paraissait absent.

## Références officielles relues le 17/10/2026

| Déclaration revenus 2025 (2026) | Imprimé DGFiP et repère probant |
| --- | --- |
| 2042, N°10330*30 | [PDF 2042](https://www.impots.gouv.fr/sites/default/files/formulaires/2042/2026/2042_5535.pdf), cadre 1 page 3 (1AJ/1AK/1BJ/1BK), cadre 2 (2TR/2CG/2BH/2DF/2OP), cadre 6 (6DE), cadre 8 (8UU). |
| 2042 C, N°11222*28 | [PDF 2042 C](https://www.impots.gouv.fr/sites/default/files/formulaires/2042/2026/2042_5472.pdf), cadre 3 : « plus-value avant abattement » 3VG, abattement 3SG, moins-value 3VH, crypto 3AN/3BN, option 3CN. |
| 2047, N°11226*28 | [PDF 2047](https://www.impots.gouv.fr/sites/default/files/formulaires/2047/2026/2047_5488.pdf), cadre 2 : 250, 251=238+240+250, 252→2TR ; cadre 3/30 : source étrangère ; cadre 7/70 si crédit d'impôt (8VL/8PL). Le pays du courtier **ne prouve pas** le pays de source ni l'absence de crédit. |
| 2074, N°11905*26 | [PDF 2074](https://www.impots.gouv.fr/sites/default/files/formulaires/2074/2026/2074_5497.pdf), cadre 510 : 511, 512, 514–524. Sous 524 : « les totaux … sont à reporter ligne **903, col. PV ou MV** ». Cadre 900 : **905 = instruments financiers à terme** ; **913 = total du cadre** (rectification du diagnostic initial : 913 existe !). Cadre 11 : colonnes **A à H**, puis suivi des moins-values cadre 12. |
| 2074-CMV, N°15484*11 | [PDF 2074-CMV](https://www.impots.gouv.fr/sites/default/files/formulaires/2074-cmv/2026/2074-cmv_5494.pdf), **alternative** si dispensé de 2074 et IFU de l'intermédiaire : cadre 1 pertes antérieures, cadre 2 lignes 21 à 25, étape 2 imputation. Ne pas cumuler deux fois les mêmes cessions. |
| 2086, N°16043*07 | [PDF 2086](https://www.impots.gouv.fr/sites/default/files/formulaires/2086/2026/2086_5515.pdf), cadre 2 : 2101–2103, **une colonne par cession** 211–223, 224 = total du déclarant ; cadre 5 : 51 = prix nets (218+258+318+413+423+433) du **foyer**, 52 = résultat du foyer vers 3AN/3BN. La notice dit : les frais réduisent le premier terme (218), **pas** le quotient (217/212). Soultes 216/222 non prouvées par l'application. |
| 3916-3916 bis | [PDF 3916](https://www.impots.gouv.fr/sites/default/files/formulaires/3916/2026/3916_5454.pdf) : cadre 1 titulaire, 2 nature du compte, 3.1/3.2 compte bancaire, 4.1/4.2/4.3 compte crypto, 5 usage. Un imprimé par compte. Numéros de compte/dates/PSAN inconnus de l'application. |

## Ce qui est calculé et ce qui ne l'est pas

- **Titres connus :** chaque vente, sa date réelle, le prix brut de cession
  (516), ses frais (517), son prix net (518), le prix d'acquisition hors frais
  (521), les frais d'acquisition attribués (522), le coût total (523) et 524
  sont produits en EUR. Les 524 positives et négatives sont agrégées séparément
  en 903/PV et 903/MV. Les moins-values antérieures connues suivent les cadres
  10, 11 (A–H) et 12 ; si un titre a pu être acquis avant 2018, les colonnes
  F/G/H ne sont **pas certifiées** avant vérification de l'éligibilité.
- **Crypto connue :** le calcul suit la formule 218 − 223 × 217 / 212. Les lignes
  215, 216 et 222 sont visibles ; les soultes ne sont PAS connues, jamais
  certifiées à zéro. 224 et la partie connue de 51 sont visibles, **pas** le
  total 52 du foyer ni les reports personnels 3AN/3BN prêts à déposer. Les
  autres plateformes, les cessions du conjoint et les personnes interposées
  doivent être vérifiées. Même en dessous du seuil de 305 €, la notice demande
  l'annexe avec les prix de cession.
- **2042/2047/3916 :** les salaires/charges et les intérêts déjà saisis servent
  d'indications, pas de preuve que tous les revenus du foyer sont connus. 2CG,
  2BH, 2DF, 6DE, le crédit d'impôt étranger, la source des PV et les détails
  3916 inconnus sont affichés « à vérifier / à compléter », jamais 0 € supposé.

Ce guide n'est **pas** une transcription de toutes les rubriques des imprimés
(immobilier, PEA, salariés BSPCE, exit tax…), mais de celles **utiles ou
possibles pour ce portefeuille**. Une catégorie extérieure à l'application doit
être ajoutée à partir de son propre justificatif et de l'imprimé officiel.

## Années suivantes

Une saisie de l'année des **revenus** (2025 à 9999) donne accès au guide même
si l'année n'existe pas encore. Tant que les imprimés de cette année ne sont pas
publiés/vérifiés, les numéros visibles sont les **repères des revenus 2025**,
explicitement signalés comme non officiels ; aucun montant d'un autre millésime
n'est copié dans les cases. Les éventuelles PV calculées sur les opérations du
portefeuille sont une **estimation séparée non reportable**. Un formulaire futur
exact et prêt à déposer est impossible avant publication de ses propres numéros,
intitulés et règles : aucun chiffre ni URL n'est inventé.

L'écran 2025 montre les tableaux immédiatement, même en attente de lecture de
transactions ; les montants arrivent après calcul, ou une raison de refus prend
leur place. Un cours FX manquant ou une vente sans acquisition prouvée ne produit
aucune plus-value partielle certifiée. La simulation R2 2025 reste prioritaire et
les autres sections fiscales ne sont pas modifiées.

## Tests hors réseau

`tests/test_fiscal_formulaires_227.js` : 7 parcours, chaque repère utile,
sélecteur d'année 2035, erreur de report 905/913, frais de deux ventes à des
dates distinctes, garde foyer 2086 et échappement HTML. `tests/test_formulaires_227.py` :
mêmes montants en Python, suivi des pertes antérieures (cadres 10/11/12).
`tests/test_execution_pages.py` : la page Streamlit s'exécute avec les clés
corrigées. Aucune migration n'est ajoutée. Bascule DGFiP totale : **non**.

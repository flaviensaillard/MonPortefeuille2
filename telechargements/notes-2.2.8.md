# MonPortefeuille 2.2.8 — montants visibles dans les cases fiscales

**Version 2.2.8 · code 38 · tag réservé `apk-2.2.8`.**

Installez par-dessus la 2.2.7 sans effacer les réglages. Pas de migration SQL.
Sur la branche de travail, l'APK est un **artefact Actions** ; aucune release
publique ni fusion ne sont effectuées sans décision du propriétaire.

## Le correctif demandé

- Les **sept imprimés** du guide fiscal Android sont à nouveau **repliables**.
  Leur en-tête montre un résumé chiffré des cessions connues ; un onglet ouvert
  ne se referme plus quand le calcul asynchrone termine. Les cinq volets
  d'imprimés Streamlit sont aussi repliés par défaut, avec les montants dans
  leurs titres.
- Sur téléphone, **numéro de case, intitulé et montant** s'affichent l'un sous
  l'autre : le montant ne se cache plus hors écran dans une colonne à droite.
- Pour les titres, vous voyez **un total par titre** et **chaque vente datée**
  (2074 : prix brut 516, frais 517, net 518, coût 523, résultat 524), puis les
  contributions distinctes à **903/PV et 903/MV**, les colonnes A–H du cadre 11
  et les valeurs connues de **3VG/3VH**. Deux ventes du même titre ne sont pas
  réduites à une date fictive ou à une seule PV.
- Pour les crypto-actifs, vous voyez chaque cession et le résultat intermédiaire
  par actif, puis la part connue des lignes **224 et 51**. Les 2042/2047 montrent
  les salaires, frais et intérêts saisis même si la simulation d'impôt est
  suspendue faute d'indication sur le précompte des intérêts. Sur Streamlit,
  une synthèse par titre et par crypto-actif accompagne les ventes datées ;
  les catégories calculables restent consultables malgré un blocage de l'IR.
- Un cours manquant sur une crypto ne cache plus les titres chiffrables (et
  inversement). Une vente excédentaire ou une position non prouvée **bloque le
  total de son segment** : aucun 903/224 partiel n'est proposé comme montant de
  déclaration. Le bilan d'impôt reste suspendu si les données ne suffisent pas.

**À vérifier avant tout report :** les autres comptes, IFU, pertes antérieures,
précompte, crédits d'impôt, soultes et cessions du foyer. Les cases 3AN/3BN et
la ligne 52 du 2086 ne sont pas un total du foyer certifié par ce portefeuille.
Aucune case des revenus 2026 ou suivants n'est présentée comme officielle avant
la publication de son propre imprimé ; seules des estimations clairement **non
reportables** peuvent apparaître à part.

Méthode, exemples de calcul et limites :
[docs/MONTANTS-FISCAUX-2.2.8.md](../docs/MONTANTS-FISCAUX-2.2.8.md).

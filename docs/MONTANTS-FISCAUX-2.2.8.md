# Montants par titre et par case — correctif 2.2.8

Ce correctif concerne le **guide fiscal de l'APK et la page Streamlit**, sans
modifier les saisies « Situation familiale » et « Déclaration de base », ni la
R2 des revenus 2025.
Les références et limites des imprimés revenus 2025 restent documentées dans
[FORMULAIRES-FISCAUX-2.2.7.md](FORMULAIRES-FISCAUX-2.2.7.md).

## Défauts corrigés

1. Sur un téléphone, le tableau à trois colonnes avait une largeur minimale de
   520 px : le **montant était dans la colonne de droite, hors écran**. En dessous
   de 600 px, chaque ligne affiche désormais son numéro, son intitulé **et son
   montant les uns sous les autres**, sans défilement horizontal obligatoire.
2. Si le précompte des intérêts était inconnu, `simulerFoyer()` refusait à juste
   titre de calculer l'impôt, mais son exception **effaçait aussi toute la section
   des formulaires**, même lorsque les cessions de titres/crypto et leurs cours
   étaient connus. L'impôt reste suspendu ; les cases indépendantes sont désormais
   renseignées depuis leurs propres données. Même règle si seul un cours crypto
   manque : il ne masque plus les titres chiffrables, et inversement.
3. Les imprimés Android, remplacés par des sections toujours ouvertes en 2.2.7,
   sont de nouveau **repliables** (`<details>/<summary>` natifs, sept imprimés).
   Le bandeau fermé affiche les montants connus. L'état ouvert/fermé survit au
   remplacement asynchrone du guide et à un nouveau rendu de **la même année**.
   Changer de millésime repart d'un état fermé, sans recopier les anciens montants.
4. La page **Streamlit** referme par défaut les cinq volets d'imprimés (toujours
   ouvrables) en affichant 1AJ, 3VG/3VH, 903/PV/MV ou 224/51 connus dans leurs
   titres. Elle détaille maintenant les montants **par titre** et **par crypto**,
   sans effacer les ventes datées. Un précompte inconnu, un cours absent ou une
   vente excédentaire suspend le bilan IR, mais n'enlève pas les cases calculables
   d'un autre segment. Les chiffres partiels du segment touché sont masqués ;
   la cause et l'actif restent visibles. Les revenus autres que 2025 n'affichent
   pas les numéros 2025 comme ceux d'un formulaire futur : seulement des
   **estimations explicitement non reportables** et les dates des ventes.

## Ce que voit le porteur pour les revenus 2025

- **2074 :** une synthèse **par titre**, avec nombre de cessions, sommes des lignes
  516 (brut), 517 (frais), 518 (net), 523 (coût), bilan 524 et contribution aux
  deux colonnes **903/PV et 903/MV**. Chaque **cession individuelle** garde sa
  vraie date et ses valeurs 511, 512, 514–524. Les ventes positives et négatives
  du **même titre** alimentent séparément les deux colonnes 903 : le solde par
  ticker ne les remplace pas. Les titres **non cédés** n'ont pas de ligne de
  cession à chiffrer. La ligne 913 affiche les parts connues de ses deux
  colonnes, **pas un total exhaustif** des autres cadres de la 2074. Les colonnes
  A–H du cadre 11 ont chacune leur propre ligne et leur propre montant visible ;
  F/G/H restent à vérifier si un abattement avant 2018 est possible. Les cases
  3VG/3VH donnent le résultat du seul portefeuille, y compris son zéro réel,
  avec la limite « autres comptes et pertes du foyer à contrôler ».
- **2086 :** synthèse par crypto-actif, puis **chaque cession** et ses montants
  211–223 ; la contribution à 224 est indiquée comme **calcul intermédiaire,
  hors case**, sous hypothèse sans soulte. 224 = total connu du déclarant ; 51 =
  prix nets connus, **part seulement** du foyer ; 52, 3AN/3BN et le seuil de 305 €
  restent à contrôler pour **tout le foyer**. Soultes 216/222 inconnues, pas zéro.
- **2042/2047 :** les salaires/frais déjà saisis et les intérêts positifs déjà
  saisis restent visibles dans leurs cases, même si l'arbitrage de l'impôt est
  bloqué. La qualification des intérêts étrangers, leur précompte et la totalité
  des revenus du foyer sont à vérifier sur l'IFU/les justificatifs. **2074-CMV**
  n'est pas alimentée par recopie automatique des montants 2074 : c'est un
  parcours alternatif conditionné à l'IFU. Les champs personnels de la 3916,
  2CG/2BH/2DF/6DE et les crédits étrangers ne sont pas inventés.

Si **un cours FX, une position acquise ou une vente valide manque**, le total du
segment concerné (2074 ou 2086) et ses cases de report restent **indisponibles** ;
le motif nomme l'actif et la date. Une vente excédentaire ne laisse plus un total
partiel sous l'apparence d'une case certifiée. L'autre segment peut rester visible,
mais **le bilan d'impôt global est refusé** jusqu'à complétude. Aucun taux de
change ou nombre de soultes n'est reconstitué par défaut.

Les revenus **2026 et suivants** gardent uniquement le modèle de numéros 2025
annoncé comme **non officiel**. Des estimations distinctes par cession connue du
**bon millésime** peuvent être affichées comme **NON reportables**, jamais dans
les cases futures. La version ne connaît pas les comptes, IFU et cessions du
foyer absents de la base ; aucun montant personnel ne figure dans le dépôt.

## Tests et livraison

`tests/test_fiscal_montants_228.js` exécute le vrai moteur et le rendu avec
plusieurs titres, plusieurs ventes d'un titre (y compris gain + perte), une
crypto, un précompte inconnu, un cours refusé, une vente excédentaire, l'état
ouvert/fermé, un retour asynchrone périmé, la garde d'année et la mise en page
mobile. `tests/test_montants_fiscaux_228.py` contrôle les mêmes gardes côté
Streamlit, l'agrégation par actif et le rendu réel avec `AppTest` (intérêts sans
précompte, FX et ventes invalides). Les tests 2.2.7 restent en place. Aucun SQL,
aucune migration. La branche fournit un **artefact de build**, pas une release
publique ; la PR reste ouverte.

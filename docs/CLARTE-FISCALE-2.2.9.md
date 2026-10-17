# Chiffres de l’application d’abord — guide fiscal 2.2.9

**Revenus 2025 / déclaration 2026 seulement pour les numéros de cases vérifiés.**
Les imprimés DGFiP et leurs références restent dans
[FORMULAIRES-FISCAUX-2.2.7.md](FORMULAIRES-FISCAUX-2.2.7.md). Les formules et
situations de blocage sont décrites dans
[MONTANTS-FISCAUX-2.2.8.md](MONTANTS-FISCAUX-2.2.8.md). Ce correctif ne change
**ni les calculs ni les saisies protégées** « Situation familiale » et
« Déclaration de base ». Aucune migration SQL ni écriture sur les données du
propriétaire.

## Ce qui change à l’écran

- **APK :** un aperçu au-dessus des sept imprimés repliés présente directement
  1AJ/1BJ et 2TR saisis, 3VG/3VH et 903/PV/MV calculés, puis 224 et la part
  connue de 51 si des crypto-actifs ont été cédés. La fiche concernée donne le
  même montant auprès de son numéro de case sur téléphone, sans tableau à
  trois colonnes ni défilement horizontal. Les synthèses par titre ou
  crypto-actif restent présentes. **Chaque cession** ouvre séparément ses
  lignes 510 (2074) ou 211–223 (2086), avec sa vraie date. L’état ouvert est
  conservé lors des actualisations de la même année.
- **Streamlit :** aperçu chiffré puis cinq volets repliables ; au sein de la 2074
  et de la 2086, des onglets distincts séparent le récapitulatif par actif du
  détail par cession et des pertes. Un bilan d’impôt suspendu n’efface pas le
  salaire, les intérêts ou l’autre segment de ventes calculable.
- Les répétitions « À compléter depuis vos justificatifs » disparaissent des
  cases calculables. Une catégorie sans vente ne reçoit pas des zéros de
  déclaration. En revanche un cours/lot manquant ou une vente excédentaire
  continue de **bloquer tout le total de sa catégorie** ; l’autre catégorie
  reste visible. Les chiffres proviennent des données enregistrées dans
  l’application : aucun relevé supplémentaire n’est demandé pour seulement
  *voir* ces mêmes chiffres.

## Ce qui n’est pas déduit des transactions

- **2042 / 2042 C :** le précompte (2CG/2BH/2DF), la CSG du patrimoine
  effectivement payée (6DE), l’option globale 2OP et l’option crypto 3CN
  ne sont pas inventés ; aucune CSG 2BH/2DF n’est additionnée à 6DE.
  3VG/3VH sont les résultats **de ces titres**, non des autres comptes et
  pertes du foyer. Le cas échéant, abattements avant 2018 (3SG, F/G/H du
  cadre 11) restent à qualifier, sans zéro présumé.
- **2047 :** 252 → 2TR affiche les intérêts enregistrés ; 250 et 251 montrent
  le même montant **sous les conditions indiquées** (absence de crédit d’impôt
  et de lignes 238/240). Le pays du courtier ne prouve ni la source fiscale
  ni la retenue étrangère. La 2074-CMV est **alternative**, non un double report
  automatique des lignes 903 en 21/25.
- **2086 :** 224 est l’estimation du déclarant **sans soulte** ; 51 et 52 sont
  des **projections de la seule partie connue du foyer**, montrées avec leur
  montant et un statut conditionnel. Les 216/222, l’identité et les autres
  supports ne sont pas établis par les transactions. 3AN/3BN affichent la
  projection obtenue **si** le foyer se limite à l’application, sans présenter
  celle-ci comme un montant définitif : le seuil de 305 € dépend de toutes les
  cessions du foyer (ligne 51), puis le résultat de la ligne 52. La divergence
  rédactionnelle entre formulaire et notice sur ce seuil reste documentée
  dans la référence 2.2.7, sans nouvelle interprétation.
- **3916 / 3916-bis :** les comptes répertoriés sont listés une fois. Les
  numéros, dates, identité, usages, PSAN et éventuels comptes externes ne sont
  pas générés par l’application.

Pour des **revenus 2026 ou postérieurs**, seuls des calculs distincts portant
sur les opérations de l’année sélectionnée sont montrés comme **estimations NON
reportables**. Les cases 2025 ne sont jamais présentées comme un imprimé futur
publié. Ce guide ne certifie pas une déclaration complète du foyer.

## Régressions et livraison

`tests/test_clarte_fiscale_229.js` vérifie aperçu, montants par case,
conditions 3AN/3BN/51/52, absence de faux champs de comptes ou de CMV,
neutralité des années sans ventes, abattement ancien et échappement HTML.
`tests/test_fiscal_montants_228.js` garde les essais de cessions opposées,
FX indisponible, ventes excédentaires, état des replis et millésime futur.
`tests/test_montants_fiscaux_228.py` rend réellement la page Streamlit avec
plusieurs scénarios fictifs et vérifie aperçu et onglets.

APK **2.2.9 (code 39)** : artefact Actions sur la branche de travail. La
release ne peut partir que de `main` après décision explicite du propriétaire ;
la PR #24 reste ouverte. Aucun test physique de l’APK n’est déduit des tests.

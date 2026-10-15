# MonPortefeuille 2.2.3 — millésimes pérennes, valeurs officielles corrigées, historique Supabase

**Version :** 2.2.3 · **Code :** 33 · **Release unique :** `apk-2.2.3`

Installez-la par-dessus la 2.2.2 : signature inchangée, code de version supérieur.
Les réglages et les données du téléphone ne sont pas effacés.

Cette version **ne prétend toujours pas remplacer une déclaration**, et n'offre
**pas** de bascule intégralement DGFiP.

## Ce qui est livré

- **Valeurs historiques corrigées d'après le BOFiP** (revenus 2022, 2023 et 2024) :
  barème 2024, décotes et seuils de décote 2022/2023/2024, plafonds du quotient
  familial 2022 et 2024 portent désormais les valeurs officielles publiées, avec
  pour chacune le permalien, la loi et le passage cité. Effet visible : pour
  1 000 € d'impôt brut, la décote des revenus 2024 passe de 471,50 € à 436,50 €.
  Les revenus 2025 (révision R2 déjà publiée par le propriétaire, qui **reste
  prioritaire**) et 2026 (provisoire) ne sont pas modifiés. **Une correction n'est
  pas une collecte** : les cases de la matrice restent « non disponible » tant que
  le millésime n'a pas été collecté.
- **Millésimes suivants ouverts par la seule collecte** : revenus 2027, 2028,
  2029… Aucune liste d'années écrite en dur ne subsiste, ni dans le bouton, ni dans
  les libellés, ni dans le moteur. Six familles se collectent sans modification de
  code (barème, décote et plafond général du quotient familial lus au BOFiP, barème
  kilométrique, abattement de 10 %, forfait repas, prélèvements sociaux des
  plus-values de titres). À partir des revenus 2026, un millésime complet est
  calculable **sans aucune constante embarquée**.
- **Inventaire pérenne des sources** : 11 familles × 4 millésimes, avec pour chaque
  case l'adresse exacte ou `null`, la date de vérification, la distinction entre
  « lecture vérifiée » et « lecture autorisée », un constat écrit et le motif.
  Aucune adresse n'est inventée. Quatre états seulement : lisible-vérifiée,
  lisible-sous-réserve, repérée-non-autorisée, absente.
- **Historique des collectes DGFiP côté serveur** : les documents lus sont écrits
  dans `pf2_fiscal_collectes` (migration **013**, appliquée par le propriétaire —
  succès communiqué le 15/10/2026, **ne pas la rejouer**), une ligne par document
  réellement lu, avec son adresse, son millésime de revenus et sa révision.
  Append-only : une collecte identique n'écrit rien, une rectification du même
  millésime crée la révision suivante et la précédente reste consultable.
  **Aucune donnée personnelle** (ni montant du foyer, ni taux de prélèvement à la
  source, ni ligne de déclaration) et **jamais** la table des règles publiées
  `pf2_fiscal_annees` : l'APK ne publie aucune révision. Un échec d'écriture ne
  bloque ni la collecte ni l'affichage, et son motif est montré.
- **Sonde de vérification en lecture seule** :
  `docs/VERIFIER-HISTORIQUE-COLLECTES-DGFIP.sql`, un `select` unique à coller dans
  Supabase SQL Editor. Elle dit si la migration 013 est appliquée, combien de
  sources DGFiP sont autorisées, combien de collectes sont historisées et sur quels
  millésimes, et elle contrôle que les droits de l'APK n'ont pas bougé. Aucune
  écriture, aucune donnée personnelle affichée.
- **Lecteurs PDF paramétrés par millésime** (notice 2086, brochures RCM,
  charges/CSG, plus-values) : les notices 16043\*05 (revenus 2023) et 16043\*06
  (revenus 2024) sont repérées, les ancres de lecture sont propres à chaque année,
  et le texte d'une année n'est jamais reporté sur une autre.

## Limites explicites

- **Bascule DGFiP totale : non.** Revenus 2026 : aucun document publié (0 famille
  sur 11). Revenus 2023 et 2024 : 8 familles sur 11 repérées, dont 6 vérifiées.
  Revenus 2025 : 11 sur 11, toutes vérifiées.
- Pour les cessions privées de crypto-actifs **en 2025**, la contradiction
  documentaire n'est **pas levée** : le BOFiP crypto en vigueur (version du
  23/04/2024) affiche 17,2 % de prélèvements sociaux, la FAQ modifiée le 17/07/2026
  affiche 18,6 %. Les deux termes et leurs dates sont affichés dans l'audit.
  **Aucun taux propre aux cessions crypto 2025 n'est activé.**
- Les cinq familles de brochures et notices PDF demandent, pour chaque millésime à
  venir, une adresse inscrite dans l'inventaire : les noms de fichiers DGFiP ne se
  devinent pas et rien n'est inventé. Tant qu'une case vaut `null`, la lecture est
  refusée et le motif est affiché.
- RCM (nature du produit, année, précompte réel, option 2OP du foyer), CSG
  déductible du foyer, exhaustivité de l'annexe 2086, plafonds particuliers du
  quotient familial, changements de formule et arrondis : **non contrôlés** par ces
  lectures. Une brochure publique n'est pas votre avis d'imposition.
- L'historique écrit côté serveur **n'active rien** : le moteur ne relit jamais
  cette table et n'utilise que le cache local, revérifié à chaque ouverture.

Voir `docs/MATRICE-COUVERTURE-FISCALE-2023-2026.md` (matrice, inventaire,
pérennité, tests), `docs/COLLECTE-FISCALE.md` (migration 013 et historique des
collectes) et `docs/VERIFIER-HISTORIQUE-COLLECTES-DGFIP.sql` (sonde).

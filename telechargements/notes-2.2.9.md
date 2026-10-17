# MonPortefeuille 2.2.9 — chiffres fiscaux de l’application en premier

**Version 2.2.9 · code 39 · tag réservé `apk-2.2.9`.**

Installez par-dessus la 2.2.8 sans effacer vos données. Aucune migration SQL.
Sur la branche de travail, l’APK est un **artefact Actions**, pas une release
publique ; aucune fusion ni publication n’est faite sans votre décision.

- L’aperçu fiscal montre directement vos salaires et intérêts saisis, vos
  résultats par titre (3VG/3VH, 903/PV et 903/MV) et vos résultats crypto
  calculés (224 et part connue de 51). Chaque imprimé reste repliable ; une
  vente s’ouvre séparément pour afficher toutes ses lignes et sa date réelle.
  Numéro, intitulé et montant sont lisibles ensemble sur téléphone.
- Les répétitions « À compléter depuis vos justificatifs » ne masquent plus
  les données déjà présentes dans l’application. Les éléments **réellement
  absents** sont regroupés : précompte/CSG, soultes, autres opérations du
  foyer, détails personnels des comptes étrangers et abattements éventuels.
- Streamlit commence aussi par vos chiffres, puis sépare dans ses volets les
  montants par actif, les cessions et le suivi des pertes. Un cours manquant
  ou une vente supérieure à la position bloque le total de **sa** catégorie,
  sans effacer l’autre ni transformer un total partiel en case à déclarer.

**Attention au foyer :** 3AN/3BN et la ligne 52 affichent une **projection
conditionnelle**, pas un report certifié : toutes les plateformes, membres du
foyer, soultes et le seuil de 305 € sur la ligne 51 peuvent changer le montant.
La 2074-CMV est un parcours alternatif à la 2074, pas une seconde déclaration
des mêmes ventes. Aucun imprimé des revenus 2026 ou suivants n’est inventé.

Détails et contrôles :
[docs/CLARTE-FISCALE-2.2.9.md](../docs/CLARTE-FISCALE-2.2.9.md).

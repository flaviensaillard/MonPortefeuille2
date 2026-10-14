# MonPortefeuille 2.2.2 — collecte fiscale DGFiP indicative

**Version :** 2.2.2 · **Code :** 32 · **Release unique :** `apk-2.2.2`

Cette version achève la livraison du **bouton fiscal DGFiP par année**, mais **ne prétend pas remplacer une déclaration ni offrir une bascule intégralement DGFiP**. Installez-la par-dessus la 2.2.1 : signature inchangée, code de version supérieur. Les réglages et données du téléphone ne sont pas effacés.

## Ce qui est livré

- Consultation DGFiP par millésime : revenus 2023, 2024, 2025 et recherche 2026. Les résultats officiels trouvés pour les années compatibles peuvent alimenter une **simulation indicative** sans validation humaine annuelle. Un millésime absent ou une source incomplète ne récupère jamais silencieusement les chiffres de l'année précédente.
- IR, décote et plafond général du quotient familial ; abattement de 10 %, repas et kilomètres salariés ; plus-values de titres ; RCM/CSG et crypto documentées en lecture partielle. Des extraits PDF de la notice 2086 et des brochures DGFiP sont conservés localement comme historiques révisables par année et par compte. La **révision R2 des revenus 2025 déjà publiée par le propriétaire reste prioritaire** ; la collecte ne la remplace pas.
- Compte rendu court sur l'écran Fiscalité, « Copier le résumé » et détail des preuves replié. Les cinq PDF lus en conditions réelles par l'APK ont été confirmés par le propriétaire.
- Les anciennes collectes OpenFisca ne sont plus appelées par la simulation mobile ; aucune nouvelle migration SQL n'est nécessaire. **Ne rejouez pas les migrations 011/012 ni l'activation R2 déjà effectuées.**

## Limites explicites

- Pour les cessions privées de crypto **en 2025**, la FAQ DGFiP actuelle affiche 18,6 % de prélèvements sociaux, mais ne date pas cette valeur par année de cession ; le BOFiP crypto encore daté de 2024 affiche 17,2 %. Les deux brochures de revenus 2025 lues décrivent IR/2086 et une évolution générale de la CSG sans attester directement un taux global PS propre aux cessions crypto 2025. **Aucun nouveau taux crypto 2025 n'est activé par le bouton** sur une attribution implicite.
- Les cases et la déduction de CSG RCM dépendent de la nature du produit, du précompte réel et de l'option 2OP du **foyer**. Les documents publics ne sont pas l'avis d'impôt ou les justificatifs du foyer. Une lecture PDF ne certifie ni l'exhaustivité de l'annexe 2086, ni les montants personnels, ni le PAS, ni tous les changements de formule et arrondis. Les plafonds spéciaux de QF restent non contrôlés. La divergence documentaire DGFiP sur les PS de titres 2025 reste visible dans l'audit.
- Les publications disponibles ne permettent pas une simulation complète officielle des **revenus 2026** : aucun barème 2025 n'est reconduit comme 2026 par le bouton. Les données DGFiP de 2023/2024/2025 déjà vérifiées sont rétroactives par année ; les catégories sans preuve demeurent « non disponibles ».

**Bascule DGFiP totale : non.** La collecte partielle n'est jamais présentée comme une révision fiscale complète. La simulation ne vaut pas avis fiscal et ne certifie pas la déclaration personnelle.

Voir `docs/COLLECTE-FISCALE.md`, `docs/LECTURE-PDF-CRYPTO-DGFIP.md` et `docs/LECTURE-PDF-RCM-CSG-DGFIP.md` pour les sources et tests détaillés.

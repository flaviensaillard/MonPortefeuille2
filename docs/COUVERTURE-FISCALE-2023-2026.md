# Matrice de couverture DGFiP — audit du 14 octobre 2026

## Point de départ vérifié avant modification

Branche de session `arena/3f35d200-monportefeuille2`, HEAD et main distant :
`e878c2f86ae76036ccaa206b316474437f987df4`. PR #22 fusionnée le
14/10/2026 à 10:58:49 UTC ; release `apk-2.2.2` publiée à 10:59:31 UTC,
actif `Porte-feuille-2.2.2.apk` présent. Aucune migration 011/012 rejouée.
La confirmation Android des cinq lecteurs PDF est acquise (retour utilisateur),
ce n'est pas un nouveau test Android de cette session.

## Matrice initiale, avant les modifications de cette session

« Collectable » signifie lecteur existant avec refus de mauvais millésime,
pas une collecte réussie sur le compte présent. « Partiel » n'autorise aucune
révision complète. Les constantes historiques ne sont pas une preuve DGFiP.

| Catégorie | Revenus 2023 / déclaration 2024 | Revenus 2024 / déclaration 2025 | Revenus 2025 / déclaration 2026 | Revenus 2026 / déclaration 2027 |
|---|---|---|---|---|
| IR, décote, QF général | Collectable BOFiP 18/06/2024 | Collectable BOFiP 14/04/2025 | Collectable BOFiP 07/04/2026 ; R2 prioritaire | Non disponible sans publication désignant 2026 et moteur compatible |
| Abattement, repas salariés, km voiture | Aide 2024 collectable | Aide 2025 collectable | Aide 2026 collectable | Non disponible ; aucune reprise 2025 ni source repas BNC |
| IR/PS titres | Aide gains 2024 collectable | Aide gains 2025 collectable | Divergence 2042 / 2074 et aide gains ; non résolue | Non disponible |
| RCM par produit/précompte/option | Non disponible | Non disponible | Règles partielles HTML/PDF ; situation du foyer non établie | Non disponible |
| CSG et année de paiement | Non disponible | Non disponible | Règles partielles PDF ; déduction personnelle non disponible | Non disponible |
| Crypto privés : PS | Non disponible | Non disponible | FAQ courante 18,6 %, BOFiP 2024 17,2 % : attribution à 2025 non établie | Non disponible |
| Crypto : formule/frais/seuil/cases | Pas de lecteur PDF propre au millésime | Pas de lecteur PDF propre au millésime | Notice 2086 et brochure lues ; portefeuille ≠ foyer exhaustif | Non disponible |
| QF spéciaux, formules et arrondis complets | Non disponible | Non disponible | Non disponible hors périmètre validé R2 | Non disponible |

Sources exactes et dates BOFiP : [collecte fiscale](COLLECTE-FISCALE.md).
Sources PDF : [crypto](LECTURE-PDF-CRYPTO-DGFIP.md),
[RCM/CSG](LECTURE-PDF-RCM-CSG-DGFIP.md).
Les dates de publication des PDF ne sont pas attestées : le chemin `2026`
désigne la déclaration, pas une date de publication ni les revenus 2026.

## Priorités et conditions d'activation

1. Chercher la preuve PS crypto **cessions 2025** ; ne pas transformer une
   FAQ mise à jour en 2026 en preuve de l'année d'effet.
2. Rendre explicites l'absence de qualification RCM personnelle et les trois
   calendriers CSG : patrimoine 2024 payé en 2025 ; RCM précomptés en 2025 ;
   gains 2025 payés sur avis 2026. 2CG ≠ 2BH ≠ 2DF ; aucune addition
   automatique en 6DE de la CSG des 2BH/2DF.
3. Contrôler les limites du 2086 du seul portefeuille, sans certifier le
   foyer, les soultes, les personnes interposées ou les arrondis officiels.
4. Refuser toute qualification « complète » pour les QF spéciaux, règles
   modifiées et arrondis non contrôlés ; conserver les révisions documentaires.

Toute nouvelle activation nécessite URL DGFiP exacte, passage probant,
année d'effet explicite, exclusions, moteur compatible, tests de refus du
mauvais millésime et de non-régression R2. Aucune activation nouvelle n'est
justifiée par cette matrice. Données personnelles et PAS restent distincts
et ne sont pas enregistrés dans les preuves publiques.

## Relectures effectivement faites pendant cette session

Lecture distante du texte des documents DGFiP réels par l'outil documentaire,
le 14/10/2026. Ce n'est **pas** une nouvelle exécution PDF.js sur Android ni
une validation de la totalité des pages de chaque document. Les tests
récurrents restent synthétiques et hors réseau. Aucun PDF brut n'est ajouté
au dépôt, aucune date de publication PDF n'est inventée.

| Source exacte / repère relu | Passage probant et portée | Décision |
|---|---|---|
| [FAQ crypto](https://www.impots.gouv.fr/particulier/questions/comment-declarer-les-plus-ou-moins-values-sur-cessions-dactifs-numeriques), publiée 16/06/2023, modifiée 17/07/2026, « Vous vendez à titre particulier » | « PFU de 31,4 % (12,8 % d'impôt + 18,6 % de prélèvements sociaux) ». Aucune année de cession attachée à ce taux ; le « depuis 2023 » concerne le régime privé/professionnel. | Pas de taux PS crypto 2025 activable. |
| [BOI-RPPM-PVBMC-30-30 du 23/04/2024](https://bofip.impots.gouv.fr/bofip/11969-PGP.html/identifiant=BOI-RPPM-PVBMC-30-30-20240423), § 10 et 15 | « prélèvements sociaux sur les revenus du patrimoine au taux global de 17,2 % » ; option barème pour les cessions depuis le 1er janvier 2023. | Divergence avec la FAQ signalée ; ni transposition automatique à 2025 ni extrapolation à 2026. |
| [Nouveautés IR 2026](https://www.impots.gouv.fr/www2/fichiers/documentation/brochure/ir_2026/pdf_som/nouveautes.pdf), prélèvements sociaux | CSG 9,2 → 10,6 %, revenus du patrimoine 2025 déclarés en 2026 ; produits de placement à compter du 1.1.2026 ; exceptions. | Pas à elle seule une preuve catégorielle du taux global PS crypto 2025. |
| [2086, déclaration 2026](https://www.impots.gouv.fr/sites/default/files/formulaires/2086/2026/2086_5515.pdf), formulaire et notice revenus 2025 | 224 = 218 − [223 × (217/212)] ; « les frais déductibles […] ne viennent pas en diminution […] pour la détermination du quotient » ; ligne 51 somme 218/258/318/413/423/433 ; 52 vers 3AN/3BN ; 3CN indépendante. | Montants et seuil du portefeuille seulement. Pas de certification du foyer, soultes ou arrondis complets. Formulaire ≤ 305, paragraphe notice < 305 : divergence conservée. Pas de PS chiffrés dans les passages relus. |
| [Brochure RCM](https://www.impots.gouv.fr/www2/fichiers/documentation/brochure/ir_2026/pdf_som/08-RCM_121a136.pdf), revenus déjà soumis aux PS, p. 132–133 | 2CG « n'ouvrent jamais droit » ; 2BH : perçus **et prélevés en 2025**, 6,8 % si 2OP ; 2DF : déduction même sans 2OP pour les produits indiqués. | Le lecteur ne connaît ni produit, ni IFU, ni précompte réel ; aucune déduction personnelle créée. |
| [Brochure charges](https://www.impots.gouv.fr/www2/fichiers/documentation/brochure/ir_2026/pdf_som/12-charges_ded_rev_225a236.pdf), CSG p. 225–226 | Patrimoine **2024 payé en 2025** ; « Vous ne devez pas le calculer vous-même ni l'indiquer ligne 6DE » pour 2BH/2DF ; calcul automatique ajouté au prérempli. | Avertissement dans le bilan : jamais d'ajout automatique 2BH/2DF en 6DE ; gains 2025 payés en 2026 distincts. Avis personnel non lu. |
| [Notice 2042 revenus 2025](https://www.impots.gouv.fr/sites/default/files/formulaires/2042/2026/2042_5477.pdf), « plus-values et gains divers » p. 14 ; [aide gains déclaration 2026](https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/2026/aides/gains.htm) | 2042 : « prélèvements sociaux de 17,2 % » ; aide : « prélèvements sociaux de 18,6 % », avec « Si, en 2025 ». | Divergence encore présente dans les textes relus. Couverture titres 2025 non établie, même si l'aide a été lue ; choix numérique existant/R2 non modifié. La notice 2074 a aussi été ouverte, sans nouveau contrôle complet de ses 27 pages. |
| [QF BOFiP du 07/04/2026](https://bofip.impots.gouv.fr/bofip/2494-PGP.html/identifiant=BOI-IR-LIQ-20-20-20-20260407), § 20, 40, 70, 80, 100 | Double liquidation ; général 1 807 €/demi-part ; parent isolé 4 262 €, garde alternée 2 131 € ; autre cas 1 079 €. Effet revenus 2025 explicite. | Preuves de l'existence de cas spéciaux, **pas** moteur compatible : aucune activation de ces montants. Un nombre de parts seul ne qualifie pas le cas. |
| [Arrondis BOFiP du 04/07/2018](https://bofip.impots.gouv.fr/bofip/2496-PGP.html/identifiant=BOI-IR-LIQ-20-20-40-20180704), IV § 50, V § 80 | Euro le plus proche, 0,50 vers le haut ; éléments modifiant bases/cotisations arrondis ; seuil sur IR global après décote. | Pas de nouvelle homologation de tous les arrondis 2086/PS ni transposition du moteur 2025 à 2023/24/26. |

Les trois pages IR BOFiP ont été relues au § 40 :
[revenus 2023, publication 18/06/2024](https://bofip.impots.gouv.fr/bofip/2491-PGP.html/identifiant=BOI-IR-LIQ-20-10-20240618),
[revenus 2024, publication 14/04/2025](https://bofip.impots.gouv.fr/bofip/2491-PGP.html/identifiant=BOI-IR-LIQ-20-10-20250414),
[revenus 2025, publication 07/04/2026](https://bofip.impots.gouv.fr/bofip/2491-PGP.html/identifiant=BOI-IR-LIQ-20-10-20260407).
Chacune annonce son année juste avant son tableau à cinq taux
0/11/30/41/45 %. Ce lien année-tableau est maintenant exigé par le lecteur.
Les autres catégories 2023/2024 ne sont pas réputées vérifiées par ces pages.

## Code livré sur la branche, sans activation nouvelle

- Matrice 2023–2026 repliée dans l'écran fiscal, état par catégorie, année de
  déclaration et publication BOFiP si connue ; aucune donnée personnelle/PAS.
  La priorité R2 ne transforme jamais la matrice en couverture complète.
- Lecteur IR : liaison locale entre annonce d'année et tableau ; refus de
  tableaux candidats ambigus, sixième tranche, taux non pris en charge,
  bornes discontinues. L'extrait conserve le tableau reconnu, au lieu de
  recomposer des lignes de plusieurs tableaux sous une année synthétique.
- La preuve de publication des futures pages BOFiP reste dans l'extrait et
  est recontrôlée en cache. Les révisions antérieures ne sont ni effacées ni
  écrasées ; une lecture devenue invalide ne reprend pas une ancienne valeur.
- La simulation globale 2026 reste indisponible même si IR/décote/QF général
  et frais deviennent collectables : les autres catégories et formules ne
  sont pas certifiées. Les calculateurs unitaires de paramètres déjà prouvés
  restent testables, sans débloquer un bilan complet.
- 2086 : métadonnées explicites `portefeuille_seul`, annexe du foyer non
  complète et cases non certifiées ; avertissement aussi au-dessus du seuil.
  Plus d'instruction « Recopiez-les tels quels » sur le 2042 indicatif.
- CSG : hypothèses chiffrées de l'ancien moteur/R2 inchangées et explicitement
  présentées comme hypothèses, non comme déduction personnelle vérifiée.
  Pas de nouveau calcul 2CG/2BH/2DF/6DE à partir des brochures.

## Tests et limites

- `test_fiscal_dgfip_refus_millesime.js` : mauvais millésime, tableau avant
  l'annonce, deux tableaux, taux/formule incompatible, discontinuité,
  publication absente à la collecte **et** en cache, rectification conservée.
- `test_fiscal_couverture_matrice.js` : non disponible, divergence titres,
  blocage de la simulation future même avec IR/frais partiels, absence de
  données personnelles et réinitialisation des preuves.
- `test_fiscal_2086_frais.js` : frais hors quotient, cas 305 / 305,01 / 325−20,
  aucune certification foyer même sans transaction ; les cas limites testent
  le comportement existant, pas une résolution de la contradiction de notice.
- `test_fiscal_activation_2025.js` : R2 synthétique toujours prioritaire,
  mêmes calculs avant/après lecture de matrice, aucune écriture Supabase.
- Ensemble local : **43 suites JavaScript** (hors `test_rendu.js`, comme la CI),
  **966 tests Python réussis**, mêmes quatre exclusions que la CI ; tests du
  service IA réussis. 16 avertissements Python de dépréciation Supabase.

Aucun nouveau taux activé, aucune migration ni publication. La couverture
DGFiP totale reste **non**. Le moteur des cas QF spéciaux, l'exhaustivité du
foyer, les RCM personnels, les PS crypto 2025, tous les arrondis et le futur
millésime 2026 restent non disponibles ou non établis comme indiqué ci-dessus.

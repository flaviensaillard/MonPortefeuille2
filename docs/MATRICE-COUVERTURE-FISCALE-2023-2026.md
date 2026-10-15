# Matrice de couverture fiscale DGFiP — revenus 2023 à 2026

**Date de vérification des sources : 14/10/2026** (lecture directe des documents
DGFiP, pas de reprise d'un compte rendu antérieur).
**Point de départ du code : `main` = `e878c2f` (PR #22 fusionnée, APK 2.2.2 publiée).**
Aucune migration SQL rejouée, aucun secret demandé, R2 des revenus 2025 inchangée
et toujours prioritaire.

Ce document accompagne `app/src/main/assets/www/js/fiscal_couverture.js`
(la matrice calculée), `fiscal_crypto_ps_recoupement.js` (la preuve manquante
recherchée au point 1) et `fiscal_gardes_foyer.js` (CSG 6DE, annexe 2086,
quotient familial).

---

## 1. Méthode : trois dates, jamais confondues

| Notion | Exemple pour les revenus 2025 | Où elle est contrôlée |
| --- | --- | --- |
| **Année des revenus** (millésime imposable) | 2025 | chaque lecteur exige l'année dans le texte, jamais dans la seule URL |
| **Année de déclaration** | 2026 | `MILLESIMES[annee].declaration` ; les URL des aides et brochures en dépendent |
| **Date de publication du document** | BOFiP : 07/04/2026 ; FAQ : modifiée le 17/07/2026 ; BOFiP crypto : 23/04/2024 | relevée dans le document lui-même, conservée avec l'extrait |

Statuts employés par la matrice :

- **établi** — un texte DGFiP du millésime attribue explicitement la valeur à
  cette année de revenus ;
- **recoupement** — la valeur résulte d'une dérivation documentée d'au moins
  deux textes DGFiP ; le statut est distinct d'un texte explicite et
  **n'active jamais un taux** ;
- **partiel** — un document du millésime a été lu, mais sa portée ne permet pas
  d'activer (règles générales, produits du foyer non déterminés, seuil non
  tranché) ;
- **non disponible** — aucune preuve de ce millésime. Une constante embarquée
  dans le code produit ce statut : elle n'est jamais présentée comme une mise à
  jour officielle.

`basculeComplete` n'est vrai que si **toutes** les catégories de **tous** les
millésimes sont « établi ». Un recoupement ne suffit pas. Aujourd'hui :
**bascule DGFiP totale : non.**

---

## 2. Matrice (état réel au 14/10/2026, avant clic du propriétaire)

Sans collecte, toutes les cases sont « non disponible » : c'est le comportement
attendu, les constantes embarquées ne comptent pas comme preuves.

Après collecte des documents du millésime **revenus 2025** (les cinq PDF déjà
confirmés sur Android + BOFiP + aides du simulateur 2026) :

Familles de documents lisibles par l'application au 16/10/2026 (§7) : revenus 2023
**8/11**, revenus 2024 **8/11**, revenus 2025 **11/11**, revenus 2026 **0/11** —
dont, au jeu de preuves entièrement vérifié sur le document réel : 6/11 pour 2023,
6/11 pour 2024, 11/11 pour 2025. Les deux familles supplémentaires de 2023 et 2024
(chapitre « charges déductibles » et notice 2086) sont **autorisées sous réserve** :
document repéré, ancre portante vérifiée verbatim, et lecteur qui exige toutes ses
preuves et refuse sans elles (§7.1).

| Catégorie | Revenus 2023 | Revenus 2024 | Revenus 2025 | Revenus 2026 |
| --- | --- | --- | --- | --- |
| Barème IR | établiable (BOFiP 18/06/2024 relu le 16/10/2026 : 11 294 / 28 797 / 82 341 / 177 106 €, identique au code) | établiable (BOFiP 14/04/2025 relu le 16/10/2026 : 11 497 / 29 315 / 83 823 / 180 294 €, **appliqué au code le 16/10/2026**, §5.3) | **établi** (BOFiP 07/04/2026) | non disponible |
| Décote | établiable (BOFiP 18/06/2024 relu le 16/10/2026 : 873 € / 1 444 €, seuils 1 929 € / 3 191 €, **appliqué au code le 16/10/2026**, §5.3) | établiable (BOFiP 14/04/2025 relu le 16/10/2026 : 889 € / 1 470 €, seuils 1 965 € / 3 249 €, **appliqué au code le 16/10/2026**, §5.3) | **établi** | non disponible |
| Plafond QF général | établiable (BOFiP 18/06/2024 relu le 16/10/2026 : 1 759 € par demi-part, identique au code) | établiable (BOFiP 14/04/2025 relu le 16/10/2026 : **1 791 €** par demi-part, **appliqué au code le 16/10/2026**, §5.3) | **établi** | non disponible |
| Plafonds QF particuliers | non disponible | non disponible | non disponible | non disponible |
| Abattement salariés 10 % | établiable (aide du millésime 2024 relue le 15/10/2026 : 495 € / 14 171 €, identique au code) | établiable (aide du millésime 2025 relue par indexation le 15/10/2026 : 504 € / 14 426 €, identique au code) | **établi** | non disponible |
| Forfait repas | établiable (même aide : 5,20 € par repas, identique au code) | établiable, **valeur non recoupée** (extrait tronqué : le forfait 2024 n'a pas été relu) | **établi** | non disponible |
| Barème kilométrique | établiable (même aide : barème 3 à 7 CV et majoration électrique 20 % identiques au code) | établiable (3 CV et 4 CV relus, identiques au code ; 5 à 7 CV non relus) | **établi** | non disponible |
| PS plus-values de titres | établiable (aide du millésime 2024 relue à distance le 14/10/2026 : 17,2 %) | établiable (aide du millésime 2025 relue à distance le 15/10/2026 : 17,2 %) | **établi** (divergence signalée) | non disponible |
| PS cessions crypto privées | partiel | partiel | **recoupement** (non activé) | non disponible |
| RCM : produit, année, précompte, 2OP, 2CG/2BH/2DF | non disponible | non disponible | **partiel** (règles seulement) | non disponible |
| CSG déductible et calendrier 6DE | non disponible | non disponible | **partiel** (règles seulement) | non disponible |
| Annexe 2086 à l'échelle du foyer | non disponible | non disponible | **partiel** (formule et cases) | non disponible |
| Changements de formule et arrondis | non disponible | non disponible | non disponible | non disponible |

« établiable » = le lecteur dispose d'une source millésimée pour ces revenus
rétroactifs et la vérifie au clic ; la case devient « établi » après lecture
réussie. Rien n'est établi pour 2026 : les brochures et aides du millésime
« revenus 2026 » (déclaration 2027) n'existent pas encore.

« relu à distance » = la page publique a été lue le 14/10/2026 hors application
pour vérifier qu'elle existe, qu'elle porte bien l'année des revenus et le taux
annoncé. Cela ne remplit **aucune** case dans l'application : seul le clic du
propriétaire, sur l'appareil, établit une valeur (voir
`VERIFICATIONS_DISTANTES` dans `fiscal_couverture.js`, affiché dans le bloc
replié de la matrice).

**Catégories jamais établies par un document public, quel que soit le
millésime** : plafonds QF particuliers, RCM personnels (produit, précompte
réel, option 2OP du foyer), CSG déductible personnelle, exhaustivité de la 2086
du foyer, changements de formule et arrondis. Elles restent « non disponible »
ou « partiel », et le bilan l'affiche.

---

## 3. Point 1 — PS des cessions crypto privées de 2025 : preuve recherchée

### 3.1 Ce que disent réellement les documents DGFiP (vérifié les 14 et 15/10/2026)

**Source A — BOFiP `BOI-RPPM-PVBMC-30-30`**, « Cession d'actifs numériques à
titre occasionnel — Modalités d'imposition et obligations déclaratives ».
Permalien : <https://bofip.impots.gouv.fr/bofip/11969-PGP.html/identifiant=BOI-RPPM-PVBMC-30-30-20240423>
(la redirection `https://bofip.impots.gouv.fr/doctrine/BOI-RPPM-PVBMC-30-30`
pointe toujours sur cette version au 14/10/2026).

- *Date de début de publication du BOI :* **23/04/2024**.
- Passage probant, § 10 : « Les plus-values des particuliers entrant dans le
  champ d'application de l'article 150 VH bis du CGI sont soumises à l'impôt sur
  le revenu au taux forfaitaire de 12,8 % (CGI, art. 200 C) ainsi qu'aux
  **prélèvements sociaux sur les revenus du patrimoine** au taux global de
  **17,2 %**. Les plus-values concernées sont donc imposées à un taux global de
  **30 %**. »
- **Limite** : ce texte ne date pas son taux par année de cession et n'a pas été
  mis à jour depuis le 23/04/2024. Il apporte cependant le maillon décisif : la
  **qualification** « revenus du patrimoine », qui fixe la date d'effet.
- **Re-vérifié le 15/10/2026** : la version en vigueur est toujours celle du
  23/04/2024, aucune version postérieure n'a été trouvée dans les sources
  indexées, et l'URL non versionnée
  (`…/11969-PGP.html/identifiant=BOI-RPPM-PVBMC-30-30`) renvoie « Document non
  trouvé » — seul le permalien versionné est lisible. La contradiction n'a donc
  **pas** été levée par une mise à jour du BOFiP : constat d'absence, à
  re-vérifier à chaque campagne.

**Source B — Brochure DGFiP « Principales nouveautés revenus 2025 »** (déclaration
2026) : <https://www.impots.gouv.fr/www2/fichiers/documentation/brochure/ir_2026/pdf_som/nouveautes.pdf>

- Passages probants : « Le taux de la CSG est porté de 9,2 % à 10,6 % sur les
  revenus du patrimoine et les produits de placement. » ; « Les revenus fonciers,
  les plus-values immobilières, l'assurance-vie, l'épargne logement restent
  soumis au taux de 9,2 %. » ; « Le taux de CSG déductible reste à 6,8 %. » ;
  « La hausse de la CSG s'applique **à compter des revenus 2025 déclarés en
  2026 pour les revenus du patrimoine** et à compter du 1.1.2026 pour les
  produits de placement. *(LFSS 2026, art. 12 ; CSS, art. L 136-8)* »
- **Limite** : la brochure ne nomme pas les actifs numériques.

**Source C — FAQ DGFiP actifs numériques** :
<https://www.impots.gouv.fr/particulier/questions/comment-declarer-les-plus-ou-moins-values-sur-cessions-dactifs-numeriques>

- « Publié le 16/06/2023, **modifié le 17/07/2026** » ; « Les plus-values
  réalisées dans le cadre de la gestion votre patrimoine privé sont imposées au
  prélèvement forfaitaire unique (PFU) de **31,4 %** (12,8 % d'impôt + **18,6 %**
  de prélèvements sociaux) ».
- **Limite** : page courante, **aucune année de cession** n'est attribuée à ce
  taux. Elle n'est donc **pas** la preuve de 2025 et reste une simple
  **corroboration**.

**Source D (rappel, catégorie titres) — Aide du simulateur IR-IFI 2026**, page
« Plus-values et gains divers » :
<https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/2026/aides/gains.htm>

- « Les plus-values de cession de valeurs mobilières réalisées depuis le
  1er janvier 2018 sont soumises, lors de leur imposition, à un prélèvement
  forfaitaire unique (PFU) de 12,8 % auquel s'ajoutent les **prélèvements
  sociaux de 18,6 %** soit au total un taux de **31,4 %**. » puis « **Si, en
  2025**, vous ou les membres de votre foyer fiscal avez vendu des valeurs
  mobilières… ».
- Contrairement à la FAQ crypto, cette page **date explicitement** le taux des
  revenus 2025. Elle porte sur les **titres**, pas sur les actifs numériques :
  le lecteur ne transpose pas ce taux à la crypto.

**Source E — Formulaire et notice 2086 n° 16043*07, « Déclaration des plus ou
moins-values réalisées en 2025 »** (lu le 15/10/2026, même URL que celle du
lecteur `fiscal_crypto_pdf_sources.js`) :
<https://www.impots.gouv.fr/sites/default/files/formulaires/2086/2026/2086_5515.pdf>

- Passages probants : « Les plus-values réalisées par les particuliers lors de la
  cession d'actifs numériques ou de droits s'y rapportant sont passibles de
  l'impôt sur le revenu selon le régime d'imposition prévu à l'article 150 VH bis
  du CGI (**taux forfaitaire de 12,8 % auquel s'ajoutent les prélèvements
  sociaux**) » ; « Si le total des prix de cession réalisés **au niveau du foyer
  fiscal** est inférieur ou égal à 305 €, vos cessions sont exonérées » ;
  « **Ligne 52** — Total des plus-values et moins-values réalisées **au niveau du
  foyer fiscal** : à reporter ligne **3AN** de la 2042 C en cas de plus-value
  globale ou à reporter ligne **3BN** de la 2042 C en cas de moins-value
  globale » ; « Plus ou moins-value brute = Prix de cession – [Prix total
  d'acquisition x Prix de cession / Valeur globale du portefeuille] » ; « vous
  devez cocher la case **3CN** … L'option est globale et porte sur le total des
  plus-values de cession d'actifs numériques réalisées par **votre foyer fiscal**
  … Cette option est **indépendante** de celle pouvant être exercée pour la
  taxation des revenus de capitaux mobiliers et des plus-values sur cession de
  droits sociaux. »
- **Limite décisive pour le point 1** : ce document est le seul, parmi ceux du
  millésime revenus 2025, à traiter explicitement des cessions d'actifs
  numériques — et il **ne chiffre pas les prélèvements sociaux**. Il ne peut donc
  pas établir 18,6 % à lui seul : c'est précisément pourquoi
  `analyserNotice` renvoie `psCrypto2025Attestes: false` et pourquoi le taux de
  2025 passe par le **recoupement** A + B, jamais par une lecture isolée.
- Portée positive : les huit preuves exigées par `analyserNotice` (millésime,
  formule, frais hors quotient, seuil du foyer, ligne 51, cases 3AN/3BN, option
  3CN, IR 12,8 %) sont bien présentes dans le document réel, et le seuil, la
  formule, la ligne de total et les cases sont rédigés **à l'échelle du foyer**
  (voir section 4).

### 3.2 Contradiction documentaire, non tranchée par un texte unique

| Document | Taux PS crypto | Date | Portée |
| --- | --- | --- | --- |
| BOFiP `BOI-RPPM-PVBMC-30-30` | **17,2 %** (global 30 %) | version 23/04/2024, toujours en vigueur au 15/10/2026 | sans année de cession |
| FAQ DGFiP actifs numériques | **18,6 %** (PFU 31,4 %) | modifiée le 17/07/2026 | sans année de cession |
| Brochure nouveautés revenus 2025 | CSG 9,2 % → **10,6 %** sur revenus du patrimoine | déclaration 2026 | « à compter des revenus 2025 déclarés en 2026 » |
| Formulaire/notice 2086 revenus 2025 | **aucun taux chiffré** (« 12,8 % auquel s'ajoutent les prélèvements sociaux ») | millésime 2026 | daté des cessions 2025, mais muet sur les PS |

La contradiction est **affichée** dans l'écran Fiscalité (bloc replié
« Contradictions documentaires DGFiP ») et dans `bilanMiseAJour`. Elle n'est
tranchée par aucune valeur inventée.

### 3.3 Recoupement retenu, et ce qu'il ne fait pas

`fiscal_crypto_ps_recoupement.js` compose A + B :

> gains crypto privés = prélèvements sociaux **sur les revenus du patrimoine**
> (A) ; la CSG sur les revenus du patrimoine passe de 9,2 % à 10,6 % **à compter
> des revenus 2025**, actifs numériques absents de la liste d'exceptions (B) ;
> donc 17,2 % + 1,4 point = **18,6 %** pour les cessions réalisées en 2025.

Propriétés garanties par le code et par les tests :

- statut **« recoupement »**, distinct d'« établi » ; `active: false` en dur ;
- **aucun taux du moteur n'est modifié** : `comparerOptionsFoyer` renvoie
  exactement les mêmes montants avant et après la collecte du recoupement
  (`tests/test_fiscal_matrice_integration.js`) ;
- la R2 des revenus 2025 **n'est pas remplacée** : un recoupement n'est pas une
  révision publiée (`revisionActive(2025)` reste inchangé) ;
- la FAQ courante n'intervient qu'en **corroboration** ; si elle contredit le
  taux dérivé, le recoupement est **rétrogradé en « partiel »** et la
  contradiction est signalée ;
- huit maillons sont nommés et vérifiés un à un (BOFiP daté, qualification
  « revenus du patrimoine », taux global publié, brochure du millésime,
  calendrier de la hausse, taux CSG ancien et nouveau, liste d'exceptions lue,
  actifs numériques hors exceptions) ;
- refus par millésime : 2023 et 2024 (aucune source ne date le taux de ces
  années, le BOFiP courant n'est pas attribué), 2026 et au-delà (documents non
  publiés) ;
- refus si le BOFiP qualifiait ces gains de **produits de placement** (date
  d'effet 1.1.2026, pas revenus 2025), si la liste d'exceptions contenait les
  actifs numériques, si un maillon manque, ou si le BOFiP affichait déjà 18,6 %
  (la dérivation deviendrait incohérente) ;
- **source sans redirection** : le BOFiP est lu par son permalien versionné
  `bofip/11969-PGP.html/identifiant=BOI-RPPM-PVBMC-30-30-20240423`, car le pont
  Android (`NativeBridge.java`) ne suit une redirection `/doctrine/` que pour la
  série `BOI-IR-LIQ-20-*`. La lecture fonctionne donc sur l'APK 2.2.2 déjà
  publiée, sans modification native. Contrepartie assumée et documentée : la
  version lue est figée au 23/04/2024 ; si la DGFiP republie ce BOI en datant le
  taux par année de cession, l'URL devra être mise à jour. La date de publication
  est relue sur la page et conservée avec l'extrait ;
- caches **par compte, par document et par millésime**, extraits revalidés à la
  relecture, rectifications et révisions d'un même millésime conservées,
  aucun PDF brut ni HTML complet stocké, aucune écriture SQL.

**Conséquence assumée : la catégorie « PS crypto privés » n'est pas « établie ».**
Elle passe de « non disponible » à « recoupement » pour les seuls revenus 2025,
et la bascule DGFiP totale reste **non**.

---

## 4. Point 4 — Échelle du FOYER pour la 2086

Preuve DGFiP complémentaire relevée le 14/10/2026, **BOFiP
`BOI-RPPM-PVBMC-30-10`** (version 02/09/2019) :
<https://bofip.impots.gouv.fr/bofip/11967-PGP.html/identifiant=BOI-RPPM-PVBMC-30-10-20190902>

> « Pour l'application de l'article 150 VH bis du CGI, il convient de retenir les
> cessions d'actifs numériques ou de droits s'y rapportant réalisées **dans le
> cadre du foyer fiscal**, c'est-à-dire les cessions réalisées tant par le
> contribuable ou les époux soumis à une imposition commune (ou partenaires liés
> par un pacte civil de solidarité - PACS) que par les autres membres du foyer
> fiscal. »

Confirmation relevée le **15/10/2026** dans le formulaire et la notice 2086
n° 16043*07 des revenus 2025 (source E de la section 3.1, même URL que le
lecteur) : le seuil, la ligne de total et les cases de report sont rédigés à
l'échelle du foyer — « Si le total des prix de cession réalisés **au niveau du
foyer fiscal** est inférieur ou égal à 305 €, vos cessions sont exonérées » ;
« **Ligne 52** — Total des plus-values et moins-values réalisées **au niveau du
foyer fiscal** : à reporter ligne 3AN … ou … ligne 3BN » ; « l'option est globale
et porte sur le total des plus-values de cession d'actifs numériques réalisées
par **votre foyer fiscal** ». Les huit preuves exigées par `analyserNotice` sont
présentes dans le document réel, mais celui-ci **ne chiffre pas les PS** : il
établit la méthode et l'échelle, jamais le taux (section 3.1).

**Millésimes 2023 et 2024** : les notices 2086 correspondantes ont été repérées le
16/10/2026 — `ir_2024/pdf_som/2086.pdf` (notice **16043\*05**, « Déclaration des
plus ou moins-values réalisées en **2023** ») et `ir_2025/pdf_som/2086.pdf` (notice
**16043\*06**, « **NOTICE (revenus 2024)** »). La seconde a été relue : formule
« Plus ou moins-value brute = Prix de cession – [Prix total d'acquisition x Prix de
cession / Valeur globale du portefeuille] », « Si le total des prix de cession
réalisés **au niveau du foyer fiscal** est inférieur ou égal à 305 €, vos cessions
sont exonérées », ligne 51 et ses lignes sources (218 + 258 + 318 + 413 + 423 +
433), report « en ligne **3AN** de la 2042 C en cas de plus-value globale ou en
ligne **3BN** … en cas de moins-value globale », « taux forfaitaire de 12,8 %
auquel s'ajoutent les prélèvements sociaux » (aucun taux de PS chiffré, comme pour
2025), option « **expresse et irrévocable** » avec la case **3CN**. `analyserNotice`
est désormais paramétré par année de cessions : ces deux millésimes sont lisibles
**sous réserve** (frais hors quotient et portée globale de l'option non relus dans
l'extrait ; le lecteur exige ses 8 preuves). `certifieFoyer` reste `false` et
`psCryptoAttestes` reste `false` quel que soit le millésime.

Ce texte fonde la règle, pas les données : `portee2086Foyer()` renvoie toujours
`certifieFoyer: false`. Seule l'inférence à sens unique est admise :

- total des prix de cession **du seul portefeuille** supérieur à 305 € ⇒
  l'exonération du foyer est exclue (`exonereFoyer: false`) ;
- total inférieur ou égal à 305 € ⇒ l'exonération du foyer **n'est pas prouvée**
  (`exonereFoyer: null`, avertissement explicite) ;
- cases 3AN/3BN `reportable` uniquement si le propriétaire atteste la complétude
  du foyer ; l'attestation ne vaut pas certification.

La distinction **3CN** (globale pour les actifs numériques du foyer,
indépendante) et **2OP** (globale pour titres et RCM) est conservée dans le
garde-fou et dans les lecteurs existants. Le cas d'égalité exacte à 305 €
(« inférieur ou égal à » dans le formulaire, « inférieur à » dans un paragraphe
de la notice) reste signalé, jamais tranché.

---

## 5. Points 2, 3 et 5 — ce qui reste non disponible

| Point | État | Raison, sans invention |
| --- | --- | --- |
| 2. RCM : produit, année, précompte réel, 2OP du foyer, 2CG/2BH/2DF | **partiel** (revenus 2025) ; **non disponible** (2023, 2024) | les brochures établissent des règles ; produit, dates et précompte du foyer ne se lisent pas dans un document public. Aucune CSG déductible personnelle n'est calculée à partir de leur seule lecture. Le précompte doit être indiqué par le propriétaire, le pays du courtier ne suffit pas. Les libellés officiels des cases 2BH/2DF/6DE ont été relus le 15/10/2026 (section 5.2). Pour 2023 et 2024, la source existe (brochure ir_2024) mais **n'est pas lue par l'application** : les lecteurs RCM/charges sont figés sur le millésime ir_2026. |
| 3. CSG : patrimoine 2024 payée en 2025, RCM précomptés en 2025, gains 2025 acquittés sur l'avis 2026 | **partiel** (revenus 2025) | les trois calendriers sont distincts dans `csgDeductible6DE()` et **confirmés mot à mot** par la brochure charges du millésime revenus 2025 (deux intitulés « CSG DÉDUCTIBLE CALCULÉE SUR LES REVENUS 2024, PAYÉE EN 2025 » et « … REVENUS 2025, PAYÉE EN 2025 », section 5.2) ; la part 6,8 % × (2BH + 2DF) calculée automatiquement ne doit **jamais** être reportée en 6DE : un 6DE qui la contient est **bloqué** comme double compte, comme l'exige la brochure (« Vous ne devez pas le calculer vous-même ni l'indiquer ligne 6DE »). Aucun montant n'est produit sans saisie personnelle. Le plafond officiel de la CSG déductible afférente aux plus-values de titres avec abattement n'est **pas modélisé** : il est annoncé comme règle non calculée. |
| 4. 2086 : formule, frais, seuil, cases au niveau du foyer | **partiel** | voir section 4 : formule, frais hors quotient, seuil et cases relus ; exhaustivité du foyer non certifiable. |
| 5a. Cas QF particuliers, changements de formule, arrondis | **non disponible** | `casParticuliersQF()` bloque bilan et recommandation 2OP dès qu'un cas particulier est déclaré ou qu'une demi-part n'est pas expliquée par la règle générale. Les plafonds spéciaux ne sont pas modélisés. |
| 5b. Divergence DGFiP sur les PS des titres 2025 | **signalée, non levée** | aide du simulateur 2026 : 18,6 % daté « en 2025 » (vérifié le 14/10/2026) ; notice 2042 : 17,2 % (lecture antérieure consignée dans `docs/COLLECTE-FISCALE.md`) ; **et la page d'accueil du même simulateur 2026 affiche encore « Flat Tax de 30% (12.8% d'impôt sur le revenu et 17.2% de prélèvements sociaux) »** — la contradiction est donc interne au millésime 2026. Les trois termes sont consignés dans `CONTRADICTIONS.ps_titres_2025` ; seul le passage qui date explicitement l'année (« Si, en 2025 … ») et dont la somme est cohérente (12,8 + 18,6 = 31,4) est retenu. Aucun taux intermédiaire n'est inventé ; R2 2025 publiée reste prioritaire. |
| 5c. Sources propres à 2023 et 2024 | **établiables, non établies avant clic** | voir ci-dessous le détail des pages relues à distance les 14 et 15/10/2026. Les PS crypto de ces millésimes restent « partiel » : aucune source ne date le taux par année de cession. |
| 5d. Paramètres des revenus 2026 | **non disponible** | aucun document du millésime. `PROVENANCE_PS[2026]` dit explicitement « reconduction de 2025 … non établi », et `verifierMaj` l'affiche. `baremeDe` et `plafondQF` refusent 2026 sans preuve ; `comparerOptionsFoyer(…, 2026, …)` lève une erreur. Sonde du 14/10/2026 : aucune page du millésime « revenus 2026 » (déclaration 2027) publiée ou indexée, aucune brochure `ir_2027` ; la sonde directe de `/calcul_impot/2027/` n'a pas abouti depuis l'environnement de vérification, le constat repose sur l'absence de publication et sur `docs/COLLECTE-FISCALE.md` (13/10/2026). |

### 5.1 Détail du point 5c — sources propres à 2023 et 2024, relues les 14 et 15/10/2026

**Revenus 2023** (aide « Plus-values et gains divers » du simulateur, millésime
déclaration 2024) —
`https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/2024/aides/gains.htm` :

> « Les plus-values de cession de valeurs mobilières réalisées depuis le
> 1er janvier 2018 sont soumises, lors de leur imposition, à un prélèvement
> forfaitaire unique (PFU) de 12,8 % auquel s'ajoutent les prélèvements sociaux
> de **17,2 %** soit au total un taux de **30 %** » ; « **Si, en 2023**, vous ou
> les membres de votre foyer fiscal avez vendu des valeurs mobilières, des
> droits sociaux et titres assimilés » ; option au barème en cochant la **case
> 2OP** ; abattement pour durée de détention réservé aux titres acquis ou
> souscrits avant le 1er janvier 2018 ; plus-value avant abattement en case
> **3VG**, moins-value reportable dix ans en case **3VH**.

Portée : le lecteur `analyserTitres(html, 2023)` accepte ce libellé et renvoie
`établi` avec `ps = 0.172` ; `PS_PAR_ANNEE[2023] = 0.172` est donc cohérent avec
la source du millésime.

**Revenus 2024** (aide « Plus-values et gains divers » du simulateur, millésime
déclaration 2025) — relue le **15/10/2026** —
`https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/2025/aides/gains.htm` :

> « Les plus-values de cession de valeurs mobilières réalisées depuis le
> 1er janvier 2018 sont soumises, lors de leur imposition, à un prélèvement
> forfaitaire unique (PFU) de 12,8 % auquel s'ajoutent les prélèvements sociaux
> de **17,2 %** soit au total un taux de **30 %** » ; « **Si, en 2024**, vous ou
> les membres de votre foyer fiscal avez vendu des valeurs mobilières, des droits
> sociaux et titres assimilés, si vous avez perçu des distributions effectuées
> par certaines structures ou si vous avez réalisé des profits sur les instruments
> financiers à terme, les gains et distributions réalisés, sont imposables au taux
> de 12,8 % (ou sur option au barème progressif de l'impôt sur le revenu) » ;
> option au barème en cochant la **case 2OP** ; abattement réservé aux titres
> acquis ou souscrits avant le 1er janvier 2018 ; case **3VG** (montant avant
> abattement en cas d'abattement de droit commun), moins-value case **3VH**
> imputable dix ans ; « Les plus-values réalisées en **2024** peuvent être
> réduites des moins-values en report des dix années précédentes » ; fiche
> **2074-CMV** si dispense de la 2074.

Portée : même lecteur, mêmes conclusions pour les revenus 2024 —
`analyserTitres(html, 2024)` renvoie `établi` avec `ps = 0.172`, cohérent avec
`PS_PAR_ANNEE[2024] = 0.172`. La page d'accueil du même simulateur, millésime
déclaration 2025 (`…/calcul_impot/2025/complet/index.htm`, « Flat Tax de 30%
(12.8% d'impôt sur le revenu et 17.2% de prélèvements sociaux) ») et celle du
millésime déclaration 2024 (cases 3TB, 3XD « PS 15,5 % », 3YA « PS 17,2 % »)
restent consignées comme **corroborations** : elles ne servent jamais seules de
preuve.

**Vérifié hors réseau** par `tests/test_fiscal_regimes_millesimes_reels.js`, qui
transpose le texte réel des deux pages (balisage simplifié) et contrôle aussi les
refus : chaque page n'est acceptée **que** pour sa propre année (la page 2023 est
refusée pour 2024 et 2025, la page 2024 pour 2023 et 2025), rien n'est établi
sans la phrase « Si, en <année> », une balise glissée entre l'année et la virgule
provoque un refus conservateur, et la collecte simulée ne remplit **que** la
colonne de son millésime (2025 et 2026 restent « non disponible »).

**Revenus 2023 — frais professionnels** (aide « Déduction des frais
professionnels » du simulateur, millésime déclaration 2024) — relue le
**15/10/2026** —
`https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/2024/aides/frais.htm` :

> « Pour les revenus perçus en **2023**, le minimum de déduction est de
> **495 €**, le maximum de **14 171 €** » ; « si vous n'avez pas de
> justifications détaillées, les frais supplémentaires sont évalués à **5,20 €**
> par repas » ; « la valeur du repas pris au foyer (évalué à **5,20 € pour
> 2023**) » ; barème automobiles — 3 CV et moins : d × **0,529** / (d × **0,316**)
> + **1 065** / d × **0,370** ; 4 CV : 0,606 / 0,340 + 1 330 / 0,407 ; 5 CV :
> 0,636 / 0,357 + 1 395 / 0,427 ; 6 CV : 0,665 / 0,374 + 1 457 / 0,447 ;
> 7 CV et plus : 0,697 / 0,394 + 1 515 / 0,470 ; seuils **5 000** et
> **20 000 km** ; « Le barème pour les véhicules 100 % électriques correspond au
> barème applicable ci-dessous **majoré de 20 %** » ; « L'arrêté du 27 mars 2023
> revalorise de 5,4 % le barème forfaitaire » ; frais « payés au cours de
> l'année **2023** », cases 1AK à 1DK, remboursements en 1AJ à 1DJ, règle des
> 40 km, apprentis exonérés à hauteur de 20 815 € (pour 2023), document
> 2041 GP pour le télétravail.

Recoupement avec le code, vérifié hors réseau par
`tests/test_fiscal_frais_millesimes_reels.js` :

| Paramètre revenus 2023 | Page officielle | Moteur embarqué | Verdict |
| --- | --- | --- | --- |
| Abattement 10 % plancher / plafond | 495 € / 14 171 € | `PLANCHER_ABATTEMENT_10[2023]` = 495, `PLAFOND_ABATTEMENT_10[2023]` = 14 171 | identique |
| Forfait repas | 5,20 € | `FORFAIT_REPAS[2023]` = 5.2 | identique |
| Barème km 3 CV (trois tranches) | 0,529 / 0,316 + 1 065 / 0,370 | `BAREME_KM[3]` = [0.529, 0.316, 1065, 0.370] | identique |
| Seuils de distance | 5 000 / 20 000 km | `SEUILS_KM_VOITURE` = [5000, 20000] | identique |
| Majoration 100 % électrique | +20 % | `MAJORATION_VOITURE_ELECTRIQUE` = 0.20 | identique |

Portée exacte, sans surinterprétation : `BAREME_KM` est, dans le code, **une
hypothèse historique recopiée pour 2022 à 2026** (commentaire en place, seule
2025 était recoupée). Cette lecture prouve que l'hypothèse est **exacte pour les
revenus 2023** ; elle ne prouve rien pour 2022, 2024 ni 2026. Le test contrôle
aussi les refus : `forfaitRepas(2026)` renvoie `null`, `fraisKilometriques(…,
2026)` lève « non disponible » sans preuve collectée, 2027 lève « Aucun barème
kilométrique », et une preuve des revenus 2023 ne remplit **aucune** case frais
de 2024, 2025 ou 2026.

**Revenus 2024 — frais professionnels** (aide du millésime déclaration 2025) —
`https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/2025/aides/frais.htm`.
L'accès direct a **échoué** le 15/10/2026 ; le texte a été lu par indexation, et
l'extrait est **tronqué** :

> « Pour les revenus perçus en **2024**, le minimum de déduction est de
> **504 €**, le maximum de **14 426 €** » ; frais « payés au cours de l'année
> **2024** », cases 1AK à 1DK ; barème automobiles — 3 CV et moins : d ×
> **0,529** / (d × **0,316**) + **1 065** / d × **0,370** ; 4 CV : 0,606 / 0,340
> + 1 330 / 0,407 ; seuils 5 000 et 20 000 km ; « Le barème pour les véhicules
> 100 % électriques correspond au barème applicable ci-dessous **majoré de
> 20 %** » ; tarif 2 roues 1 ou 2 CV : 0,395 / (0,099) + 891 / 0,248.

Recoupement : `PLANCHER_ABATTEMENT_10[2024]` = 504 et
`PLAFOND_ABATTEMENT_10[2024]` = 14 426 sont **identiques** à la source, comme le
barème 3 CV et 4 CV et la majoration électrique de 20 %.

**Ce qui n'a PAS été relu pour 2024, et n'est donc pas recoupé** : le forfait
repas (l'extrait indexé s'arrête avant) et les tranches 5 CV, 6 CV et 7 CV et
plus. Le code porte `FORFAIT_REPAS[2024]` = 5.35 et les tranches 5 à 7 CV : ces
valeurs restent des **hypothèses embarquées**, non confirmées par une source au
15/10/2026. `tests/test_fiscal_frais_millesimes_reels.js` les fige en le disant
explicitement — un test qui fige le code ne prouve pas la valeur officielle.
Rien n'est déduit de l'échec d'accès, et aucune valeur de 2023 n'est reportée sur
2024 (le forfait repas 2023 est 5,20 €, celui de 2024 est 5,35 € dans le code :
le test vérifie qu'ils diffèrent).

### 5.2 Points 2 et 3 — libellés officiels des cases RCM et CSG, relus le 15/10/2026

**Brochure « Charges déductibles » du millésime revenus 2025** (déclaration 2026),
même URL que le lecteur `analyserCharges` —
`https://www.impots.gouv.fr/www2/fichiers/documentation/brochure/ir_2026/pdf_som/12-charges_ded_rev_225a236.pdf` :

> « **CSG DÉDUCTIBLE CALCULÉE SUR LES REVENUS 2024, PAYÉE EN 2025** » ; « Le
> montant déductible est égal à **6,8 points** de CSG calculée (au taux de
> 9,2 %) » ; « La déduction s'opère sur les revenus de **l'année du paiement** de
> la CSG » ; « **Aucune CSG** calculée sur les revenus du patrimoine n'est
> déductible lorsque ces revenus ont été imposés à l'impôt sur le revenu **à un
> taux forfaitaire** » ; « rayez le montant préimprimé et inscrivez ligne **6DE**
> le montant exact de CSG déductible » ; exemple chiffré « 736 € (8 000 € ×
> 9,2 %). La CSG déductible s'élève à 544 € (8 000 € × **6,8 %**) » ;
> puis le second calendrier : « **CSG DÉDUCTIBLE CALCULÉE SUR LES REVENUS 2025,
> PAYÉE EN 2025** … Le montant de CSG déductible est égal à **6,8 % des revenus
> déclarés ligne 2BH** de la 2042 **si vous optez pour l'imposition au barème** et
> à **6,8 % des revenus déclarés ligne 2DF quelle que soit l'option** … Ce montant
> de CSG déductible **n'est pas inclus** dans le montant de CSG déductible
> préimprimé … **Vous ne devez pas le calculer vous-même ni l'indiquer ligne
> 6DE** en corrigeant le montant prérempli. Le montant de CSG déductible afférent
> aux revenus déclarés ligne 2BH et 2DF **sera calculé automatiquement** » ;
> enfin « **Un plafond s'applique** pour le calcul de la CSG déductible afférente
> aux plus-values … à hauteur du **rapport entre le montant de la plus-value
> soumise à l'impôt sur le revenu et le montant de la plus-value soumise à la
> CSG** ».

Portée : les **sept preuves** exigées par `analyserCharges` sont présentes dans le
document réel, et les deux calendriers du point 3 y sont distingués par la DGFiP
elle-même — exactement comme dans `csgDeductible6DE()`. La fraction déductible
reste **6,8 %** alors que la CSG passe à 10,6 % sur les revenus du patrimoine
(brochure nouveautés) : cohérent avec `CSG_DEDUCTIBLE = 0.068`, aucun changement
de moteur. **Limite** : le plafonnement afférent aux plus-values de titres avec
abattement n'est pas modélisé ; il est ajouté aux règles affichées comme « NON
modélisée ici, à lire sur l'avis d'imposition » (contrôlé par
`tests/test_fiscal_gardes_foyer.js`), et aucun montant n'est produit à ce titre.

**Libellés des cases** (brochure intégrale ir_2026, lue par extrait indexé le
15/10/2026) : « Revenus déjà soumis aux prélèvements sociaux avec CSG déductible
**si option barème** … **2BH** » ; « Autres revenus déjà soumis aux prélèvements
sociaux avec CSG déductible … **2DF** » ; « CSG déductible connue, calculée sur
les revenus du patrimoine — *Si ce montant est inexact, corrigez case **6DE*** ».
Ces libellés confirment la distinction opérée par le garde-fou : 2BH dépend de
l'option du foyer, 2DF non, 6DE ne sert qu'à corriger un préremplissage inexact.
Ils ne disent **rien** des produits détenus, des années de versement ni du
précompte réellement subi : ces éléments restent à saisir par le propriétaire
(case « partiel », jamais « établi »).

**Revenus 2023 et 2024 (RCM/CSG)** — état au 16/10/2026, après la mise à
millésime des lecteurs (§7.2) :

- **Chapitre « charges déductibles » (CSG, case 6DE) : repéré et autorisé pour les
  deux années.** `ir_2024/pdf_som/12-charges_ded_rev_219a230.pdf` (revenus 2023)
  porte « **CSG DÉDUCTIBLE CALCULÉE SUR LES REVENUS 2022, PAYÉE EN 2023** »,
  « Le montant déductible est égal à 6,8 points de CSG calculée (au taux de
  9,2 %) », « Vous ne devez pas le calculer vous-même ni l'indiquer ligne 6DE en
  corrigeant le montant prérempli. Le montant de CSG déductible afférent aux
  revenus déclarés ligne 2BH et 2DF sera calculé automatiquement ».
  `ir_2025/pdf_som/12-charges_ded_rev_215a226.pdf` (revenus 2024) porte
  « **… REVENUS 2023, PAYÉE EN 2024** » puis « **… REVENUS 2024, PAYÉE EN 2024** »,
  les 6,8 points au taux de 9,2 %, l'exemple 736 € (8 000 € × 9,2 %) → 544 €
  (8 000 € × 6,8 %) et la même interdiction de double compte en 6DE.
  L'ancre portante de `analyserCharges` est « REVENUS *N-1*, PAYEE EN *N* » : elle
  est vérifiée **verbatim** pour 2023 comme pour 2024, et les autres preuves ne
  portent pas sur l'année. La lecture est donc autorisée, **sous réserve** : 4 des
  7 preuves (2023) et 3 des 7 (2024) n'ont pas été relues dans l'extrait indexé,
  et le lecteur exige les 7 — un document incomplet renvoie la liste de ce qui
  manque et ne produit aucune valeur.
- **Chapitre RCM : repéré pour 2023, non autorisé.**
  `ir_2024/pdf_som/08-RCM_123a137.pdf` date bien ses règles des revenus 2023 —
  « Inscrivez ligne 2BH le montant des revenus **perçus en 2023** … (case 2OP
  cochée) », « **N'indiquez pas** cette fraction de CSG déductible ligne 6DE »,
  « ligne 2DF … retenu pour le calcul du montant de CSG à déduire du revenu global
  de **l'année 2023** », « Le montant des revenus indiqué ligne 2BH est exclu de la
  base de calcul des prélèvements sociaux ». Mais la formulation de ce millésime
  diffère de celle d'ir_2026 sur laquelle les huit ancres ont été écrites
  (notamment « prélèvements sociaux ont déjà été prélevés en *N* » et l'en-tête
  « 2042 K … perçus en *N* ») : la lecture est **refusée sans appel réseau**, avec
  l'adresse nommée et la liste de ce qui devrait être vérifié pour l'autoriser.
- **Chapitre RCM des revenus 2024 : non repéré** (référence du fichier ir_2025 non
  vérifiée). Aucune URL inventée ; le motif `ir_<N+1>/pdf_som/08-RCM_<référence>.pdf`
  est donné.

Les cases RCM de 2023 et 2024 restent donc « non disponible ». Les cases CSG de ces
deux années peuvent désormais passer à « partiel » — règles lues, déduction
personnelle du foyer toujours non établie — dès que le propriétaire déclenche la
collecte, et **jamais** par report depuis 2025 : la preuve doit porter
`revenus: 2023` ou `revenus: 2024`, ce que `evaluer` contrôle.

**Limite assumée** : ces vérifications distantes ne remplacent pas la collecte.
Elles sont consignées telles quelles, avec leur date et leur portée, dans
`VERIFICATIONS_DISTANTES` et affichées dans le bloc replié de la matrice, sans
jamais alimenter une valeur du moteur. La case ne devient « établi » dans
l'application qu'après lecture réussie, sur l'appareil, par le bouton annuel.

---

### 5.3 Valeurs historiques corrigées d'après le BOFiP — 16/10/2026

Les permaliens que `fiscal_dgfip_sources.js` construit pour chaque millésime
(`url('ir'|'decote'|'qf', annee)`) ont été relus le 16/10/2026, y compris dans leur
version « revenus 2022 » (publication du 26/06/2023). Barème 2022, barème 2023 et
plafond de quotient familial 2023 étaient **identiques** au code. **Six valeurs
embarquées divergeaient** de la source que l'application désigne elle-même : sur
décision du propriétaire, elles sont **remplacées par les valeurs officielles** dans
les deux moteurs (`fiscal.js` et `core/fiscal_bars.py`).

| Millésime | Catégorie | Avant correction | Officiel BOFiP, appliqué | Source (permalien, publication, fin) |
| --- | --- | --- | --- | --- |
| revenus 2022 | Décote | 846 € / 1 395 € ; seuils 1 870 € / 3 100 € | **833 € / 1 378 €** ; seuils **1 841 € / 3 045 €** | `2495-PGP…-20230626`, 26/06/2023, fin 18/06/2024 |
| revenus 2022 | Plafond QF général | 1 759 € (valeur 2023) | **1 678 €** | `2494-PGP…-20230626`, 26/06/2023, fin 18/06/2024 |
| revenus 2023 | Décote | 906 € / 1 493 € ; seuils 2 002 € / 3 300 € | **873 € / 1 444 €** ; seuils **1 929 € / 3 191 €** | `2495-PGP…-20240618`, 18/06/2024, fin 14/04/2025 |
| revenus 2024 | Barème IR | 11 520 / 29 370 / 83 984 / 180 648 € (= 2023 × 1,02) | **11 497 / 29 315 / 83 823 / 180 294 €** | `2491-PGP…-20250414`, 14/04/2025, fin 07/04/2026 |
| revenus 2024 | Décote | 924 € / 1 523 € ; seuils 2 042 € / 3 365 € | **889 € / 1 470 €** ; seuils **1 965 € / 3 249 €** | `2495-PGP…-20250414`, 14/04/2025, fin 07/04/2026 |
| revenus 2024 | Plafond QF général | 1 759 € (valeur 2023) | **1 791 €** | `2494-PGP…-20250414`, 14/04/2025, fin 07/04/2026 |

Passages probants (verbatim) :

> revenus 2022, décote — « Pour l'imposition des revenus de 2022, cette décote est
> accordée aux contribuables dont la cotisation d'impôt brut est inférieure à
> 1 841 € pour les contribuables célibataires, divorcés ou veufs et à 3 045 € pour
> les contribuables soumis à imposition commune (soit respectivement 1/45,25 % de
> 833 € et 1/45,25 % de 1 378 €) ».
>
> revenus 2022, quotient familial — « Son montant est fixé à **1 678 €** par
> demi-part supplémentaire à compter de l'imposition des revenus de l'année 2022 » ;
> « (1 678 € x 7) + 1 673 €, soit 13 419 € ».
>
> revenus 2023, décote — « Pour l'imposition des revenus de 2023, cette décote est
> accordée aux contribuables dont la cotisation d'impôt brut est inférieure à
> 1 929 € … et à 3 191 € … (soit respectivement 1/45,25 % de 873 € et 1/45,25 % de
> 1 444 €) » (loi n° 2023-1322 du 29 décembre 2023 de finances pour 2024, art. 2).
>
> revenus 2024, barème — « Le barème pour l'imposition des revenus de l'année 2024
> est présenté dans le tableau suivant : N'excédant pas 11 497 € 0 % ; Supérieure à
> 11 497 € et inférieure ou égale à 29 315 € 11 % ; … 83 823 € 30 % ; … 180 294 €
> 41 % ; Supérieure à 180 294 € 45 % », l'article 2 de la loi n° 2025-127 du
> 14 février 2025 indexant les tranches « sur l'évolution de l'IPC hors tabac de
> 2024 par rapport à 2023, soit **1,8 %** ».
>
> revenus 2024, décote — « … inférieure à 1 965 € … et à 3 249 € … (soit
> respectivement 1/45,25 % de 889 € et 1/45,25 % de 1 470 €) ».
>
> revenus 2024, quotient familial — « Son montant est fixé à **1 791 €** par
> demi-part supplémentaire à compter de l'imposition des revenus de l'année 2024 » ;
> « On retranche l'avantage maximum en impôt procuré par les 6 demi-parts
> supplémentaires soumises au plafonnement … soit 1 791 € x 6 = 10 746 € ».

Lecture de l'écart : les seuils 2024 embarqués valaient les seuils 2023 multipliés
par **1,02**, alors que l'indexation officielle des revenus 2024 est de **1,8 %** ;
les décotes 2022, 2023 et 2024 embarquées étaient chacune supérieures à l'officielle
(et leurs seuils, cohérents avec elles : seuil = base / 45,25 %, donc pas une
coquille mais des valeurs d'une autre provenance) ; les plafonds de quotient
familial 2022 et 2024 étaient la valeur **2023** reconduite.

**Effet chiffré de la correction** (célibataire, impôt brut de 1 000 €) : la décote
2024 passe de 471,50 € à **436,50 €** (–35 €), la décote 2023 de 453,50 € à
**420,50 €** (–33 €), la décote 2022 de 393,50 € à **380,50 €** (–13 €). Les seuils
du barème 2024 sont abaissés de 23 € (première tranche) à 354 € (dernière). Le
plafond de quotient familial passe de 1 759 € à **1 791 €** par demi-part pour 2024
et de 1 759 € à **1 678 €** pour 2022.

**Ce qui a été fait**

- les six valeurs corrigées dans `BAREMES` et `PLAFOND_QF_GENERAL` (`fiscal.js`) et
  dans `BAREMES` et `PLAFOND_QF_GENERAL_PAR_ANNEE` (`core/fiscal_bars.py`) ;
- la provenance affichée par millésime (`SOURCE_PAR_ANNEE` / `source_de`) nomme
  désormais le BOFiP et la date du 16/10/2026 au lieu de « Constantes embarquées
  historiques non vérifiées » ;
- le journal `PF.fiscalCouverture.CORRECTIONS_OFFICIELLES` conserve, pour chaque
  correction : identifiant, catégorie, millésime, permalien, dates de publication et
  de fin de publication, référence de la loi (ou l'aveu qu'elle n'a pas été relue),
  passage verbatim citant l'année des revenus, valeur officielle, valeur **avant**
  correction, écart, effet, arbitrage, `corrigee` et `corrigeLe` ;
- la matrice affiche la correction tant que le millésime n'est pas collecté :
  « valeur embarquée corrigée le 16/10/2026 d'après le BOFiP — … ; **correction ≠
  collecte** : la case passe à « établi » à la collecte du millésime » ;
- tests : `tests/test_fiscal_corrections_officielles.js` (journal, valeurs du
  moteur, notes de la matrice, collecte qui établit, R2 intacte) et
  `tests/test_valeurs_officielles_corrigees.py` (jumeau Python, cohérence de la
  décote, plafonds QF distincts, **parité JS ↔ Python** lue dans `fiscal.js`,
  calculs avec les valeurs officielles, revenus 2025 inchangés). Les suites qui
  figeaient les anciennes valeurs ont été mises à jour :
  `test_fiscal_activation_2025.js`, `test_fiscal_dgfip_activation.js`,
  `test_fiscal_maj_indicative.js`, `test_corrections_fiscales_2025.py`.

**Ce que la correction ne fait pas**

- elle n'établit aucune case : sans collecte du propriétaire, les cases de 2022 à
  2024 restent « non disponible » et `basculeComplete` reste `false` ;
- elle ne touche ni les revenus 2025 (R2 publiée et activée : 11 600 / 29 579 /
  84 577 / 181 917 €, décote 897 € / 1 483 €, plafond QF 1 807 €) ni les revenus
  2026 (provisoires, rien de publié) ;
- elle ne réécrit aucune donnée stockée : aucune migration n'est ajoutée, les
  lignes déjà enregistrées conservent leurs nombres, et toute simulation ou révision
  produite après ce changement utilise les valeurs officielles ;
- elle ne change ni les taux de prélèvements sociaux, ni les frais professionnels,
  ni les règles RCM/CSG, ni la franchise de 305 €.

## 6. Garde-fous transverses (rappel du cahier des charges)

- **Jamais de reconduction silencieuse** : la matrice refuse une preuve dont
  l'URL ou l'année ne correspond pas au millésime demandé (test : une aide de la
  déclaration 2025 ne remplit pas la colonne revenus 2025) ; une preuve de 2025
  passée pour 2026 ne remplit aucune case de 2026.
- **Jamais de collecte partielle présentée comme révision complète** :
  `couvertureDgfip(annee).complet` reste faux, `basculeComplete` reste faux, le
  résumé court se termine par « Bascule DGFiP totale : non ».
- **OpenFisca** : les anciennes collectes ne sont ni relues ni appliquées par la
  simulation mobile ; la matrice n'accepte aucune valeur OpenFisca comme preuve
  (test : après `synchroniserParametres(2026)`, `plafondQF(2026)` lève toujours
  « non disponible » — `tests/test_fiscal_parametres_partiels.js`).
- **R2 des revenus 2025** : prioritaire, non rejouée. Aucune migration 011/012,
  aucune insertion, aucun secret.
- **Séparation des données** : `perimetreDonnees()` distingue paramètres publics
  (documents DGFiP) et données personnelles (salaires, intérêts, précompte réel,
  montants 2BH/2DF/6DE, options du foyer, parts, PAS). Le PAS n'entre ni dans la
  matrice ni dans les caches publics.
- **Jumeau Python vérifié le 14/10/2026** : `core/fiscal_bars.py` porte les mêmes
  taux que le moteur JS — `PS_PAR_ANNEE` 0.172 jusqu'en 2024, 0.186 en 2025 et
  2026, `PS_PRECOMPTES_PAR_ANNEE` 0.172 jusqu'en 2025 et 0.186 en 2026. Aucune
  divergence à signaler. `jobs/importer_fiscal_existant.py` refuse toujours de
  rejouer l'import initial figé (il lève `RuntimeError` dès que
  `PS_PAR_ANNEE[2025] != 0.172`) : correction par nouvelle révision dédiée, jamais
  par relance.

---

## 7. Pérennité : ce qui se passe les années suivantes

L'objectif n'est pas seulement d'avoir les revenus 2023 à 2025, mais que chaque
millésime suivant tombe dans le même mécanisme, sans réécriture et sans valeur
devinée. Trois pièces y veillent.

### 7.1 Un inventaire unique des sources, `fiscal_sources_millesimes.js`

Une table décrit, pour chaque année de **revenus** (2023 → 2026) et chaque famille
de documents (11 familles : barème, décote et quotient familial au BOFiP ; aides du
simulateur pour les frais, les repas et les gains ; chapitres RCM, charges
déductibles et plus-values des brochures ; notice 2086 ; nouveautés), quatre faits :

| Champ | Rôle |
| --- | --- |
| `url` | l'adresse **vérifiée**, ou `null`. Jamais une adresse construite à la volée. |
| `verifieeLe` | la date de la vérification effectuée hors application. |
| `lectureVerifiee` | le lecteur sait-il reconnaître **ce** millésime (ancres et passages confirmés sur le document réel) ? |
| `constat` | ce qui a été lu, ou ce qui manque, en clair. |

`url(annee, famille)` ne renvoie une adresse que si elle est vérifiée **et** si la
lecture l'est pour cette année. Autrement dit : un document repéré mais non vérifié
ne déclenche rien. C'est le cas du chapitre RCM du millésime 2024
(`ir_2024/pdf_som/08-RCM_123a137.pdf`, revenus 2023) : quatre passages ont été
vérifiés, le jeu de huit preuves du lecteur ne l'a pas été — l'adresse est nommée,
la lecture est refusée, aucune valeur n'est produite.

Chaque famille reçoit un **état** :

| État | Sens | Effet |
| --- | --- | --- |
| `lisible-vérifiée` | adresse vérifiée **et** jeu de preuves confirmé sur le document réel | collecte autorisée |
| `lisible-sous-réserve` | adresse vérifiée, ancre portante (l'année des revenus) vérifiée verbatim, jeu de preuves **partiellement** relu | collecte autorisée ; le lecteur exige toutes ses preuves et renvoie la liste de ce qui manque sinon |
| `repérée-non-autorisée` | adresse vérifiée, mais formulation du millésime non confirmée (ou aucun lecteur dédié) | **aucun appel réseau**, adresse et motif affichés |
| `absente` | document non publié ou non repéré | **aucune URL inventée**, motif à chercher affiché |

État au 16/10/2026 : **revenus 2025 → 11/11** familles lisibles, toutes vérifiées ;
**revenus 2023 → 8/11** lisibles (6 vérifiées, 2 sous réserve : chapitre charges et
notice 2086) ; **revenus 2024 → 8/11** (idem) ; **revenus 2026 → 0/11** (rien de
publié). Une famille « sous réserve » ne produit une valeur que si le document réel
contient **toutes** les preuves exigées : la réserve porte sur ce que je n'ai pas pu
relire à distance, pas sur ce que l'application accepte.

### 7.2 Les lecteurs ne sont plus figés sur un millésime

`fiscal_rcm_pdf_sources.js` et `fiscal_crypto_pdf_sources.js` prenaient leurs URL
dans une constante unique (brochures ir_2026, notice 2086/2026) et répondaient
« millésime non pris en charge » pour toute autre année. Ils lisent maintenant
l'inventaire :

- les ancres de preuve sont construites avec l'année des revenus demandée, donc un
  document d'une autre année est refusé — le refus 2025 ↔ 2024 déjà testé continue
  de passer ;
- un millésime sans adresse vérifiée est refusé **sans appel réseau**, avec le motif
  à chercher (`ir_<N+1>/pdf_som/08-RCM_<référence>.pdf`,
  `formulaires/2086/<N+1>/2086_<numéro>.pdf`, `2495-PGP…-<AAAAMMJJ>`) : le motif
  dit où chercher, il ne prétend pas savoir ;
- la clé de cache porte le millésime, et l'ancienne clé (sans année) reste lue pour
  les revenus 2025 : le cache déjà constitué sur Android n'est pas perdu, et jamais
  reporté sur une autre année ;
- le comportement par défaut (revenus 2025) est inchangé, vérifié par les suites
  existantes.

Ajouter un millésime devient alors une **inscription dans l'inventaire** — adresse
vérifiée, date, jeu de preuves confirmé — et non une modification de moteur.

### 7.3 Le calendrier dit quand chercher, jamais quoi croire

`calendrier(annee)` donne, pour le millésime à venir, les fenêtres **observées** :
indexation BOFiP le 18/06/2024 pour les revenus 2023, le 14/04/2025 pour 2024, le
07/04/2026 pour 2025 — donc attente au printemps 2027 pour les revenus 2026 ;
brochure `ir_<N+1>` au printemps ; aides du simulateur `calcul_impot/<N+1>` à
l'ouverture de la déclaration ; notice 2086 du millésime correspondant. Ces dates
servent à savoir **quand** revenir chercher une preuve. Elles ne produisent ni URL,
ni valeur, ni statut « établi ».

### 7.4 Bug corrigé au passage : les preuves PDF collectées ne comptaient pas

La matrice attendait, pour les cases RCM, CSG et 2086, un objet de la forme
`{ etat, valeurs }` — celle d'une collecte fraîche. Or le cache renvoie les
**valeurs seules**. Conséquence : un propriétaire ayant lu les cinq PDF avec succès
(cinq lecteurs confirmés sur Android) voyait quand même « aucun document de ce
millésime lu » et les cases RCM / CSG déductible / 2086-foyer restaient
« non disponible ».

`evaluer` accepte désormais les deux formes via `valeursPdf(preuve, annee)`, avec
deux conditions cumulatives : l'objet porte des valeurs, **et** ces valeurs sont
celles du millésime demandé (`valeur.revenus === annee`). Un échec de lecture
(`{ etat: 'PDF non disponible…' }`, `{ etat: '… preuves incomplètes (six8)' }`)
n'établit rien, et une preuve des revenus 2025 n'établit jamais une case de 2023.
`preuvesParAnnee(annee)` lit les quatre caches PDF **par millésime** et expose les
URL de ce millésime (`urlSource`), jamais celles d'une autre année.

### 7.5 Ce que cela ne change pas

Aucune constante du moteur, aucune migration, aucune donnée personnelle, aucune
version d'APK. Un inventaire de sources n'établit rien par lui-même : sans collecte
du propriétaire, les 52 cases restent « non disponible », `basculeComplete` reste
`false`, et les corrections du §5.3 restent affichées comme corrections : une valeur
officielle appliquée au code n'est pas une preuve lue par l'application.

### 7.6 Revenus 2027, 2028, 2029 : ce qui se passe quand vous cliquez

Question du propriétaire le 16/10/2026 : « pour 2027, 2028, 2029, etc., j'aurai bien
les données en cliquant sur le bouton ? » Réponse vérifiée dans le code et démontrée
par `tests/test_fiscal_millesime_futur.js` (printemps 2028 simulé, revenus 2027
fictifs : barème 11 700 / 29 800 / 85 200 / 183 300 €, décote 905 € / 1 496 €,
plafond QF 1 823 € — ces nombres prouvent le chemin, ils n'annoncent rien).

**Six familles se collectent sans aucune modification de code** :

| Famille | Adresse demandée | Garde qui empêche d'inventer |
| --- | --- | --- |
| Barème IR | `bofip.impots.gouv.fr/doctrine/BOI-IR-LIQ-20-10` (version en vigueur) | « Le barème pour l'imposition des revenus de l'année **2027** » + `Identifiant juridique` + tableau à 4 seuils croissants |
| Décote | `…/doctrine/BOI-IR-LIQ-20-20-30` | « Pour l'imposition des revenus de **2027**, cette décote … » + seuil = base / 45,25 % |
| Plafond QF | `…/doctrine/BOI-IR-LIQ-20-20-20` | « … à compter de l'imposition des revenus de l'année **2027** » |
| Frais km et abattement 10 % | `simulateur-ir-ifi.impots.gouv.fr/calcul_impot/**2028**/aides/frais.htm` | « Pour les revenus perçus en **2027** », « Tarif : automobiles », seuils 5 000 et 20 000 km, majoration de 20 % des électriques, cinq lignes de barème |
| Forfait repas | `impots.gouv.fr/particulier/frais-de-repas` | « Pour l'imposition des revenus **2027**, la valeur d'un repas pris au foyer est de … » |
| PS des plus-values de titres | `…/calcul_impot/**2028**/aides/gains.htm` | « Si, en **2027**, vous ou les membres de votre foyer fiscal avez vendu des valeurs mobilières … » + PFU, case 2OP, titres antérieurs au 01/01/2018 |

L'adresse courte `/doctrine/<identifiant>` a été vérifiée le 16/10/2026 : elle
redirige, sur le même hôte, vers le permalien verrouillé de la version en vigueur
(`/bofip/2491-PGP.html/identifiant=BOI-IR-LIQ-20-10-20260407`). C'est la seule
famille de liens que le pont Android résout (`NativeBridge.java` : redirections
désactivées, puis résolution explicite de
`https://bofip.impots.gouv.fr/doctrine/BOI-IR-LIQ-20-` vers
`/bofip/(2491|2494|2495)-PGP.html/identifiant=BOI-IR-LIQ-20-.*`). À partir des
revenus 2026, le lecteur exige en plus la ligne « Date de début de publication du
BOI : JJ/MM/AAAA » et **déduit** de cette date le permalien verrouillé qu'il
conserve : aucune date de version n'est codée en dur pour un millésime futur.

**Cinq verrous ont sauté ce round** — sans eux, le clic de 2028 n'aurait rien donné :

1. les caches n'étaient relus que pour les années embarquées (`annees()`, soit les
   clés de `BAREMES`) : un millésime collecté en 2028 n'aurait jamais été chargé.
   La borne est glissante (`annéesCachables()` : 2023 → année courante) ;
2. `baremeDe(2027)` refusait « Aucun barème enregistré » **avant** de regarder la
   collecte. À partir des revenus 2026, un millésime complet — barème, décote,
   plafond QF et frais salariés — est calculable sans aucune constante embarquée
   (`millésimeComplet`, `annéeSimulable`, `annéesSimulables`) ;
3. mêmes verrous sur `abattement10` et `fraisKilometriques` : les plancher, plafond
   et barème kilométrique **collectés** ouvrent désormais le millésime ;
4. le bouton « tout vérifier » parcourait `[2023, 2024, 2025, 2026]` écrit en dur et
   l'écran affichait « Vérifier les revenus 2023 à 2026 » : la plage
   (`plageCollecte()`) et les trois libellés (`libelléPlage()`) sont construits et
   s'étendent seuls au 1er janvier ;
5. `verifierMaj` comparait l'année civile au dernier millésime connu et nommait
   **2028** alors que le millésime visé est 2027 : la garde porte désormais sur le
   millésime demandé.

**Cinq familles exigent toujours une inscription dans l'inventaire** :
`brochure_rcm`, `brochure_charges`, `brochure_plus_values`, `notice_2086`,
`nouveautes`. Leur nom de fichier change chaque millésime (`08-RCM_121a136.pdf`,
`12-charges_ded_rev_225a236.pdf`, `2086_5515.pdf`) et ne se devine pas. Sans adresse
vérifiée, le lecteur **refuse sans appel réseau** et dit quoi chercher :
`horizon(2027).aInscrire` liste ces cinq familles, chaque famille porte son `motif`
de construction, et `calendrier(2027)` donne les fenêtres attendues (BOFiP au
printemps 2028, brochure `ir_2028`, aides `calcul_impot/2028`, notice 2086 du
millésime 2028). C'est une inscription de données dans `fiscal_sources_millesimes.js`,
pas une modification de moteur ni de lecteur — et les comptes de l'inventaire
(`millésimes()` = 2023 à 2026) ne bougent pas.

**Ce qui ne change pas** : sans publication, le clic renvoie « année des revenus 2027
absente ou texte illisible » et la simulation reste suspendue ; une collecte
partielle (BOFiP sans frais salariés) n'ouvre rien ; les taux de PS des revenus
mobiliers (RCM) d'un millésime futur ne se déduisent pas de l'aide « gains » — sans
révision publiée, `tauxPSRevenuMobilier(2027, …)` refuse ; aucune valeur d'une autre
année n'est recopiée ; `basculeComplete` reste `false` tant que les 52 cases ne sont
pas établies.

### 7.7 Ce qui s'écrit dans Supabase — et ce qui ne s'écrit pas

**Constat avant ce tour** : rien. Les cinq lecteurs DGFiP n'écrivaient que dans le
`localStorage` de l'appareil. La table `pf2_fiscal_collectes` (migration 009, puis
012) n'autorisait que les deux sources OpenFisca et leurs deux adresses exactes :
une ligne DGFiP y était **refusée par le schéma**. Et `pf2_fiscal_annees`
(migrations 010 et 011) n'est accessible à l'APK qu'en **lecture** — les lignes
R2 des revenus 2025 ont été écrites par les robots côté serveur. Une réinstallation
de l'application, ou un changement d'appareil, faisait donc perdre toute preuve
collectée.

**Migration `013_collectes_dgfip.sql`** (à exécuter dans Supabase SQL Editor APRÈS
012, une seule fois, après sauvegarde chiffrée récente restaurée et comparée) :

- les **onze sources DGFiP** réellement lues par l'application sont autorisées
  (trois familles BOFiP, frais salariés et forfait repas, PS/PFU des plus-values de
  titres, notice 2086, trois chapitres de brochure, chapitre nouveautés) ;
- chaque source n'est acceptée qu'avec **son adresse officielle** : hôte DGFiP
  exact en `https`, chemin imposé, permalien BOFiP verrouillé sur la version lue
  (`…/bofip/<n>-PGP.html/identifiant=BOI-IR-LIQ-20-…-<8 chiffres>`) ou adresse
  courte de la version en vigueur (`…/doctrine/BOI-IR-LIQ-20-…`). Une adresse d'un
  autre hôte, un chemin inventé, un permalien non daté : **refusés** ;
- les sources OpenFisca historiques restent autorisées : aucune ligne existante ne
  devient orpheline ;
- **aucun droit n'est élargi** : la table reste append-only pour les clients
  (`select`, `insert`), chaque compte ne lit et n'écrit que ses propres lignes
  (`auth.uid() = user_id`), `anon` n'a toujours rien ;
- script **rejouable** : il ne supprime ni ne modifie aucune ligne.

**Module `fiscal_historique_supabase.js` (`PF.fiscalHistorique`)**, appelé par le
bouton de collecte après le rechargement des caches, un millésime après l'autre :

| | |
| --- | --- |
| **Ce qui s'écrit** | une ligne par document **réellement lu** du millésime demandé : `annee_revenus`, `source`, `valeurs` (paramètres publics + référence du document : adresse lue, année des revenus, libellé, date de publication pour le BOFiP), `source_url`, `revision` |
| **Ce qui ne s'écrit pas** | aucune **donnée personnelle** (aucun montant du foyer, aucun taux de prélèvement à la source, aucune ligne de déclaration) ; aucune valeur d'**une autre année** (garde `revenus === annee`) ; aucun **état d'échec** pris pour une preuve ; aucune **adresse devinée** (une ligne sans adresse lue n'est pas proposée) ; et **jamais `pf2_fiscal_annees`** — l'APK ne publie aucune règle, la R2 reste écrite par `service_role` |
| **Append-only** | collecte identique ⇒ aucune écriture (« inchangée ») ; rectification du même millésime ⇒ **révision N+1**, la révision 1 reste présente |
| **Best effort** | pont Supabase absent ou incomplet, historique illisible, contrainte qui refuse la ligne ⇒ **aucune exception** remontée, un état et un motif affichés (le motif nomme la migration 013), et la collecte locale reste valable |

Une ligne historisée **n'active rien** : le moteur ne relit jamais cette table, il
n'utilise que le cache local revérifié à chaque ouverture. L'historisation sert à
conserver la preuve d'un document lu au-delà de l'appareil, pas à publier un
paramètre.

**À l'écran** : le résumé copiable porte une clause courte sans adresse
(« Supabase : 11 document(s) historisé(s). », « Supabase : déjà historisé à
l'identique. », ou « Supabase : NON historisé, collecte conservée sur l'appareil. »)
et le bilan détaillé reprend le motif complet. Le résumé reste sous 600 caractères
(399 au pire cas mesuré).

**Vérifiable par le propriétaire, sans rien écrire** :
[`docs/VERIFIER-HISTORIQUE-COLLECTES-DGFIP.sql`](VERIFIER-HISTORIQUE-COLLECTES-DGFIP.sql)
est un `select` unique à coller dans Supabase SQL Editor. Il répond par des faits —
013 appliquée ou non, onze sources autorisées ou zéro, nombre de collectes DGFiP
déjà historisées et sur quels millésimes — et contrôle en même temps que les droits
de l'APK n'ont pas bougé (écriture + lecture sur l'historique, **lecture seule** sur
les règles publiées, RLS sur les deux tables) et qu'aucune clé personnelle n'est
stockée. Aucune donnée personnelle n'est affichée.

**Validé** : `tests/test_fiscal_sql_dgfip.py` rejoue 009 → 010 → 011 → 012 → 013
sur un PostgreSQL embarqué (les onze sources acceptées avec leurs adresses réelles,
dix adresses inventées ou d'un autre hôte refusées, UPDATE/DELETE refusés, isolation
entre comptes, `pf2_fiscal_annees` toujours fermée à l'APK, migration rejouable) ;
`tests/test_fiscal_historique_supabase.js` vérifie hors réseau la **parité** entre
les lignes produites par le module et les contraintes lues dans le fichier SQL de la
013 — sans cette parité, le module écrirait des lignes que la base refuserait en
silence.

## 8. Tests

Hors réseau, exécutés par la CI (`node tests/test_*.js`) :

| Fichier | Couvre |
| --- | --- |
| `tests/test_fiscal_matrice_couverture.js` | statuts par millésime et catégorie, refus de reconduction, recoupement distinct d'un texte explicite, contradictions (dont les trois termes de `ps_titres_2025`), liste et portée des vérifications distantes consignées, bascule jamais déclarée totale — **et les deux formes de preuve PDF** : valeurs nues du cache et `{ etat, valeurs }` d'une collecte établissent les cases RCM/CSG/2086 (non-régression du bug §7.4), preuve d'une autre année refusée, état sans valeurs (échec de lecture, preuves incomplètes) refusé |
| `tests/test_fiscal_crypto_ps_recoupement.js` | lecture du BOFiP (date de version, qualification, taux), huit maillons, refus par millésime et par maillon manquant, corroboration et contradiction de la FAQ, caches par compte/document/millésime, rectifications conservées, cache altéré refusé |
| `tests/test_fiscal_gardes_foyer.js` | CSG 6DE sans double compte (2BH/2DF automatiques), portée de la 2086 au niveau du foyer, cas particuliers du QF, séparation public/personnel |
| `tests/test_fiscal_matrice_integration.js` | **non-régression** : aucun chiffre du moteur modifié, R2 non remplacée, 2025 non reconduit sur 2026, matrice et contradictions affichées, résumé court inchangé |
| `tests/test_fiscal_regimes_millesimes_reels.js` | libellés **réels** des aides gains.htm des revenus 2023 (lus le 14/10/2026) et 2024 (lus le 15/10/2026) : 17,2 %/30 % acceptés chacun pour sa seule année, variantes typographiques tolérées, refus croisés (2023↔2024, et vers 2025), refus sans attribution d'année, refus conservateur si une balise coupe l'année, collecte simulée → cases « établi » uniquement pour 2023 et 2024, page d'une autre année enregistrée sans valeur, cohérence avec `VERIFICATIONS_DISTANTES` |
| `tests/test_fiscal_millesime_futur.js` | **millésime futur de bout en bout** (printemps 2028 simulé, revenus 2027 fictifs) : avant collecte, refus explicite (« Revenus 2027 : barème, décote ou plafond QF DGFiP non disponible »), millésime absent de l'écran, aucune constante ajoutée (`annees()` reste 2022-2026), plage du bouton déjà étendue à 2023-2027 et libellé construit (plus aucun « 2023 à 2026 » en dur) ; collecte des trois documents BOFiP **par l'adresse courte `/doctrine/`**, avec le permalien verrouillé et la date de publication **déduits** de la page lue (11/04/2028), plus frais salariés et PS des titres ; après collecte, `baremeDe`, `plafondQF`, `tauxPS`, `forfaitRepas`, `abattement10` (plancher 520 €, plafond 14 900 €) et `fraisKilometriques` calculent les revenus 2027 sans constante embarquée, la puce 2027 apparaît, `verifierMaj` ne dit plus « absents », `revisionPubliee` reste `false` ; collecte partielle (BOFiP seul, aides du simulateur absentes) → millésime incomplet, `baremeDe` refuse, l'écran dit « calcul fiscal indisponible » ; non-régressions : revenus 2026 toujours suspendus sans collecte, R2 2025 intacte (11 600 / 29 579 / 84 577 / 181 917 €, décote 897 €, QF 1 807 €), valeurs officielles 2024 conservées (11 497 €, QF 1 791 €) ; inventaire : `horizon(2027)` = 6 familles automatiques et 5 familles PDF à inscrire, `toutes(2027)` = 11 familles absentes, aucune URL inventée, comptes de l'inventaire inchangés |
| `tests/test_fiscal_corrections_officielles.js` | **journal des corrections du 16/10/2026** : 6 entrées (décote et plafond QF 2022, décote 2023, barème, décote et plafond QF 2024), chacune avec son permalien identique à `fiscal_dgfip_sources.url()`, ses dates de publication et de fin, la loi (ou l'aveu qu'elle n'a pas été relue), le passage verbatim citant l'année des revenus, la valeur officielle, la valeur **avant** correction, l'écart, l'effet et l'arbitrage ; le moteur porte désormais les valeurs officielles ; cohérence interne des décotes (seuil = base / 45,25 %) ; chaque millésime garde ses propres seuils (10 777 / 11 294 / 11 497 / 11 600) et son propre plafond QF (1 678 / 1 759 / 1 791 / 1 807) ; **correction ≠ collecte** : cases 2023/2024 toujours « non disponible » sans collecte, avec la mention « corrigée le 16/10/2026 » et « correction ≠ collecte », aucune alerte de divergence subsistante, cases 2023 barème et QF sans mention (déjà conformes) ; après collecte du millésime 2024 les trois cases passent « établi » et la mention laisse place à la preuve lue ; collecte 2024 sans effet sur 2023 ; non-régression R2 2025 (tranches, décote 897/1 483, plafond QF 1 807, `tauxPS` 18,6 %, `tauxPFU` 31,4 %, comparaison 2OP/PFU stable) et bascule totale toujours `false` |
| `tests/test_valeurs_officielles_corrigees.py` | **jumeau Python** : barèmes et décotes officiels 2022-2024, plafonds QF 1 678/1 759/1 791/1 807, valeurs d'avant correction absentes, provenance affichée (« BOFiP », « 16/10/2026 », plus de « non vérifiées ») ; **parité JS ↔ Python** lue directement dans `fiscal.js` (tranches, décotes, plafond QF, 2026 provisoire des deux côtés) ; calculs avec les valeurs officielles (décote 2024 = 436,50 € pour 1 000 € d'impôt brut, écart de 35 € avec l'ancienne valeur, revenu sous la première tranche sans impôt, plafonnement QF 2024 = 2 × 1 791 €) ; millésimes non reconduits ; refus de 2027 ; revenus 2025 inchangés |
| `tests/test_fiscal_crypto_pdf_sources.js` | notice 2086 et chapitre plus-values : preuves indépendantes, millésime exact, rectifications, non-activation — **étendu à la pérennité** : notices 16043\*05 (revenus 2023) et 16043\*06 (revenus 2024) repérées dans les brochures, ancres paramétrées par année de cessions (un texte 2024 lu pour 2024, jamais par défaut ni pour 2023), collecte 2024 réussie **sans modifier le lecteur**, chapitre plus-values ir_2025 non repéré → refus sans URL inventée, revenus 2026 → aucun appel réseau, caches isolés par millésime, ancienne clé sans millésime toujours lue pour 2025 et jamais reportée, `psCrypto2025Attestes` et `annexeFoyerComplete` toujours `false` |
| `tests/test_fiscal_sources_millesimes.js` | **inventaire pérenne des sources** : 11 familles × 4 millésimes, année de revenus ≠ année de déclaration, dates de publication BOFiP distinctes ; chaque entrée porte une date de vérification et un constat écrit ; aucune URL hors des trois hôtes DGFiP, aucune URL à joker, `null` partout pour les revenus 2026, `source(2022)`/`source(2027)` hors inventaire ; un document **repéré** mais dont le jeu de preuves n'est pas vérifié (chapitre RCM ir_2024) ne donne aucune URL lisible ; inventaire 11/11 en 2025, 6/11 en 2023 et 2024, 0/11 en 2026 ; **cohérence obligatoire** avec les URL que construisent réellement `fiscal_dgfip_sources.url()`, `fiscal_frais_sources.KM()/repasUrl()`, `fiscal_regimes_sources.url()`, `fiscal_rcm_pdf_sources.urls`/`urlPour()` et `fiscal_crypto_pdf_sources.urls`/`urlPour()` ;
        quatre états (`lisible-vérifiée`, `lisible-sous-réserve`, `repérée-non-autorisée`, `absente`) avec
        autorisation ≠ vérification (les réserves écrites, le nombre de preuves exigées nommé) ; toute famille dont le constat porte une correction du 16/10/2026 a son entrée dans `CORRECTIONS_OFFICIELLES` (6 au total, dont 2 pour le millésime 2022 hors matrice mais pas hors moteur) ; calendrier du millésime à venir (fenêtres observées, jamais une valeur devinée) ; et non-régression : un inventaire n'établit rien par lui-même (`etablis` = 0, bascule `false`) |
| `tests/test_fiscal_rcm_pdf_sources.js` | textes réels des brochures revenus 2025, transport PDF simulé, cache, rectifications, non-activation — **étendu à la pérennité** : URL par millésime prises dans l'inventaire, comportement 2025 inchangé, refus 2023 (document repéré, preuves non vérifiées) / 2024 et 2026 (non repérés) **sans aucun appel réseau** et sans valeur produite, motif à vérifier fourni, ancres paramétrées par année (un texte 2023 n'est lu que pour 2023, jamais pour 2024 ni par défaut), ancienne clé de cache sans millésime toujours lue pour 2025 et jamais reportée sur une autre année ; **de bout en
        en** : chapitres charges des revenus 2023 (`12-charges_ded_rev_219a230.pdf`) et 2024
        (`12-charges_ded_rev_215a226.pdf`) collectés → cases CSG « partiel » avec l'URL et l'année d'effet de leur
        millésime, exclusions « CSG patrimoine 2022 payée en 2023 » / « 2023 payée en 2024 », cases RCM 2023/2024
        toujours « non disponible », revenus 2026 « non disponible », bascule totale `false` |
| `tests/test_fiscal_historique_supabase.js` | **historisation Supabase des collectes DGFiP** (hors réseau, pont bouchonné) : les onze familles du module sont exactement les onze sources `dgfip_*` autorisées par la migration 013 et les deux sources OpenFisca restent permises ; une collecte complète des revenus 2025 produit onze lignes, chacune avec son millésime, son adresse lue, la référence du document et la date de publication BOFiP ; **parité avec le SQL** — chaque `source` produite est autorisée par la contrainte et chaque `source_url` satisfait l'expression lue dans `013_collectes_dgfip.sql` (sinon la base refuserait en silence) ; seuls les documents réellement lus sont proposés (famille absente, adresse absente, cache PDF d'une **autre année**, état d'échec « PDF inaccessible » ⇒ aucune ligne), rien avant 2023 ; aucune clé personnelle dans `valeurs`, une ligne ne porte que `annee_revenus, source, source_url, valeurs` avant insertion, et **`pf2_fiscal_annees` n'apparaît dans aucun appel** ; append-only : collecte identique ⇒ zéro écriture, rectification de la décote ⇒ révision 2 pour cette seule famille, la révision 1 intacte ; best effort : pont absent, pont incomplet, `select` nul ou en échec, contrainte qui refuse (motif nommant la migration 013), rien à historiser ⇒ aucun exception, aucune écriture ; revenus **2027** historisés comme 2025 et aucun millésime énuméré dans le code exécutable (seule la borne 2023) ; lignes d'état courtes et sans adresse ; module chargé par `index.html` dans le bon ordre et appelé par le bouton, échec non bloquant, état effacé au changement de compte |
| `tests/test_fiscal_sql_dgfip.py` | **migration 013 sur PostgreSQL embarqué** (pgserver, aucun projet Supabase réel) : avant 013 une source DGFiP est refusée (c'est le constat qui motive la migration) ; après 013 les onze sources sont acceptées avec leurs adresses officielles, la source OpenFisca historique aussi, et la migration est rejouable ; dix adresses refusées (hôte tiers, `http`, permalien non daté, `gains.htm` pour la famille frais, arborescence de brochure inventée, extension `.htm`, notice 2086 sans numéro) ainsi que deux sources hors liste ; **append-only** : révision 2 acceptée, UPDATE et DELETE refusés (42501), la révision 1 jamais écrasée ; **RLS non élargie** : le compte B ne lit aucune ligne de A, ne peut pas écrire au nom de A, `anon` n'a toujours aucun droit ; `pf2_fiscal_annees` reste fermée à l'APK et ouverte à l'écriture serveur |
| `tests/test_verifier_collectes_dgfip.py` | **la sonde remise au propriétaire est sûre et juste** (PostgreSQL embarqué) : un seul `select`, aucun mot-clé d'écriture ne survit à la suppression des commentaires et des littéraux, `user_id` jamais projeté ; avant 013 elle dit NON et nomme le fichier à exécuter, compte 0 source DGFiP et 2 sources OpenFisca ; après 013 elle dit OUI et compte 11 sur 11 ; les droits annoncés sont les vrais (INSERT+SELECT sur l'historique, SELECT seul sur les règles publiées, 2 tables sous RLS) ; une collecte réellement écrite par l'APK sous RLS fait bouger le compteur et le millésime ; aucune donnée personnelle ne sort (ni uid, ni adresse, ni valeur de barème) ; et la liste de sources de la sonde est **identique** à celle de la contrainte de la 013 |
| `tests/test_fiscal_frais_millesimes_reels.js` | **recoupement du moteur par les sources officielles** des revenus 2023 (aide frais.htm lue le 15/10/2026) et 2024 (lue par indexation) : plancher 495 €/plafond 14 171 € et forfait repas 5,20 € pour 2023, plancher 504 €/plafond 14 426 € et barème 3-4 CV pour 2024, barème km 3 à 7 CV sur ses trois tranches et ses deux seuils, majoration électrique 20 % ; forfait repas 2024 et tranches 5 à 7 CV 2024 explicitement **non recoupés** ; refus pour 2026 (`null`, « non disponible ») et 2027 ; preuve d'un millésime sans effet sur les autres ; famille `frais` des vérifications distantes et limites de lecture 2024 |

Les suites déjà livrées (`test_fiscal_activation_2025.js`,
`test_fiscal_crypto_sources.js`, `test_fiscal_regimes_activation.js`,
`test_fiscal_parametres_partiels.js`, etc.) continuent de passer sans
modification : les 51 suites JavaScript sont vertes en local, et 977 tests Python
(les tests SQL et RLS, auparavant sautés faute de PostgreSQL local, s'exécutent
désormais aussi en local).

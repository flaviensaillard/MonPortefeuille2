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

| Catégorie | Revenus 2023 | Revenus 2024 | Revenus 2025 | Revenus 2026 |
| --- | --- | --- | --- | --- |
| Barème IR | établiable (BOFiP 18/06/2024) | établiable (BOFiP 14/04/2025) | **établi** (BOFiP 07/04/2026) | non disponible |
| Décote | établiable | établiable | **établi** | non disponible |
| Plafond QF général | établiable | établiable | **établi** | non disponible |
| Plafonds QF particuliers | non disponible | non disponible | non disponible | non disponible |
| Abattement salariés 10 % | établiable (aide du millésime 2024 relue le 15/10/2026 : 495 € / 14 171 €, identique au code) | établiable (sonde en échec le 15/10/2026) | **établi** | non disponible |
| Forfait repas | établiable (même aide : 5,20 € par repas, identique au code) | établiable (sonde en échec le 15/10/2026) | **établi** | non disponible |
| Barème kilométrique | établiable (même aide : barème 3 à 7 CV et majoration électrique 20 % identiques au code) | établiable (sonde en échec le 15/10/2026) | **établi** | non disponible |
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
`tests/test_fiscal_frais_revenus_2023_reel.js` :

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

**Revenus 2024 — frais professionnels** : la sonde du 15/10/2026 sur
`https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/2025/aides/frais.htm`
n'a **pas abouti** (échec d'accès distant, et non absence de publication).
Aucune valeur des revenus 2024 n'est donc relue : les trois cases frais de 2024
restent « établiables » et ne deviennent « établi » qu'après lecture réussie par
le bouton. Rien n'est déduit de l'échec, et aucune valeur de 2023 n'est reportée.

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

**Revenus 2023 et 2024 (RCM/CSG)** : la brochure du millésime ir_2024
(`…/brochure/ir_2024/pdf_som/08-RCM_123a137.pdf`) date bien ses règles des
revenus 2023 — « Inscrivez ligne 2BH le montant des revenus **perçus en 2023** …
(case 2OP cochée) », « **N'indiquez pas** cette fraction de CSG déductible ligne
6DE », « ligne 2DF … retenu pour le calcul du montant de CSG à déduire du revenu
global de **l'année 2023** ». Mais `DOCS.rcm` et `DOCS.charges` sont **figés sur
le millésime ir_2026** et `analyserCharges` exige la mention littérale
« REVENUS 2024, PAYEE EN 2025 » : l'application ne peut donc pas établir ces
règles pour 2023 ni 2024, et **ne les reporte pas** depuis 2025. Les cases RCM et
CSG de ces deux années restent « non disponible » ; le millésime ir_2025 n'a pas
été sondé. Rendre ces lecteurs millésimés exigerait, pour chaque année, la
brochure correspondante et ses preuves propres — pas une transposition.

**Limite assumée** : ces vérifications distantes ne remplacent pas la collecte.
Elles sont consignées telles quelles, avec leur date et leur portée, dans
`VERIFICATIONS_DISTANTES` et affichées dans le bloc replié de la matrice, sans
jamais alimenter une valeur du moteur. La case ne devient « établi » dans
l'application qu'après lecture réussie, sur l'appareil, par le bouton annuel.

---

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

## 7. Tests

Hors réseau, exécutés par la CI (`node tests/test_*.js`) :

| Fichier | Couvre |
| --- | --- |
| `tests/test_fiscal_matrice_couverture.js` | statuts par millésime et catégorie, refus de reconduction, recoupement distinct d'un texte explicite, contradictions (dont les trois termes de `ps_titres_2025`), liste et portée des vérifications distantes consignées, bascule jamais déclarée totale |
| `tests/test_fiscal_crypto_ps_recoupement.js` | lecture du BOFiP (date de version, qualification, taux), huit maillons, refus par millésime et par maillon manquant, corroboration et contradiction de la FAQ, caches par compte/document/millésime, rectifications conservées, cache altéré refusé |
| `tests/test_fiscal_gardes_foyer.js` | CSG 6DE sans double compte (2BH/2DF automatiques), portée de la 2086 au niveau du foyer, cas particuliers du QF, séparation public/personnel |
| `tests/test_fiscal_matrice_integration.js` | **non-régression** : aucun chiffre du moteur modifié, R2 non remplacée, 2025 non reconduit sur 2026, matrice et contradictions affichées, résumé court inchangé |
| `tests/test_fiscal_regimes_millesimes_reels.js` | libellés **réels** des aides gains.htm des revenus 2023 (lus le 14/10/2026) et 2024 (lus le 15/10/2026) : 17,2 %/30 % acceptés chacun pour sa seule année, variantes typographiques tolérées, refus croisés (2023↔2024, et vers 2025), refus sans attribution d'année, refus conservateur si une balise coupe l'année, collecte simulée → cases « établi » uniquement pour 2023 et 2024, page d'une autre année enregistrée sans valeur, cohérence avec `VERIFICATIONS_DISTANTES` |
| `tests/test_fiscal_frais_revenus_2023_reel.js` | **recoupement du moteur par la source officielle** des revenus 2023 (aide frais.htm lue le 15/10/2026) : plancher 495 €/plafond 14 171 €, forfait repas 5,20 €, barème km 3 à 7 CV sur ses trois tranches et ses deux seuils, majoration électrique 20 % ; refus pour 2026 (`null`, « non disponible ») et 2027 ; preuve 2023 sans effet sur 2024/2025/2026 ; famille `frais` des vérifications distantes et trace de la sonde 2024 en échec |

Les suites déjà livrées (`test_fiscal_activation_2025.js`,
`test_fiscal_crypto_sources.js`, `test_fiscal_regimes_activation.js`,
`test_fiscal_parametres_partiels.js`, etc.) continuent de passer sans
modification : les 47 suites JavaScript sont vertes en local.

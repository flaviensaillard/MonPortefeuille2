# Millésimes fiscaux — reprise de l'existant et révisions

**Année des revenus ≠ année de déclaration** : revenus 2025 → déclaration 2026.
Les montants présents dans le code 2.2.1 ne deviennent pas officiels parce qu'ils
ont été copiés en base. Ils portent l'origine `reprise_code_non_verifiee`.

## Politique de collecte DGFiP (branche, 13/10/2026)

Le bouton « Vérifier cette année (DGFiP) » ou « Vérifier 2023 à 2026 »
**n'appelle plus OpenFisca**. Le script historique `fiscal_sources.js` reste dans
le dépôt pour la traçabilité et ses collectes précédentes restent intactes dans
`pf2_fiscal_collectes`, mais il n'est plus chargé par l'APK, ni autorisé dans
le pont réseau. Aucune de ces anciennes collectes n'alimente la simulation.
Aucun SQL nouveau ni migration annuelle : les extraits publics validés et leurs
révisions sont conservés en cache local, séparés par compte et par **année des
revenus**, et réévalués à chaque lecture. Une révision R2 2025 déjà active
conserve toujours la priorité et n'est jamais réécrite par le bouton.

| Revenus | Déclaration | IR (tranches €) | Décote base seule/couple (€) | QF général (€ par demi-part) | Repas salariés sans justificatifs détaillés (€) | Source de frais |
| --- | --- | --- | --- | --- | --- | --- |
| 2023 | 2024 | 11 294 / 28 797 / 82 341 / 177 106 | 873 / 1 444 | 1 759 | 5,20 | [aide DGFiP déclaration 2024](https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/2024/aides/frais.htm) |
| 2024 | 2025 | 11 497 / 29 315 / 83 823 / 180 294 | 889 / 1 470 | 1 791 | 5,35 | [aide DGFiP déclaration 2025](https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/2025/aides/frais.htm) |
| 2025 | 2026 | 11 600 / 29 579 / 84 577 / 181 917 | 897 / 1 483 | 1 807 | 5,45 | [aide DGFiP déclaration 2026](https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/2026/aides/frais.htm) et [page repas DGFiP](https://www.impots.gouv.fr/particulier/frais-de-repas) |
| 2026 | 2027 | non disponible au 13/10/2026 | non disponible | non disponible | non vérifié pour salariés | [aide déclaration 2027](https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/2027/aides/frais.htm), indisponible lors de la vérification |

BOFiP (publications par année de revenus, et non par année de déclaration) :
[IR 2023](https://bofip.impots.gouv.fr/bofip/2491-PGP.html/identifiant=BOI-IR-LIQ-20-10-20240618),
[2024](https://bofip.impots.gouv.fr/bofip/2491-PGP.html/identifiant=BOI-IR-LIQ-20-10-20250414),
[2025](https://bofip.impots.gouv.fr/bofip/2491-PGP.html/identifiant=BOI-IR-LIQ-20-10-20260407) ;
[décote](https://bofip.impots.gouv.fr/bofip/2495-PGP.html/identifiant=BOI-IR-LIQ-20-20-30-20260407) ;
[plafonnement QF](https://bofip.impots.gouv.fr/bofip/2494-PGP.html/identifiant=BOI-IR-LIQ-20-20-20-20260407).
Pour 2023/2024 les deux derniers liens s'obtiennent en remplaçant la date
`20260407` par `20240618`/`20250414`. Publication 18/06/2024,
14/04/2025 et 07/04/2026 respectivement. Pour 2026, le lecteur consulte
les permaliens *courants* de la doctrine BOFiP et exige que chaque valeur
désigne explicitement **les revenus 2026**, avec date de publication : le BOFiP
2025 daté de 2026 n'est **pas** réutilisé. Seule une nouvelle publication
reconnue peut alimenter la simulation. Le code des formules ne se met pas à
jour tout seul : en cas de changement de régime ou de formule, une nouvelle
APK et ses tests sont indispensables.

**Retour d'essai de l'APK du 13/10/2026 :** BOFiP 2025 et repas 5,45 € lus,
mais l'ancienne lecture de l'aide du simulateur déclarait à tort « format
incompatible » pour l'abattement et la voiture. La [page DGFiP de la
déclaration 2026](https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/2026/aides/frais.htm)
mentionne bien les **revenus 2025**, l'abattement salarié **509 / 14 555 €**
et les cinq lignes du tarif automobile (3 à 7 CV). Le lecteur accepte
maintenant aussi les espaces, accents et euros encodés en entités HTML et le
pont natif répare le jeu de caractères absent ou mal déclaré, sans alléger
la vérification de l'année ni celle des cinq coefficients. Cette correction
est à confirmer par un nouveau clic sur la prochaine APK ; la R2 2025
reste prioritaire même si les frais sont collectés.

Les pages du simulateur sont consultées avec `année de déclaration = revenus + 1`.
Le lecteur exige l'année des revenus et cinq lignes de barème automobile avec
coefficients cohérents ; les repas sans justificatifs détaillés et les bornes
d'abattement de 10 % sont lus séparément. Pour 2023–2024 les repas proviennent
de la page du simulateur du millésime ; la page de repas actuelle ne leur est
pas appliquée rétroactivement. Frais du foyer, justificatifs, participation
employeur, distance domicile-travail, véhicule, arrondis et éligibilité
restent à vérifier personnellement.

**Limites non masquées par le bouton :** prélèvements sociaux ventilés par
nature et par date (RCM précomptés/non précomptés, plus-values et crypto),
CSG déductible et calendrier, règles complètes de crypto/2086, plafonds QF
particuliers, options du foyer, PAS et modifications de formules :
**non disponibles / non vérifiés par ce lecteur**. Les taux de prélèvements
sociaux de certains RCM encaissés en 2026 ont changé selon la
[DGFiP](https://www.impots.gouv.fr/particulier/les-revenus-mobiliers), mais
le régime et la date ne peuvent pas être réduits à un taux universel. Les
chiffres embarqués non recoupés restent des **hypothèses** pour 2023–2024 ;
la R2 2025 a son propre audit. **Le calcul revenus 2026 est suspendu** tant
que les pièces DGFiP nécessaires (IR, décote, QF et frais salariés) ne sont
pas réunies : pas de recopie des chiffres 2025. Même après leur présence,
les autres domaines resteront explicitement non vérifiés : il ne s'agit
jamais d'une révision complète certifiée.

**Écart historique notable :** les anciennes constantes JS 2023 contiennent
une décote différente ; les constantes JS 2024 contiennent d'autres seuils IR,
décote et plafond QF. Quand les pages DGFiP passent les contrôles stricts,
la simulation Android indicative utilise leurs chiffres 2023/2024 ; cela ne
modifie ni les lignes R1 de Supabase, ni le moteur Python hors APK. Sans
accès à ces pages ou sans cache DGFiP validé pour ce compte, l'application
reste sur son code embarqué signalé comme non vérifié. Une correction globale
Python/serveur serait un chantier distinct.

Les sections ci-dessous retracent **l'ancien fonctionnement OpenFisca et les
migrations déjà exécutées**, et ne décrivent plus le bouton actuel.

## Modèle de données

- `pf2_fiscal_annees` contient une **copie par année de revenus de plusieurs
  constantes** embarquées dans `core/fiscal_bars.py` : barème, décote,
  IR forfaitaire, taux annuel de prélèvements sociaux, frais et autres constantes.
  **Ce n'est pas un modèle complet des règles de calcul** : le plafond du quotient
  familial, codé en dur dans `core/tax.py` et le JS, n'est notamment pas importé ;
  le taux de PS n'est pas ventilé par catégorie ni par date de prélèvement.
  L'année est une ligne, pas une nouvelle table. Chaque ligne porte une
  `revision` et une référence vers le commit source. Ces lignes sont lisibles
  depuis l'APK connectée mais insérables uniquement côté serveur.
- `pf2_fiscal_collectes` reçoit historiquement le barème IR transmis par
  OpenFisca-France. Il s'agit d'une **source partielle**, pas d'un millésime prêt
  pour une déclaration. Les données d'un autre utilisateur sont invisibles (RLS).
- Une rectification des chiffres d'une même année crée la **révision N+1**.
  C'est elle qui devient la plus récente ; la révision N reste consultable pour
  comprendre ce qui a changé. Une année différente ne change pas. La collecte
  Android fait déjà cela pour le barème IR ; la publication serveur d'un
  millésime complet rectifié nécessitera son propre contrôle de complétude.
- Le moteur Python conserve les constantes intégrées. L'APK applique une R2
  complète lorsqu'elle existe et passe son contrat ; sinon, pour les années
  compatibles **à partir de 2026**, le seul barème IR collecté peut alimenter
  une simulation explicitement indicative. Tous les autres paramètres non
  contrôlés sont signalés après l'appui sur le bouton. Cette collecte ne
  transforme jamais une R1 historique en règle validée et n'est pas une
  publication des règles complètes.

## Mettre la base en place (l'ordre compte)

1. **Sauvegarde avant toute écriture de millésimes : effectuée le 12/10/2026.**
   Le workflow avait d'abord échoué sur `Config` avec une clé `anon`. Le secret
   GitHub a été corrigé côté utilisateur, puis la relance du run 38254476762
   a réussi : export chiffré, restauration de contrôle et artefact présent.
   **Ne jamais exécuter `GRANT ... TO anon`** malgré la suggestion initiale
   de l'erreur : cela exposerait `Config`. La sauvegarde de `main` couvre les
   anciennes tables ; après fusion de cette branche, une sauvegarde inclura
   aussi les deux nouvelles tables fiscales comme tables optionnelles. Vérifier
   le compte rendu après l'import. Ne jamais communiquer la clé serveur, ni la
   placer dans l'APK ou le dépôt.
2. **Migrations 009 puis 010 : exécutées par le propriétaire** dans Supabase SQL
   Editor le 12/10/2026 ; retour « Success. No rows returned » pour chacune.
   La migration 010 conserve les éventuelles collectes IR de 009 en révision 1.
3. **Simulation : effectuée en lecture seule** sur la branche via Actions run
   38257679857. Résultat : aucune année présente dans `pf2_fiscal_annees` ;
   années proposées : **2022, 2023, 2024, 2025, 2026**. Aucune ligne insérée.
   Le workflow manuel de simulation existe, mais la **reprise initiale est
   désormais figée** : après correction des constantes, simulation et application
   refusent de proposer des chiffres sous l'ancienne provenance. Il utilise
   `SUPABASE_URL`, `SUPABASE_KEY` (service_role) et `SUPABASE_USER_ID`.
4. **Import réel autorisé puis effectué le 12/10/2026**, run Actions 38258384611 :
   2022, 2023, 2024, 2025, 2026 insérées en révision 1, aucune année déjà
   présente. Le job a relu chaque ligne et comparé les paramètres avec la
   copie attendue du code. La sauvegarde chiffrée de cette version a ensuite
   été restaurée pour contrôle ; l'artefact `sauvegarde-fiscale-38258384611`
   est disponible 90 jours dans Actions : le télécharger et conserver la phrase
   `SAUVEGARDE_CLE` dans un gestionnaire de mots de passe pour pouvoir l'ouvrir.
   Le déclencheur automatique ponctuel a été retiré
   de la branche après succès. **Ne pas relancer l'import** : depuis la correction
   locale des constantes 2025, simulation et `--appliquer` sont refusés pour
   empêcher d'attribuer les nouvelles valeurs au commit source ancien. Une
   correction ultérieure doit emprunter une publication de révision 2 distincte.
5. Contrôle facultatif côté Supabase :
   ```sql
   select annee_revenus, revision, origine, cree_le
     from public.pf2_fiscal_annees
    order by annee_revenus, revision;
   ```
   Ne copiez pas de données sensibles depuis d'autres tables dans un journal
   public. Le numéro de version `2.2.1` du téléphone ne change pas à cette étape.

**Import réel effectué et contrôlé sur Supabase le 12/10/2026.** Il s'agit
seulement d'une reprise des données du code embarqué, non de chiffres
fiscaux officiellement revérifiés. La PR #22 reste à examiner : ni le bouton
ni les sauvegardes périodiques incluant les nouvelles tables ne sont encore
livrés sur `main`. Une sauvegarde chiffrée ponctuelle avec les deux nouvelles
tables a été produite et contrôlée lors de l'import.

**Audit fiscal daté du 12/10/2026 :** voir
[`AUDIT-FISCAL-2025-2026.md`](AUDIT-FISCAL-2025-2026.md). Des écarts officiels
sont confirmés pour la décote, le quotient familial et les prélèvements sociaux
de certains gains 2025. L'import reste **non vérifié** ; aucune révision importée
ne doit être activée automatiquement pour les calculs sur la seule foi de cette
reprise.

**Préparation locale ultérieure (13/10/2026) :** voir
[`REVISION-FISCALE-2025-PREPARATION.md`](REVISION-FISCALE-2025-PREPARATION.md)
pour le brouillon d'une éventuelle révision 2 de **2025 uniquement**.
La [migration de structure 011](MIGRATION-FISCALE-011-MODE-EMPLOI.md) est déclarée
appliquée par le propriétaire après sauvegarde/restauration du run 38369577641 ;
les cinq R1 restent non vérifiées et inactives. Cette migration n'insère ni
n'active de R2 et ne change pas le moteur des calculs.
`python jobs/preparer_revision_fiscale_2025.py` génère un inventaire hors ligne
avec différences attendues et règles non auditées ; ce n'est ni une simulation
de lecture Supabase, ni une ligne publiable, ni une sauvegarde. Aucune écriture
de paramètres fiscaux n'a été effectuée pendant cette préparation : seule la structure de la table a été étendue par 011.

## Historique : collecte OpenFisca sur les APK antérieures

Le bouton de la version antérieure à la migration 012 lit le barème IR de **l'année sélectionnée** sur
`https://api.fr.openfisca.org/latest/parameter/impot_revenu/bareme_ir_depuis_1945/bareme`.
Le pont réseau de l'APK de branche doit autoriser l'hôte HTTPS **exact**
`api.fr.openfisca.org` : son omission a causé le message « source injoignable »
alors que Supabase fonctionnait. Une APK antérieure au correctif ne peut pas
réussir cette collecte. Ni la migration 009 ni la 010 ne doivent être rejouées
pour corriger un refus de cet hôte. Le serveur et son format restent des
dépendances externes : un accès à l'hôte ne garantit pas une réponse valide.
Une entrée explicite pour l'année des revenus est exigée ; aucun barème de l'année
précédente n'est supposé valable. Si la source rectifie une année déjà collectée,
le bouton ajoute une révision, conserve la précédente. Pour une année avec un
moteur embarqué compatible (actuellement 2026), les nouveaux seuils et taux IR
modifient **seulement la simulation indicative**, jamais une R2 complète ;
la décote, les PS, frais, crypto, règles de calcul et montants personnels restent
non vérifiés. Si aucune année compatible n'existe dans l'APK (par exemple 2027),
le bouton peut collecter un barème mais refuse de calculer en recopiant l'année
précédente. Le rapport du bouton liste les manques. OpenFisca est une modélisation
ouverte, **pas le texte officiel de la loi**. Tester uniquement l'artefact de branche construit avec la signature
habituelle ; la release publique `apk-2.2.1` correspond à un ancien commit et
ne contient pas le lecteur R2 ni le correctif d'accès OpenFisca. Ne pas
installer un APK signé avec une clé de développement par-dessus l'application.

Tests sans base : `python -m unittest tests.test_importer_fiscal_existant`,
`node tests/test_fiscal_sources.js`.

## Historique : extension des paramètres isolés (APK antérieures)

**Migration 012 exécutée par le propriétaire le 13/10/2026 (succès communiqué), après le run de sauvegarde/restauration 38396580535 réussi. Ne pas la rejouer.** Avant cela, la table 009/010 limitait
`source` et `source_url` au barème IR. Le script
[`migrations/012_collecte_parametres_fiscaux.sql`](../migrations/012_collecte_parametres_fiscaux.sql)
élargit ces deux contraintes à `openfisca_parametres` sans modifier une seule
révision existante. Il a été appliqué **une seule fois** par le propriétaire après la sauvegarde vérifiée.
Ne pas rejouer 009, 010, 011, 012 ni le SQL R2 2025. L'APK et le SQL sont
deux opérations distinctes : une erreur d'unicité `23505` signifie qu'une
révision existe déjà, **pas** que la migration a échoué. La collecte relit
désormais la dernière révision de cette année/source puis réessaie au plus deux
fois en cas de conflit, sans modifier ni supprimer une ligne existante. Même
si l'enregistrement échoue, le bilan montre les feuilles recherchées et distingue
les valeurs repérées mais non enregistrées (donc non utilisées).

Le clic interroge, pour l'année de revenus choisie, les paramètres scalaires
suivants d'OpenFisca-France, à partir de
`https://api.fr.openfisca.org/latest/parameter/` :

| Catégorie | Chemin sous `/parameter/` | Traitement |
| --- | --- | --- |
| Plafond général QF | `impot_revenu/calcul_impot_revenu/plaf_qf/plafond_avantages_procures_par_demi_part/general` | Utilisé **dans la simulation indicative seulement** si valeur explicite pour l'année et moteur compatible. Les demi-parts particulières ne sont pas couvertes. |
| Décote | `impot_revenu/calcul_impot_revenu/plaf_qf/decote/seuil_celib`, `seuil_couple`, `taux` | Chiffres collectés mais **non appliqués isolément** : seuils d'application, arrondis et méthode restent à auditer. |
| CSG et PS du capital | `taxation_capital/prelevements_sociaux/csg/{taux_global,taux_deductible}/{revenus_du_patrimoine,produits_de_placement}` et `taxation_capital/prelevements_sociaux/prelevements_solidarite/{revenus_du_patrimoine,produits_de_placement}` | Collectés séparément, **jamais additionnés en un taux de PS global**. CRDS, autres composantes, date de paiement et catégories ne sont pas vérifiées. |
| Crypto | `impot_revenu/calcul_impot_revenu/pv/actifs_numeriques/{plancher,taux}` | Seul le seuil de cessions peut alimenter la simulation indicative si explicite ; taux, méthode de calcul 2086, exhaustivité du foyer et option 3CN non certifiés. |
| Repas, kilomètres | Aucune feuille OpenFisca structurée repérée pour ces barèmes | Les pages officielles DGFiP sont interrogées séparément par l’APK ; année et tableau complets exigés, voir ci-dessous. |
| Changements de formules | Ce ne sont pas des paramètres scalaires | **Non appliqués automatiquement**. Mise à jour/test du moteur et nouvelle APK indispensables. L'absence de changement de code n'est pas certifiée par ce bouton. |

La collecte conserve **chaque révision d'un même millésime** dans
`pf2_fiscal_collectes` avec sa source, le chemin de chaque feuille et sa date ; une nouvelle année est
séparée. Seule une valeur numérique valide à la clé exacte `AAAA-01-01` est
acceptée. Une valeur d'une année antérieure n'est **jamais** présumée encore
valide. Une panne d'une feuille n'empêche pas de rapporter les autres ; les
feuilles manquantes/inaccessibles sont nommées après le clic. Le lecteur
revérifie à chaque session la période, la source, la forme et les bornes de la
dernière révision : une révision plus récente invalide désactive la collecte
partielle plutôt que revenir silencieusement à une ancienne. R2 2025 complète
reste prioritaire. La publication d'une R2 pour une année future n'est **pas**
automatisée et 2027 n'a pas de moteur fiscal compatible dans cette APK.

L'API OpenFisca décrit une modélisation publique, **pas** la certification de
la DGFiP ou d'une LF/LFSS publiée. Au 13/10/2026, lors de l'essai utilisateur,
le barème IR explicite 2026 était absent ; aucune hausse ou stabilité d'IR
2026 ne doit en être déduite. Le fait qu'une autre feuille soit datée de 2026
ne complète pas le millésime fiscal. Le rapport n'atteste pas l'absence d'une
loi rectificative ni la validité de la déclaration.

Tests locaux sans Supabase :
`node tests/test_fiscal_parametres_partiels.js`,
`node tests/test_fiscal_sources.js`,
`node tests/test_fiscal_maj_indicative.js`.


## Historique : première version du lecteur DGFiP frais (13/10/2026)

Le périmètre ci-dessous décrit la première version, désormais complétée par la politique en tête de page pour 2023–2026.

Le bouton cherche désormais séparément :

- les repas sans cantine ni justificatifs détaillés sur
  `https://www.impots.gouv.fr/particulier/frais-de-repas` ; la phrase
  « Pour l’imposition des revenus **AAAA**, la valeur d’un repas pris au foyer
  est de **X,XX €** » doit mentionner exactement l’année sélectionnée ;
- le **barème kilométrique des automobiles**, *pas* celui du carburant seul ou
  des deux-roues, sur la page de l’aide DGFiP
  `https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/{ANNEE+1}/aides/frais.htm`.
  L’année des revenus doit être écrite dans le texte. Les 5 lignes de voitures
  (3 CV et moins à 7 CV et plus), les trois tranches 5 000/20 000 km,
  la majoration 100 % électrique de 20 %, et la cohérence des coefficients
  sont vérifiées. Un changement de formule ou de structure est refusé : il
  faut alors une nouvelle version du moteur et non une extrapolation.

La collecte DGFiP est conservée **sur le téléphone uniquement**, en révisions
par compte et année, et revalidée depuis ses extraits à chaque lecture ; elle
n’est ni dans Supabase ni dans les sauvegardes `.pf2`, et doit être refaite
sur un autre appareil ou après effacement du stockage local. Elle est appliquée
**seulement à la simulation indicative d’une année compatible (actuellement
2026)**, sans toucher à la R2 2025. En cas d’absence de millésime explicite,
le bouton dit « millésime absent ou format incompatible » et conserve uniquement
les hypothèses embarquées *non vérifiées* ; il ne recopie jamais le barème
2025 sous le nom 2026. Les kilomètres, le véhicule et les repas réellement
éligibles restent à justifier par la personne.

Au 13/10/2026, la page des **salariés** indique encore explicitement les
revenus **2025**, soit 5,45 € par repas. La page d’aide du simulateur
`/calcul_impot/2027/aides/frais.htm` n’est pas encore disponible. Un BOFiP
professionnel BNC du 18/02/2026 indique 5,50 € pour la valeur du repas pris
au domicile en **2026**, montant déjà hypothétique dans l’APK, mais cette
source BNC ne suffit pas à certifier le cas des salariés sans justificatifs.
Le bouton doit donc **refuser d’importer repas et kilomètres 2025 en 2026**
tant que la page salariale pour l’année 2026 ne les publie pas.

Test hors réseau : `node tests/test_fiscal_frais_sources.js` (année exacte,
format complet, cohérence, rectification, isolation des comptes).

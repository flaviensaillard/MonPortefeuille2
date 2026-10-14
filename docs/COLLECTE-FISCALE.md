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
la vérification de l'année ni celle des cinq coefficients. **Contrôle sur téléphone confirmé** : la nouvelle APK a affiché l'abattement 509 / 14 555 €, le repas 5,45 € et les cinq lignes automobiles pour les revenus 2025. La R2 2025 reste prioritaire. Aucun montant personnel de cette vérification n'est enregistré dans le dépôt.

### Étape suivante : prélèvements des plus-values de titres et seuil de bascule

Le bouton vérifie également la [page DGFiP de gains de la déclaration
2024](https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/2024/aides/gains.htm)
(revenus 2023), celle de [2025](https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/2025/aides/gains.htm)
(revenus 2024), et celle de [2026](https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/2026/aides/gains.htm)
(revenus 2025). Il exige l'année des **revenus**, la mention des cessions de
titres, les taux IR/PS et leur somme, l'option 2OP et la réserve relative aux
titres acquis avant 2018. Elles affichent **12,8 % d'IR + 17,2 % de PS**
pour les revenus 2023–2024, et **12,8 % + 18,6 %** pour 2025. Si ce contrôle
passe, le taux **des gains de titres seulement** peut alimenter la simulation
indicative des années sans révision active. La R2 2025 reste prioritaire.
Une rectification d'un millésime crée une nouvelle entrée locale. Pour 2026,
la page de déclaration 2027 devra mentionner expressément les revenus 2026 ;
la page 2026 concernant 2025 n'est jamais réutilisée.

**Retour d'essai du 14/10/2026 (APK `dbbc065`) :** sur le téléphone, la
page des gains 2025 a encore affiché « année absente ou format non reconnu »
et le rapport a indiqué « simulation indicative seulement » au lieu de R2
prioritaire. Ce retour n'établit pas que la R2 a disparu de Supabase : le
bouton relisait la base et vidait la sélection R2 au préalable ; une erreur
ponctuelle à cette étape pouvait suffire à produire ce repli. La collecte
DGFiP conserve maintenant la R2 déjà chargée pour le même compte et le même
contexte éligible, sans requête Supabase supplémentaire ; si elle n'était pas
chargée, elle retente la lecture et affiche un diagnostic (connexion, session,
périmètre ou révision incompatible). Le lecteur des gains analyse séparément
les taux et les preuves de l'année/2OP/titres anciens, puis relit l'extrait
public conservé en cache. Il indique la vérification qui échoue au lieu d'un
simple « format non reconnu ». **Nouvel essai utilisateur** :
la R2 est bien visible avant/après le clic, mais les titres 2025 restent « régime
des gains de titres absent ». Cela prouve seulement que la phrase exacte
attendue par le lecteur ne se trouve pas dans le corps HTTP normalisé reçu :
le contenu brut reçu sur le téléphone n'est pas disponible dans le dépôt.
Le lecteur accepte maintenant aussi la section « Gains de cession de valeurs
mobilières, droits sociaux » avec le paragraphe PFU immédiatement voisin et
les preuves distinctes de l'année 2025, de l'option 2OP, de la condition des
titres anciens et de la somme IR + PS = PFU. Un document HTTP 200 sans ces
preuves est toujours refusé ; en cas d'intitulé absent, le rapport affichera
le statut HTTP, la longueur et les 130 premiers caractères du **seul document
public** reçu, pour identifier un changement de page ou d'encodage. Ce correctif
doit encore être vérifié sur téléphone : ne pas affirmer que les PS des titres
ont été mis à jour dans l'APK. La collecte partielle ne vaut toujours pas
révision complète.

**Essai suivant de l'APK `457df66` (14/10/2026) :** le rapport reconnaît
l'année, le paragraphe PFU et ses taux, mais refuse encore « option 2OP ou
condition des titres anciens ». Le lecteur contrôle désormais séparément la
case 2OP et le lien entre abattement, titres acquis et date du 1er janvier
2018 dans la section titres, sans exiger une rédaction littérale de toute la
phrase ; le prochain rapport indiquera quels repères publics manquent s'il
échoue encore. La même collecte affichait « R2 2025 : portefeuille non chargé » :
le cache d'accueil ne conserve **aucune transaction** et peut être présenté
pendant la synchronisation. Le clic DGFiP ne doit pas interrompre une lecture
R2 en cours. Tant que les transactions ne sont pas chargées, la simulation
personnelle est suspendue et la R2 indiquée **non évaluée**, pas inactive.
Une lecture de transactions échouée ne se fait plus passer pour une table vide ;
une fois le chargement terminé, le rapport de collecte affiché est réévalué
avec l'état réel de la R2. Pas de modification SQL, ni de preuve d'une R2
perdue en base.

**Essai de l'APK `8e4aaf2` (14/10/2026) :** la R2 2025 est de nouveau
confirmée active et prioritaire après le clic. Le diagnostic des gains montre
`2OP=true`, `abattement=true`, `titres acquis=true` mais `avant 2018=false` ;
le taux PS des titres n'est donc **toujours pas validé dans l'APK**. La page
officielle consultée affiche « avant le 1er janvier 2018 ». Une explication
possible, à confirmer sur l'appareil, est une écriture HTML telle que
`1<sup>er</sup>` qui devient `1 er` après suppression des balises : le lecteur
accepte désormais ces deux graphies et l'exposant Unicode, en exigeant
toujours explicitement **2018** dans la condition des titres acquis.
Les tests vérifient l'acceptation de cette variante, la relecture du cache
et le refus de 2019. Si la prochaine lecture échoue encore, le diagnostic
affichera aussi un court contexte autour de « 2018 » du document public ;
aucune donnée personnelle n'est nécessaire. **Essai sur téléphone du correctif
`b72b667` : confirmé.** Le rapport affiche pour les revenus **2025** :
**R2 déjà active prioritaire** et **PS des plus-values de titres 18,6 %,
IR forfaitaire 12,8 %**, avec la page DGFiP de la déclaration 2026 et le
contrôle explicite de l'année. Cela valide la lecture des gains de titres sur
cet appareil, pas les autres revenus du capital ni la situation du foyer.

### Audit des autres régimes avant toute bascule (14/10/2026)

| Domaine | Ce que la DGFiP publie | Pourquoi la simulation ne peut pas encore l'activer automatiquement comme régime complet |
| --- | --- | --- |
| RCM et précompte | La [page DGFiP « revenus mobiliers »](https://www.impots.gouv.fr/particulier/les-revenus-mobiliers), **modifiée le 08/04/2026**, indique que les produits de placement **versés en 2025** ont supporté **17,2 % de PS** lors du versement ; les RCM **non précomptés lors de l'encaissement en 2025** peuvent être soumis à **18,6 % sur l'avis 2026 des revenus 2025**. À partir de 2026 le taux change, avec des produits qui restent à 17,2 % (assurance-vie/capitalisation, certains CEL/PEL/PEP). | Il faut distinguer produit, encaissement, date, précompte effectif, dispense/acompte IR et exceptions. La page actuelle n'atteste pas toute la situation du foyer ni les millésimes 2023–2024 ; **ne pas y appliquer le PS des titres**. Pas de révision RCM complète par simple lecture de deux taux. |
| CSG déductible et calendrier | La même [page DGFiP](https://www.impots.gouv.fr/particulier/les-revenus-mobiliers) mentionne la fraction de **6,8 %** des RCM imposés au barème, **déductible l'année du paiement de la CSG**, sous exception des fonds en euros d'assurance-vie/capitalisation ; au PFU, pas de CSG déductible au titre des RCM. Le [BOFiP CSG](https://bofip.impots.gouv.fr/bofip/887-PGP.html/identifiant=BOI-IR-BASE-20-20-20170724) précise aussi les règles d'assiette et d'imputation, mais sa version affichée est datée **24/07/2017**. | La fraction, son éligibilité, la date de paiement et le rattachement au bon foyer/avis doivent être croisés avec les millésimes applicables. Une page actuelle et un BOFiP ancien ne valident pas à eux seuls toutes les années ni tous les arrondis de l'APK. |
| Crypto privée et 2086 | La [FAQ DGFiP](https://www.impots.gouv.fr/particulier/questions/comment-declarer-les-plus-ou-moins-values-sur-cessions-dactifs-numeriques), modifiée le **17/07/2026**, indique actuellement **31,4 %**, l'option **3CN indépendante de 2OP**, la franchise de **305 € sur les prix bruts annuels de cession**, l'annexe **2086** et la non-reportabilité des moins-values ; le [BOFiP du 23/04/2024](https://bofip.impots.gouv.fr/bofip/11969-PGP.html/identifiant=BOI-RPPM-PVBMC-30-30-20240423) indiquait **30 %** à sa date. | Ne pas appliquer rétroactivement le taux de la FAQ courante ; établir la date d'effet de chaque taux, le portefeuille crypto **global** du foyer et l'intégralité des cessions/comptes externes, puis vérifier la formule 2086 et ses arrondis. La seule application ne certifie pas une 2086 complète. |
| QF et calcul complet | Le [BOFiP QF du 07/04/2026](https://bofip.impots.gouv.fr/bofip/2494-PGP.html/identifiant=BOI-IR-LIQ-20-20-20-20260407) contient le plafond général **1 807 €/demi-part pour 2025**, une double liquidation et des plafonds spécifiques. | Le bouton ne lit que le plafond général ; les situations spéciales et la concordance de toutes les formules/arrondis avec le millésime restent non testées. Les cas personnels non documentés ne peuvent pas être déclarés vérifiés à partir du BOFiP. |

Ces textes constituent une **cartographie de travail**, pas des paramètres
activés. Les taux RCM/crypto et la CSG du code déjà embarqué restent signalés
comme hypothèses tant qu'un lecteur par produit, année **des revenus** et date
de paiement n'a pas produit une preuve réévaluable et que le moteur associé
n'a pas été testé ; la R2 2025 garde sa priorité indépendante. Pour 2026,
aucun barème 2025 n'est reconduit silencieusement. Les informations ponctuelles
sur le portefeuille/foyer communiquées par le propriétaire pour 2025 ne sont
pas transformées en règles publiques ni inscrites dans le dépôt.

**Ne pas confondre ce progrès avec une bascule complète.** Le rapport affiche
« Bascule DGFiP totale : non » et les contrôles restants : RCM par produit,
précompte et date ([DGFiP revenus mobiliers](https://www.impots.gouv.fr/particulier/les-revenus-mobiliers)),
PS crypto privés et annexe 2086 ([DGFiP actifs numériques](https://www.impots.gouv.fr/particulier/questions/comment-declarer-les-plus-ou-moins-values-sur-cessions-dactifs-numeriques)),
CSG déductible selon l'année de paiement, plafonds QF spéciaux, formules et
arrondis. Le [BOFiP crypto du 23/04/2024](https://bofip.impots.gouv.fr/bofip/11969-PGP.html/identifiant=BOI-RPPM-PVBMC-30-30-20240423)
indique 17,2 % à cette date : ce texte **ne prouve pas** un taux identique
pour les revenus 2025 ou 2026. La R2 2025 a déjà fait l'objet d'un audit
spécifique ([36 feuilles](AUDIT-R2-2025.md)), ce qui n'est pas la même chose
qu'un recontrôle exhaustif en ligne par le bouton. Aucun taux des titres
n'est recopié sur les RCM ou la crypto. Le PAS DGFiP effectif et la réalité
des frais, revenus, autres avoirs et opérations du foyer ne peuvent pas être
déduits des publications générales : ils ne seront jamais « vérifiés » par
un bouton de consultation de textes publics.

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

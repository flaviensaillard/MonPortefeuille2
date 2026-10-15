# Millésimes fiscaux — reprise de l'existant et révisions

**Année des revenus ≠ année de déclaration** : revenus 2025 → déclaration 2026.
Les montants présents dans le code 2.2.1 ne deviennent pas officiels parce qu'ils
ont été copiés en base. Ils portent l'origine `reprise_code_non_verifiee`.

## Lecture expérimentale de la brochure PDF DGFiP (14/10/2026)

Le bouton lit désormais aussi la [brochure DGFiP de déclaration 2026](https://www.impots.gouv.fr/www2/fichiers/documentation/brochure/ir_2026/pdf_som/nouveautes.pdf) pour les **revenus 2025** : hausse de CSG sur revenus du patrimoine, calendrier distinct des produits de placement et exceptions. Cette lecture est **partielle et non activante** ; elle ne permet pas d'attribuer un taux global de PS aux cessions crypto 2025. La première APK PDF a refusé l'en-tête sur Android (titre dessiné après la section). Le nouveau parseur a été vérifié sur le PDF officiel dans [un diagnostic CI ponctuel](https://github.com/flaviensaillard/MonPortefeuille2/actions/runs/38532107467), et sa correction a désormais été **confirmée sur téléphone** : CSG patrimoine 9,2 → 10,6 % pour les revenus 2025 déclarés en 2026, effet placement dès le 1.1.2026, exceptions et CSG déductible 6,8 % seulement mentionnée, sans application personnelle. R2 2025 reste prioritaire, bascule totale toujours « non ». Voir [méthode, limites et test Android](LECTURE-PDF-DGFIP.md).

## Étape suivante : notice 2086 et brochure crypto revenus 2025 (14/10/2026)

Le bouton lit deux PDF DGFiP millésimés de la déclaration 2026 : notice 2086 et brochure des plus-values crypto. La formule (prix avant frais dans le quotient, prix net dans le résultat), la ligne 51 du foyer, le seuil 305 €, l'IR 12,8 %, les cases 3AN/3BN et l'option 3CN sont vérifiés **par passages officiels**, avec révisions locales séparées. Le diagnostic ponctuel des deux PDF réels et de la relecture des extraits a réussi ; l'APK reste à vérifier sur Android. **Les PS crypto 2025 chiffrés et l'annexe complète du foyer ne sont pas prouvés : aucun taux n'est activé, R2 2025 demeure prioritaire, bascule totale « non ».** Voir [preuves, divergence sur « égal à 305 » et limites](LECTURE-PDF-CRYPTO-DGFIP.md).

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

**Écart entre documents officiels pour les titres 2025 (repéré le 14/10/2026) :**
la [notice générale 2042 des revenus 2025](https://www.impots.gouv.fr/sites/default/files/formulaires/2042/2026/2042_5477.pdf)
indique **17,2 %** de PS sur les plus-values de valeurs mobilières 2025.
À l'inverse, la [notice dédiée 2074 des revenus 2025](https://www.impots.gouv.fr/sites/default/files/formulaires/2074/2026/2074_5500.pdf)
indique **18,60 %** de PS au titre des revenus du patrimoine sur les plus-values
2025 ; l'aide du simulateur **déclaration 2026 / revenus 2025** et la
[page DGFiP « cessions mobilières »](https://www.impots.gouv.fr/particulier/les-cessions-mobilieres)
(modifiée le 08/04/2026) affichent elles aussi **18,6 %** ; la
[brochure DGFiP 2026, rubrique plus-values 2025](https://www.impots.gouv.fr/www2/fichiers/documentation/brochure/ir_2026/pdf_som/09-plus_values_137a156.pdf)
confirme ce taux et la déduction éventuelle de CSG **l'année du paiement**.
La page
[DGFiP « revenus mobiliers »](https://www.impots.gouv.fr/particulier/les-revenus-mobiliers)
distingue explicitement les PS **précomptés en 2025 (17,2 %)** de ceux payés
sur l'**avis 2026** pour les revenus du patrimoine 2025 **non précomptés
(18,6 %)**. Cela peut expliquer la différence selon la date de paiement,
mais **ne corrige pas** le chiffre contradictoire de la notice générale 2042
sur les *plus-values de titres* : ce conflit documentaire demeure. Le lecteur
conserve le taux de l'aide du simulateur confirmé sur Android (18,6 %) et
la R2 2025 déjà active **garde priorité** ; le rapport du bouton avertit de
l'écart. Ce recoupement n'est ni une certification juridique universelle ni
une autorisation d'appliquer 18,6 % à tous les RCM, à la crypto ou à 2026.

### Audit des autres régimes avant toute bascule (14/10/2026)

| Domaine | Ce que la DGFiP publie | Pourquoi la simulation ne peut pas encore l'activer automatiquement comme régime complet |
| --- | --- | --- |
| RCM et précompte | La [page DGFiP « revenus mobiliers »](https://www.impots.gouv.fr/particulier/les-revenus-mobiliers), **modifiée le 08/04/2026**, indique que les produits de placement **versés en 2025** ont supporté **17,2 % de PS** lors du versement ; les RCM **non précomptés lors de l'encaissement en 2025** peuvent être soumis à **18,6 % sur l'avis 2026 des revenus 2025**. À partir de 2026 le taux change, avec des produits qui restent à 17,2 % (assurance-vie/capitalisation, certains CEL/PEL/PEP). | Il faut distinguer produit, encaissement, date, précompte effectif, dispense/acompte IR et exceptions. La page actuelle n'atteste pas toute la situation du foyer ni les millésimes 2023–2024 ; **ne pas y appliquer le PS des titres**. Pas de révision RCM complète par simple lecture de deux taux. |
| CSG déductible et calendrier | La même [page DGFiP](https://www.impots.gouv.fr/particulier/les-revenus-mobiliers) mentionne la fraction de **6,8 %** des RCM imposés au barème, **déductible l'année du paiement de la CSG**, sous exception des fonds en euros d'assurance-vie/capitalisation ; au PFU, pas de CSG déductible au titre des RCM. Le [BOFiP CSG](https://bofip.impots.gouv.fr/bofip/887-PGP.html/identifiant=BOI-IR-BASE-20-20-20170724) précise aussi les règles d'assiette et d'imputation, mais sa version affichée est datée **24/07/2017**. Les **brochures DGFiP de la déclaration 2026** détaillent désormais 2BH/2CG/2DF et le calendrier 6DE pour les revenus **2025** (ci-dessous). | La fraction, son éligibilité, le produit, la date de paiement et le rattachement au bon foyer/avis ne sont **pas automatiquement vérifiés par le bouton**. Le recoupement documentaire de 2025 ne valide ni 2023–2024 ni tous les arrondis de l'APK. |
| Crypto privée et 2086 | La [FAQ DGFiP](https://www.impots.gouv.fr/particulier/questions/comment-declarer-les-plus-ou-moins-values-sur-cessions-dactifs-numeriques), modifiée le **17/07/2026**, indique actuellement **31,4 %**, l'option **3CN indépendante de 2OP**, la franchise de **305 € sur les prix de cession du foyer**, l'annexe **2086** et la non-reportabilité des moins-values ; le [BOFiP du 23/04/2024](https://bofip.impots.gouv.fr/bofip/11969-PGP.html/identifiant=BOI-RPPM-PVBMC-30-30-20240423) indiquait **30 %** à sa date. La [2086 et sa notice, revenus 2025](https://www.impots.gouv.fr/sites/default/files/formulaires/2086/2026/2086_5515.pdf), confirment la formule par cession, les lignes 51/52 (foyer), la franchise **≤ 305 €**, la 3CN indépendante de 2OP et la nécessité de valoriser **tous** les actifs détenus au moment de chaque cession ; elles ne chiffrent pas le taux PS 2025. | Ne pas appliquer rétroactivement le taux de la FAQ courante ; voir ci-dessous le recoupement DGFiP **millésimé 2025** sans activation du bouton. Portefeuille crypto **global** du foyer et intégralité des cessions/comptes externes restent indispensables ; vérifier aussi soultes, formule 2086 et arrondis. La seule application ne certifie pas une 2086 complète. |
| QF et calcul complet | Le [BOFiP QF du 07/04/2026](https://bofip.impots.gouv.fr/bofip/2494-PGP.html/identifiant=BOI-IR-LIQ-20-20-20-20260407) contient le plafond général **1 807 €/demi-part pour 2025**, une double liquidation et des plafonds spécifiques. | Le bouton ne lit que le plafond général ; les situations spéciales et la concordance de toutes les formules/arrondis avec le millésime restent non testées. Les cas personnels non documentés ne peuvent pas être déclarés vérifiés à partir du BOFiP. |

**Recoupement millésimé CSG / prélèvements sociaux (brochure DGFiP 2026,
revenus 2025) :** les [nouveautés](https://www.impots.gouv.fr/www2/fichiers/documentation/brochure/ir_2026/pdf_som/nouveautes.pdf)
distinguent deux dates d'effet : CSG de **9,2 % à 10,6 %** pour les revenus
du patrimoine **2025 déclarés en 2026** (hors exceptions nommées : fonciers,
immobilier, assurance-vie, épargne logement), mais à compter du **01/01/2026**
pour les produits de placement ; la fraction déductible reste **6,8 %**. Le
[BOFiP crypto publié en 2024](https://bofip.impots.gouv.fr/bofip/11969-PGP.html/identifiant=BOI-RPPM-PVBMC-30-30-20240423)
classe les gains privés d'actifs numériques parmi les revenus du patrimoine.
Ce croisement millésimé **étaye** le taux de PS **18,6 %** pour les gains crypto
privés des revenus 2025, cohérent avec la [FAQ DGFiP actuelle](https://www.impots.gouv.fr/particulier/questions/comment-declarer-les-plus-ou-moins-values-sur-cessions-dactifs-numeriques)
(31,4 % avec 12,8 % d'IR), mais la **2086 revenus 2025 ne chiffre pas ses PS**.
Ne pas substituer ce raisonnement documentaire à une preuve collectée et
réévaluable par le bouton, ni l'appliquer à 2023–2024 ou à tous les produits.

La [brochure RCM revenus 2025](https://www.impots.gouv.fr/www2/fichiers/documentation/brochure/ir_2026/pdf_som/08-RCM_121a136.pdf)
précise les cases **2BH** (RCM éligibles, PS acquittés en **2025**, 6,8 %
déductibles des revenus 2025 si **2OP**), **2CG** (aucune CSG déductible même
au barème) et **2DF** (CSG déductible indépendamment de 2OP selon le produit).
La [brochure charges revenus 2025](https://www.impots.gouv.fr/www2/fichiers/documentation/brochure/ir_2026/pdf_som/12-charges_ded_rev_225a236.pdf)
distingue la CSG des **revenus du patrimoine 2024 payée en 2025**, reportée
case **6DE** des revenus 2025 (sous conditions), de la CSG des RCM prélevée
à la source en 2025 (2BH/2DF, automatiquement calculée). L'APK n'identifie
pas toutes ces cases, produits, paiements ni les autres montants préremplis du
foyer : la CSG déjà estimée par la R2 ou le code n'est **pas** une validation
automatique de ce domaine. Un gain de titres/crypto 2025 soumis aux PS sur
l'avis 2026 ne génère pas de déduction CSG **en 2025**. Pour les autres années,
exiger les pièces correspondantes sans reconduire ces références 2025.

**Contrôle 2086 sur la notice des revenus 2025 (sans bascule du taux crypto) :**
les lignes 213/217 sont le prix de cession **avant frais** ; la fraction de
capital utilise `223 × 217 / 212`. Le résultat ligne 224 déduit les frais via
la ligne **218** (`218 − fraction de capital`), et la ligne **51** compare la
somme des **218 du foyer**, *pas* la somme des 213, à **305 €**. La FAQ
emploie aussi l'expression « montant annuel brut des cessions et non les
plus-values » : cette formule oppose les **prix de cession** aux plus-values,
mais ne détaille pas les lignes 213/214/218. Pour distinguer frais et quotient,
le calcul suit les
**lignes explicites de la 2086**, sans déduire de cette seule formule que les
autres cessions du foyer sont connues. La lecture
des frais par l'ancien calcul JS/Python confondait brut et net : elle utilisait
le prix après frais dans le quotient, n'indiquait pas la ligne 214 et testait
le seuil sur un total improprement nommé 213. Correction de ces deux moteurs
et tests hors réseau ajoutés, sans valider pour autant les soultes, tous les
avoirs du foyer, la date d'effet du taux PS crypto ni l'ensemble des arrondis.
Une 2086 générée par l'application demeure une **estimation non exhaustive**.
Source : [formulaire et notice DGFiP 2086, revenus 2025](https://www.impots.gouv.fr/sites/default/files/formulaires/2086/2026/2086_5515.pdf).

**Lecteur FAQ crypto partiel (étape suivante, contrôle mobile nécessaire) :**
le bouton consulte aussi la [FAQ DGFiP sur les cessions d'actifs numériques](https://www.impots.gouv.fr/particulier/questions/comment-declarer-les-plus-ou-moins-values-sur-cessions-dactifs-numeriques)
lors de la vérification des revenus **2025**. Il exige une date de modification,
la section **gestion privée**, la décomposition du **PFU courant** en IR et PS
avec somme cohérente, la franchise de cessions du foyer, la **3CN indépendante
de l'option RCM** et la 2086/3AN/3BN. L'extrait public est recontrôlé en cache
local **par compte**, avec une nouvelle révision si la FAQ est rectifiée ; la
consultation pour 2025 est mémorisée séparément de l'**année d'effet**, qui
reste explicitement `null`. La mention « depuis 2023 » en tête de la FAQ
concerne la distinction vendeur privé/professionnel, **pas** la date d'effet
de son PFU actuellement affiché. Le bouton n'en déduit donc **aucun taux PS
crypto 2025**, n'écrase ni la R2 ni l'estimation embarquée et refuse de
l'attribuer à 2023, 2024 ou 2026. Un extrait actuel n'atteste ni l'ensemble
du portefeuille numérique du foyer ni la formule exhaustive de chaque 2086.
Les brochures millésimées recoupées plus haut sont un audit documentaire,
**pas encore une lecture automatique de leur PDF sur Android**. Aucun nouveau
SQL et aucune activation fiscale des taux crypto ; « Bascule DGFiP totale : non ».

**Lecteur RCM partiel (étape suivante) :** le bouton consulte désormais la
page DGFiP des revenus mobiliers **uniquement pour les revenus encaissés en
2025**. Il exige, dans la même section, la preuve du précompte lors de
l'encaissement en 2025 et la preuve séparée du taux sur l'avis 2026 pour les
revenus 2025 non précomptés. La date de modification de la page est conservée
comme métadonnée, **pas** comme date d'effet. Un extrait public est recontrôlé
au chargement, en cache local par compte/année, et une rectification de la
même année produit une nouvelle entrée sans effacer l'ancienne. Pour les
revenus 2023, 2024 et 2026, cette page courante n'est pas réutilisée :
« non disponible ». Le rapport peut afficher **17,2 % à l'encaissement en
2025** et **18,6 % sur l'avis 2026 si non précompté en 2025** seulement si
le lecteur reconnaît effectivement les deux passages sur le téléphone.
L'application **n'active aucun de ces taux RCM dans la simulation** : elle ne
connaît pas le produit précis ni le précompte effectif des éventuels revenus
externes du foyer. La mention de CSG 6,8 % est un indice conditionnel de la
page courante, non une vérification millésimée du calcul. R2 2025 reste
prioritaire ; « RCM par produit, précompte et date » demeure manquant dans
`couvertureDgfip`. **Contrôle sur téléphone confirmé avec l'APK `adc63f5` (14/10/2026)** : revenus 2025, les deux taux RCM et les dates distinctes sont lus et affichés comme preuve partielle ; aucune activation des taux RCM, R2 2025 toujours prioritaire. Ce retour ne renseigne pas le précompte personnel du foyer.

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
  Depuis la migration **013** (voir ci-dessous), elle reçoit aussi l'historique des
  **collectes DGFiP** du bouton de l'APK : onze sources documentaires, chacune avec
  l'adresse officiellement lue et les paramètres publics du document. Aucune donnée
  personnelle n'y entre, et une ligne historisée n'est **pas** une règle publiée :
  `pf2_fiscal_annees` reste insérable uniquement côté serveur.
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

## Migration 013 : historique des collectes DGFiP — **APPLIQUÉE par le propriétaire le 15/10/2026**

Constat au 16/10/2026 : les cinq lecteurs DGFiP de l'APK n'écrivaient **que dans le
`localStorage` de l'appareil**. La table `pf2_fiscal_collectes`, limitée par 009 puis
012 aux deux sources OpenFisca et à leurs deux adresses exactes, **refusait** toute
ligne DGFiP ; `pf2_fiscal_annees` n'est accessible à l'APK qu'en lecture. Une
réinstallation ou un changement d'appareil faisait donc perdre les preuves collectées.

[`migrations/013_collectes_dgfip.sql`](../migrations/013_collectes_dgfip.sql)
élargit les deux contraintes aux onze sources réellement lues par l'application,
chacune n'étant acceptée qu'avec son adresse officielle (hôte DGFiP exact en `https`,
chemin imposé, permalien BOFiP verrouillé sur la version lue ou adresse courte
`/doctrine/` de la version en vigueur). Les sources OpenFisca historiques restent
autorisées : aucune ligne existante ne devient orpheline.

**Ce que la migration ne fait pas** : elle ne publie aucune règle et n'active aucun
calcul ; elle n'autorise ni UPDATE ni DELETE (la table reste append-only, une
rectification crée la révision suivante) ; elle n'élargit pas la RLS (chaque compte
ne lit et n'écrit que ses lignes, `anon` n'a rien) ; elle ne touche pas à
`pf2_fiscal_annees`, dont l'écriture reste `service_role`.

**Exécutée par le propriétaire le 15/10/2026** dans Supabase SQL Editor, après
012. **Ne pas la rejouer**, comme 009, 010, 011, 012 et le SQL R2 2025. Le script
est rejouable sans perte (il ne supprime ni ne modifie aucune ligne), mais un rejeu
n'apporte rien.

La base accepte donc désormais les onze sources DGFiP — **et c'est vérifié en
conditions réelles, pas seulement en test** : voir « Retour réel du 15/10/2026 »
ci-dessous. L'écriture vient du module `js/fiscal_historique_supabase.js`, livré
par l'APK **2.2.3** puis corrigé en **2.2.4**.

**Vérifier soi-même, sans rien écrire** :
[`docs/VERIFIER-HISTORIQUE-COLLECTES-DGFIP.sql`](VERIFIER-HISTORIQUE-COLLECTES-DGFIP.sql)
est une sonde à coller dans Supabase SQL Editor. Elle ne contient **qu'un seul
`select`** (aucun mot-clé d'écriture ne survit à la suppression des commentaires et
des littéraux — c'est contrôlé par test), et n'affiche aucune donnée personnelle :
ni `user_id`, ni montant, ni adresse de document. Elle rend dix lignes :

| # | Contrôle | Avant 013 | Après 013 (15/10) | **Attendu maintenant** |
| --- | --- | --- | --- | --- |
| 1 | Migration 013 appliquée | NON | OUI | **OUI** |
| 2 | Sources DGFiP autorisées | 0 | 11 sur 11 | **11 sur 11** |
| 3 | Sources OpenFisca toujours autorisées | 2 sur 2 | 2 sur 2 | **2 sur 2** |
| 4 | Lignes de collecte DGFiP historisées | 0 | 0 | **17 ou plus** |
| 5 | Millésimes historisés | aucun | aucun | **2023, 2025** |
| 6 | Droits de l'APK sur l'historique | INSERT, SELECT | INSERT, SELECT | **INSERT, SELECT** |
| 7 | Droits de l'APK sur les règles publiées | SELECT seul | SELECT seul | **SELECT seul** |
| 8 | Tables fiscales sous RLS | 2 | 2 | **2** |
| 9 | Clés personnelles dans les lignes DGFiP | 0 | 0 | **0** |
| 10 | Détail par millésime (lignes, révision max) | aucune | aucune | **2025 : 11 ligne(s), rév. max 1** |

Les lignes 4 et 5 ne sont plus à deviner : le retour du téléphone sous APK 2.2.4
pour les revenus 2025 dit **« déjà historisé à l'identique »**, ce qui exige que les
11 documents soient présents dans la table et que chacun corresponde exactement à la
collecte du jour. Le millésime 2023 avait déjà annoncé « 6 document(s) historisé(s) »
le 15/10/2026. D'où 17 lignes au minimum — davantage si 2024 a été écrit depuis, ou
si des révisions ont été empilées avant la 2.2.4.

**La ligne 10 tranche ce que les lignes 4 et 5 ne peuvent pas trancher.** Elle rend
le nombre de lignes et la révision maximale par millésime, au format
`2023 : 6 ligne(s), rév. max 1 | 2025 : 11 ligne(s), rév. max 1`. Deux lectures :

- **rév. max 1 partout** : chaque millésime n'a été écrit qu'une fois, l'historique
  est propre.
- **rév. max 2 ou plus**, avec un nombre de lignes multiple de celui des documents
  lus : c'est la trace du défaut jsonb corrigé en 2.2.4. PostgreSQL réordonne les
  clés d'un `jsonb`, si bien qu'une comparaison naïve voyait « différente » une
  collecte strictement identique et recréait une révision à **chaque** clic. Ces
  doublons ne faussent aucun calcul — le moteur ne relit pas cette table — et ne
  peuvent pas être supprimés par l'APK, qui n'a que `INSERT, SELECT` sur une table
  volontairement append-only.

C'est la sonde, et non l'écran du téléphone, qui fait foi sur le contenu de la base.

### Retour réel du 15/10/2026 (APK 2.2.3) — ce qui a marché, ce qui a échoué

Premier clic réel du propriétaire après application de la 013. Résultat affiché par
l'écran Fiscalité :

| Millésime | Documents lus | Verdict |
| --- | --- | --- |
| Revenus 2023 | 6 | **6 document(s) historisé(s)** |
| Revenus 2024 | 6 | NON historisé |
| Revenus 2025 | 11 | NON historisé |
| Revenus 2026 | 0 | rien à historiser (correct) |

**Ce que ce retour prouve** :

- la migration 013 **est appliquée et fonctionne** : sans elle aucune source
  `dgfip_*` ne peut être écrite, or six lignes des revenus 2023 ont été acceptées ;
- la contrainte d'adresse **n'est pas la cause** des échecs 2024 et 2025. Les 23
  lignes réellement produites par les lecteurs (6 + 6 + 11), avec leurs vraies
  adresses extraites de `fiscal_dgfip_sources.url()`, `fiscal_frais_sources.KM()`
  et `repasUrl()`, `fiscal_regimes_sources.url()` et `urlPour()` des lecteurs PDF,
  ont été rejouées sur un PostgreSQL réel avec 009 → 013 : **toutes sont acceptées**.

**Ce que ce retour ne prouve pas** : la cause exacte des refus 2024 et 2025. Elle
est **inconnue**, et elle l'est restée à cause d'un défaut du module : le résumé
copiable disait « NON historisé, collecte conservée sur l'appareil » **sans le
motif**. Aucune hypothèse n'est donc avancée ici comme un fait.

**Quatre défauts réels, corrigés en 2.2.4** :

1. *Le résumé taisait la raison.* C'est ce qui a rendu le retour du 15/10
   inexploitable. La raison est maintenant reprise dans le résumé copiable, sans
   adresse, et le résumé reste sous 600 caractères.
2. *Tout refus était attribué à la migration 013.* Un conflit de révision (23505),
   une session expirée (401/403), une cadence refusée (429) ou un droit insuffisant
   (42501) ont des causes et des remèdes différents. Chaque code a son libellé, et
   la 013 n'est plus nommée que pour un refus de contrainte (23514).
3. *Aucun rejeu sur conflit.* Deux clics ou deux appareils peuvent lire la même
   dernière révision avant d'écrire : le second reçoit 23505. `fiscal_sources.js`
   relit et réessaie déjà deux fois pour OpenFisca ; ce module abandonnait tout le
   millésime. Il relit désormais la ligne gagnante et réessaie, sans jamais UPDATE,
   DELETE ni UPSERT.
4. *Une collecte identique était vue comme différente.* PostgreSQL `jsonb` **ne
   conserve pas l'ordre des clés** : une ligne écrite `{"quotient_familial":…,"document":…}`
   est relue `{"document":…,"quotient_familial":…}`. La comparaison par
   `JSON.stringify` brut concluait « différent », et **chaque clic aurait recréé une
   révision**. La comparaison est canonique (clés triées des deux côtés).

S'y ajoute un défaut d'honnêteté du compte rendu : un échec peut survenir **après**
des écritures réussies, qui restent en base (append-only). Le résumé le dit — « N
document(s) écrit(s), puis NON historisé — raison » — au lieu de laisser croire que
rien n'est parti.

Ces cinq points sont verrouillés par `tests/test_fiscal_historique_supabase.js`
(§10 à §14) : clés réordonnées par jsonb ⇒ « inchangée » et zéro révision fantôme,
conflit 23505 ⇒ relecture et réessai bornés sans doublon `(source, revision)`, six
messages d'erreur ⇒ six diagnostics distincts dont un seul nomme la 013, échec
partiel ⇒ les écritures réussies sont comptées, motif absent ⇒ « raison inconnue »
et jamais un silence.

### Retour réel sous APK 2.2.4 (revenus 2025) — le correctif jsonb validé en base

Ligne rendue par l'écran Fiscalité du téléphone, recopiée telle quelle :

> Revenus 2025 (déclaration 2026) — R2 publiée prioritaire. DGFiP : IR/décote/QF
> 3/3, frais salariés 3/3, PS titres lu. PDF : nouveautés CSG lu, notice 2086 lu,
> brochure crypto lu, RCM lu, charges/CSG lu. RCM personnels, PS crypto 2025 et
> déduction CSG du foyer non vérifiés ; aucun nouveau taux activé. Bascule DGFiP
> totale : non. **Supabase : déjà historisé à l'identique.**

« Déjà historisé à l'identique » est l'état `inchangée` du module. Il n'est atteint
que si trois conditions sont réunies : des lignes existent déjà pour ce millésime,
les 11 documents du jour ont chacun retrouvé leur ligne, et **leurs valeurs relues
depuis PostgreSQL ont été reconnues identiques** à celles recalculées.

**Ce que cette ligne prouve** :

- les 11 documents des revenus 2025 **sont écrits dans la base réelle** — ce n'est
  plus un résultat de test, c'est l'état de la table du propriétaire ;
- la lecture `SELECT` fonctionne sous RLS avec le rôle `authenticated` de l'APK ;
- le défaut n° 4 est corrigé **en conditions réelles**. Les valeurs relues viennent
  d'un `jsonb` dont PostgreSQL a réordonné les clés ; avec la comparaison naïve de la
  2.2.3 ce même clic aurait conclu « différent » et écrit une révision 2 pour les 11
  documents. Il n'a rien écrit. C'est exactement le comportement attendu.

**Ce que cette ligne ne prouve pas** :

- l'état des revenus **2024**. Le refus du 15/10 sous 2.2.3 n'a pas été re-reporté
  depuis, et sa cause reste **inconnue** — aucune hypothèse n'est avancée ici comme
  un fait. Sous 2.2.4 la raison est imprimée dans le résumé : le prochain clic la
  nommera.
- l'état des revenus **2023** au-delà de leur existence. Le clic du 15/10 a écrit 6
  documents ; si un second clic a eu lieu sous 2.2.3, le défaut jsonb a pu empiler
  une révision 2. Seule la **ligne 10 de la sonde** le dira (`rév. max`).
- la version d'APK exacte du téléphone. Le verdict `inchangée` existait déjà en
  2.2.3, mais il y était pratiquement inatteignable pour un millésime déjà écrit,
  précisément à cause du défaut n° 4. Ce retour est donc une forte présomption de
  2.2.4, pas une preuve.

Les revenus 2026 restent à « rien à historiser » : aucun document du millésime 2026
n'est publié, et rien n'est inventé.

Les lignes 6 à 9 sont des garde-fous : si l'une d'elles bouge, la sécurité de la
table a changé et il faut s'arrêter. La sonde est elle-même verrouillée par
`tests/test_verifier_collectes_dgfip.py`, qui la rejoue sur un PostgreSQL réel dans
les deux états (avant / après 013), y compris avec une écriture réelle de l'APK sous
RLS, et qui exige que sa liste de sources reste **identique** à celle de la
contrainte de la 013 (sinon une douzième source serait ignorée en silence).

### Livraison : 2.2.2 → 2.2.3 → 2.2.4

Le workflow `apk.yml` se déclenche sur tout push modifiant `app/**`, et publie la
release **depuis `main` seulement**. Or la release est **unique et immuable** : si
`apk-2.2.2` existe déjà avec un APK de SHA256 différent, l'étape de publication
fait `exit 1`. La PR #24 modifie neuf fichiers sous `app/` : la fusionner sous la
version 2.2.2 aurait donc **fait échouer la construction sur `main`**, sans APK
installable à la clé.

La version est donc passée à **2.2.3 (code 33)**, puis à **2.2.4 (code 34)** après
le retour réel du 15/10 — la 2.2.3 étant déjà installée sur le téléphone, il faut
un code supérieur pour que les deux APK se distinguent. Les cinq endroits imposés
par la procédure du dépôt sont alignés (`AndroidManifest.xml`, `apk.yml`
`VERSION_NAME` et `VERSION_CODE`, `build.sh`, `core/__init__.py`), avec
`telechargements/notes-2.2.4.md` et le nom d'artefact.

**Conséquence à connaître avant de fusionner** : la fusion de la PR #24 construira
puis **publiera automatiquement la release `apk-2.2.4`**. C'est le comportement
normal du workflow (la 2.2.2 a été publiée ainsi), mais c'est bien une publication
définitive : aucun écrasement n'est possible ensuite.

Un verrou manquait et a été ajouté dans `tests/test_livraison_securisee.js`
(« Cohérence de la livraison ») : la version est **lue dans le workflow**, jamais
recopiée dans le test, puis le fichier de notes, le nom d'artefact, le manifeste,
`build.sh` et `core/__init__.py` doivent tous la porter. Sans ce verrou, un
`--notes-file` pointant vers un fichier absent n'aurait échoué **qu'au moment de la
publication sur `main`**, c'est-à-dire après la fusion.

Côté application, l'écriture est faite par `js/fiscal_historique_supabase.js`
(`PF.fiscalHistorique`), appelé par le bouton de collecte après le rechargement des
caches, un millésime après l'autre. Le détail de ce qui s'écrit et de ce qui ne
s'écrit pas est dans
[`MATRICE-COUVERTURE-FISCALE-2023-2026.md`](MATRICE-COUVERTURE-FISCALE-2023-2026.md) §7.7.
Deux jeux de tests la verrouillent : `tests/test_fiscal_sql_dgfip.py` (009 → 013
rejouées sur un PostgreSQL embarqué, adresses inventées refusées, append-only, RLS
inchangée) et `tests/test_fiscal_historique_supabase.js` (hors réseau, avec contrôle
de **parité** entre les lignes produites par le module et les contraintes du SQL).

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

---

## Matrice de couverture par millésime et catégorie (14/10/2026)

`app/src/main/assets/www/js/fiscal_couverture.js` calcule, pour les revenus
**2023, 2024, 2025 et 2026**, le statut de chaque catégorie : `établi` (texte
DGFiP du millésime), `recoupement` (dérivation documentée d'au moins deux textes,
jamais activée), `partiel` (document lu, portée insuffisante) ou `non disponible`.
Les trois dates sont séparées : **année des revenus**, **année de déclaration**,
**date de publication du document**.

Une constante embarquée dans le code n'est jamais une preuve : sans collecte, les
52 cases (4 millésimes × 13 catégories) sont « non disponible ». `basculeComplete`
n'est vrai que si toutes les cases sont « établi » ; un recoupement ne suffit pas.
Aujourd'hui : **bascule DGFiP totale : non**.

Les catégories qui ne peuvent pas être établies par un document public — plafonds
QF particuliers, RCM personnels (produit, précompte réel, option 2OP du foyer,
2CG/2BH/2DF), CSG déductible personnelle, exhaustivité de la 2086 du foyer,
changements de formule et arrondis — restent affichées « non disponible » ou
« partiel », jamais comme une estimation officielle.

Trois garde-fous du foyer sont ajoutés (`fiscal_gardes_foyer.js`) :

- `csgDeductible6DE()` : la part 6,8 % × (2BH + 2DF) est calculée
  automatiquement par l'administration ; un 6DE qui la contient est **bloqué**
  comme double compte. Aucun montant n'est produit sans saisie personnelle, donc
  jamais à partir de la seule lecture des brochures.
- `portee2086Foyer()` : `certifieFoyer` reste `false`. Seule l'inférence à sens
  unique est admise — un total du seul portefeuille supérieur à 305 € exclut
  l'exonération du foyer, un total inférieur ne la prouve pas. Les options 3CN et
  2OP restent distinctes.
- `casParticuliersQF()` : un cas particulier déclaré, ou une demi-part non
  expliquée par la règle générale, bloque le bilan et la recommandation 2OP.

`PROVENANCE_PS` qualifie chaque taux de PS embarqué ; pour 2026 il dit
explicitement « reconduction de 2025 … non établi », et `verifierMaj` l'affiche.

Détail des sources, passages probants, contradictions et tests :
**`docs/MATRICE-COUVERTURE-FISCALE-2023-2026.md`**.

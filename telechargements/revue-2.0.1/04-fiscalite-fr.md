# 04 — Rapport fiscalité française

**Version examinée :** 2.0.1 · HEAD `7be0e11` · 09/10/2026. Les constats sont une revue de logiciel, pas un avis fiscal individuel. Les lois et instructions sont citées pour les règles de calcul; les cas dépendant du broker ou du foyer doivent être validés avec un professionnel.

## T-01 — Repli FX silencieux vers le montant étranger brut dans la 2074 et la 2086

**Sévérité : MAJEUR · Effort : M**

**Preuve / scénario :** `core/tax.py:699-702` et `:846-850` attrapent `FXIndisponible` et posent `net_eur=t.montant_net`, sans conversion ni anomalie ajoutée. Un montant de 1 000 USD peut ainsi entrer comme 1 000 EUR dans PRU, prix de cession et formulaire. Le miroir JS ne fait pas cela : `app/src/main/assets/www/js/fiscal.js:356-382` renvoie `null` si le taux manque et la 2074 devient indisponible (`:494-496`).

**Correctif proposé :** une erreur FX doit produire « calcul indisponible » côté Python comme côté JS; journaliser devise/date/ticker, permettre d’importer un taux officiel vérifié, et ne jamais poursuivre en EUR avec le brut étranger. Ajouter des fixtures avec devise non-EUR et FX absent. Effort M.

## T-02 — 2086 incomplet si le foyer détient des crypto-actifs hors du journal suivi

**Sévérité : MAJEUR · Effort : M**

**Preuve / scénario :** `detail_2086_de_lannee()` reçoit uniquement `transactions` (`core/tax.py:822-835`), construit ses quantités depuis ces transactions (`:837-864`) et calcule la valeur globale depuis ce dictionnaire (`:859-871`). Il n’existe dans la signature ni inventaire par portefeuille externe, ni valeur manuelle par actif/date. En plus, les exceptions de cours ou de FX pour les autres actifs sont ignorées par `except Exception: pass` (`:866-871`).

L’article 150 VH bis III-C définit la valeur globale comme la somme des crypto-actifs détenus par le cédant avant la cession. Scénario : BTC suivi dans l’application, ETH détenu sur une autre plateforme/wallet non importé; le dénominateur 2086 ne comprend pas l’ETH. Une erreur Yahoo historique peut produire la même omission sans rendre le calcul indisponible. Le miroir JS signale certains prix/taux manquants (`fiscal.js:543-548,567-582,602`).

**Correctif proposé :** importer/agréger l’inventaire complet du foyer par date, intégrer les portefeuilles externes et les actifs non gérés par l’application; bloquer le résultat si une valeur manque, au lieu de l’ignorer. Exposer la liste des sources et des positions omises. Effort M à L selon les connecteurs.

**Référence :** [CGI, article 150 VH bis](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000050366751); [Impôts.gouv.fr, déclaration des actifs numériques](https://www.impots.gouv.fr/particulier/questions/comment-declarer-les-plus-ou-moins-values-sur-cessions-dactifs-numeriques).

## T-03 — Vente incohérente rejetée par le portefeuille mais calculée par la fiscalité

**Sévérité : MAJEUR · Effort : M**

**Preuve / scénario :** le formulaire vérifie quantité positive mais ne compare pas à la position (`app/src/main/assets/www/js/app.js:858-883`). Le moteur portefeuille signale et ignore une vente sans position ou supérieure au stock (`core/portfolio.py:428-445`); Streamlit affiche alors des chiffres partiels (`app.py:66-79`). La 2074 continue si le solde de titres est simplement positif, calcule PRU et plus-value pour toute la quantité vendue, puis remet le stock à zéro (`core/tax.py:708-729`). 2086 a la même absence de garde sur les quantités vendues (`:851-886`).

**Scénario :** 10 titres détenus, vente erronée de 12; le portefeuille ignore l’opération, mais le détail fiscal peut afficher une cession et une plus-value sur 12. La continuité du snapshot malgré des transactions incohérentes est un choix de résilience intentionnel; le défaut est que le moteur fiscal n’applique pas la même invalidation.

**Correctif proposé :** un seul validateur chronologique partagé qui rejette la vente excessive dans les deux moteurs; l’écran fiscal doit être marqué incomplet et ne pas produire de cases copiables tant qu’une anomalie non résolue touche l’année. Ajouter un test de vente 10/12 côté Python et JS. Effort M.

## T-04 — L’actif `or_physique` est mappé en or papier côté Python; le régime optionnel est choisi automatiquement

**Sévérité : MAJEUR · Effort : M**

**Preuve / scénario :** `core/models.py:542-550` mappe `or_physique` vers `Classe.OR`, tandis que `Classe.OR_PHYSIQUE` existe et que le chemin 150 VI n’est appelé que si cette classe apparaît (`core/tax.py:653-654`). La 2074 inclut `Classe.OR` (`core/tax.py:686-729`). Le JavaScript conserve `or_physique` (`app/src/main/assets/www/js/models.js:295-304`) : nouveau désaccord entre moteurs.

Même si le routage est corrigé, `pv_or_physique()` retient automatiquement le moindre montant TFMP/plus-value (`core/tax.py:367-425`) alors que CGI 150 VL pose une option sous condition de justifier la date et le prix d’acquisition, ou une détention >22 ans. Le calcul moyenne les taux d’abattement par nombre de cessions (`:384-406`) au lieu de les appliquer à leurs plus-values individuelles. Exemple du code : gain 900 € avec abattement 5 % et gain 100 € avec abattement 90 %; moyenne simple 47,5 %, contre 13,5 % pondéré par les gains. Le régime B obtenu n’est pas le bon.

**Correctif proposé :** rétablir la classe physique dans le mapping Python; séparer la TFMP par défaut et l’option pour le régime des plus-values de l’article 150 VL, demander la preuve requise; appliquer les abattements au gain de chaque lot/cession avant agrégation et tester les cas limites. Effort M.

**Référence :** [CGI, article 150 VL](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000028429020).

## T-05 — Le calcul des repas ne contrôle pas l’éligibilité ni la part employeur des titres-restaurant

**Sévérité : MAJEUR · Effort : M**

**Preuve / scénario :** `core/fiscal_bars.py:369-382` calcule simplement `jours × forfait`; `pages/4_Fiscalite.py:202-205,227-236` préremplit 240/200 jours. Aucun champ ne demande la participation employeur des titres-restaurant, si un repas collectif est disponible, les justificatifs/prix réel ou la contrainte de ne pas pouvoir rentrer. L’article officiel précise que seuls les frais supplémentaires sont déductibles et qu’il faut soustraire la part financée par l’employeur des tickets. Pour des justificatifs, la base correspond à la différence avec la valeur du repas à domicile; sans justificatifs détaillés, un forfait peut s’appliquer sous conditions.

La valeur unitaire elle-même est millésimée (5,45 € en 2025; le BOFiP consulté publie 5,50 € en 2026 dans le contexte BNC, à ne pas transposer sans vérification à tous les régimes), mais le moteur réduit ces situations différentes à un nombre de jours.

**Correctif proposé :** formulaire annuel de justification (jours éligibles, cantine, prix/justificatifs, participation employeur); appliquer la bonne méthode/les plafonds selon situation, produire une liste d’hypothèses avant la case 1AK/1BK. Sources versionnées par année. Effort M.

**Références :** [Impôts.gouv.fr, frais de repas](https://www.impots.gouv.fr/particulier/frais-de-repas); [BOFiP, évaluation 2026](https://bofip.impots.gouv.fr/bofip/4628-PGP.html/identifiant=BOI-BNC-BASE-40-60-60-20260218).

## T-06 — Le taux social 2025 n’est pas déterminé par régime/assiette dans le calcul

**Sévérité : MAJEUR · Effort : M**

**Preuve / scénario :** `core/fiscal_bars.py:162-178` retient 17,2 % pour 2025 et consigne pourtant l’incertitude : 18,6 % peut s’appliquer à des revenus relevant de L.136-6, contre une date différente pour L.136-7. `taux_ps(année)` est partagé par plusieurs régimes (`core/tax.py:245,337,456-466`). La page affiche l’incertitude (`pages/4_Fiscalite.py:126-127`) mais le calcul final ne demande ni courtier/précompte ni choix du taux; la note du code indique que le cas Swissquote peut relever de l’assiette patrimoine (`fiscal_bars.py:140-156`). Écart possible : 1,4 point de prélèvements sociaux sur la base concernée.

**Correctif proposé :** paramétrer le taux par nature juridique du revenu et année de réalisation, broker/précompte et texte applicable; afficher les deux résultats si la qualification reste incertaine, plutôt qu’un seul total calculé avec le taux « prudent ». Demander validation avant toute valeur destinée à la déclaration. Ce constat concerne surtout la réexécution/validation historique des revenus 2025 (déclaration déposée en 2026); pour les revenus 2026, le code retient 18,6 %. Effort M.

**Références :** [LFSS 2026, article 12](https://www.legifrance.gouv.fr/jorf/article_jo/JORFARTI000053226452), [CSS L.136-6](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000051218166), [CSS L.136-7](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000047288474). La qualification est à valider pour chaque cession; le rapport ne tranche pas une situation individuelle.

## T-07 — Le profil fiscal annuel est enregistré comme un profil permanent

**Sévérité : MAJEUR · Effort : M**

**Preuve / scénario :** la page sélectionne une année, mais sauvegarde les salaires, intérêts, kilomètres et repas dans des clés sans millésime (`pages/4_Fiscalite.py:165-172,276-298`). Changer le millésime peut réutiliser les revenus du dernier formulaire; les mêmes montants ne représentent pas automatiquement les années antérieures/suivantes. Des valeurs par défaut personnelles sont utilisées si la config manque (`:165-167`).

**Correctif proposé :** séparer `identité foyer` (stable) et `déclaration annuelle` (revenus, intérêts, frais, dons, comptes étrangers, justificatifs); associer explicitement chaque champ à une année et demander une confirmation « données de l’année N ». Prévoir l’import des documents officiels plutôt que réutiliser silencieusement N-1. Effort M.

## T-08 — La veille des barèmes peut afficher « à jour » si la sonde réseau échoue; la mise à jour reste manuelle

**Sévérité : MAJEUR · Effort : M**

**Preuve / scénario :** `core/fiscal_bars.py:454-501` interroge data.gouv.fr, attrape toute exception à `:487-489`, puis retourne `disponible: False` et « Aucune nouvelle version en attente » à `:493-501`. Quand les années ne déclenchent pas déjà un avertissement, une panne/timeout devient donc un état vert, pas un état « inconnu ». La page propose ensuite de copier un prompt dans Arena pour générer le fichier (`pages/4_Fiscalite.py:100-124`); aucun téléchargement/versionnement/validation automatisés du texte fiscal ne sont faits par l’application.

**Correctif proposé :** états distincts `à jour`, `nouvelle version`, `sonde indisponible`; conserver date, source et millésime contrôlé. Produire des données fiscales versionnées depuis Légifrance/BOFiP/DGFiP avec tests par année et une validation humaine tracée. Le prompt IA peut assister, mais ne doit pas être la chaîne de mise à jour ni la source d’autorité. Effort M.

## Références officielles complémentaires

- CGI, actifs numériques : [article 150 VH bis](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000050366751); régime de l’option sur les biens précieux : [article 150 VL](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000028429020).
- Taux d’actifs numériques 2026 et seuil des 305 € : [Impôts.gouv.fr](https://www.impots.gouv.fr/particulier/questions/comment-declarer-les-plus-ou-moins-values-sur-cessions-dactifs-numeriques).
- Barème kilométrique officiel 2026 (les montants actuels du code ne sont pas déclarés erronés ici) : [notice 2041-ALK-AUTO 2026](https://www.impots.gouv.fr/sites/default/files/formulaires/2041-alk-auto/2026/2041-alk-auto_5512.pdf).

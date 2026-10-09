# 07 — Rapport autonomie, dépendances et fragilité à 40 ans

**Version examinée :** 2.0.1 · HEAD `7be0e11` · 09/10/2026. « Autonomie 40 ans » est ici un objectif de conception, pas une promesse de compatibilité jusqu’en 2066. Le plan d’automatisation exécutable et priorisé est le rapport [08](08-plan-autonomie-40-ans.md).

## L-01 — Les règles fiscales ne sont pas mises à jour par une chaîne autonome

**Sévérité : MAJEUR · Effort : M**

**Preuve / scénario :** les barèmes sont des tables statiques (`core/fiscal_bars.py:55-109,162-178,275-306`). La sonde data.gouv.fr ne compare pas les valeurs officielles; elle cherche des millésimes dans un titre (`:454-491`) et ignore ses erreurs (`:487-489`). La page ouvre un assistant externe et demande de copier/coller un prompt pour générer le fichier Python (`pages/4_Fiscalite.py:100-124`, `core/fiscal_bars.py:505-520`). Les montants de repas et les plafonds 10 % sont également des constantes annuelles (`:283-306`).

**Impact à 40 ans :** chaque loi de finances, seuil social, repas et frais kilométrique exige une intervention manuelle. La détection peut annoncer « à jour » quand la source est simplement inaccessible. Un nouveau mainteneur doit connaître le workflow Arena et vérifier lui-même les valeurs.

**Correctif proposé :** données annuelles séparées du code, avec année de revenus, date d’effet, textes officiels, URL/version, checksum et statut provisoire/définitif; bot qui compare et ouvre une PR de données avec tests de référence. Une validation fiscale humaine est obligatoire avant adoption; échec réseau = statut inconnu. Effort M.

## L-02 — Les paramètres personnels changent avec l’année, mais n’en portent aucune

**Sévérité : MAJEUR · Effort : M**

**Preuve / scénario :** `pages/4_Fiscalite.py:276-298` sauve salaires, intérêts, kilomètres, CV et jours repas sous des clés globales (`f_s1`, `f_int_net`, `f_k1`, `f_r1`…), alors que la page a sélectionné une année (`:165-172` et appel de `simuler_foyer_complet` `:303-326`).

**Impact :** l’application ne peut ni reconstituer une déclaration passée, ni savoir si les données d’un nouveau millésime ont été confirmées; après plusieurs années, un champ vieux de 3 ans peut rester en place sans marqueur de fraîcheur. L’utilisateur doit refaire lui-même le contrôle chaque année.

**Correctif proposé :** fiche par année pour toutes les valeurs qui peuvent varier, avec source/document, statut confirmé et date de validation; conserver séparément les éléments stables du foyer. Une liste de vérification annuelle automatisée signale les champs encore hérités, sans reporter automatiquement une valeur ancienne comme certaine. Effort M.

## L-03 — Les valeurs de frais annuelles ne sont pas toutes versionnées avec le même contrat

**Sévérité : MAJEUR · Effort : M**

**Preuve / scénario :** `BAREME_KM_VOITURE` est un dictionnaire sans clé d’année (`core/fiscal_bars.py:270-281`); `forfait_repas_de()` renvoie la dernière valeur connue pour toute année absente (`:310-314`), et `abattement_10_salaire()` utilise également le plancher/plafond de la dernière année si le millésime manque (`:317-329`). La page refuse les années absentes du barème IR, mais si une nouvelle année est ajoutée à `BAREMES` sans compléter ces tables, certains calculs continueront avec la valeur précédente. Les coefficients 5 CV vérifiés dans le formulaire officiel 2026 concordent; le constat porte sur l’absence de versionnement et le fallback futur, pas sur une erreur de taux prouvée pour 2026.

**Correctif proposé :** faire échouer en « année non publiée » plutôt que reprendre silencieusement la dernière valeur; une table `valeur × année de revenus × source` et des tests de couverture des dictionnaires doivent rendre impossible l’ajout partiel d’un millésime. Effort M.

## L-04 — Le fournisseur de marché ne garantit pas la conservation à long terme des données

**Sévérité : MAJEUR · Effort : M**

**Preuve / scénario :** `core/prices.py:21-22,243-323` utilise `yfinance`; `core/fx.py:21,100-127` interroge aussi Yahoo. Les tables Supabase `pf2_cours`/`pf2_fx` sont écrites mais aucune lecture n’a été trouvée dans les chemins applicatifs (détail [01](01-programmeur.md)). Les tests « ticker connu » sont live (`tests/test_tickers_yahoo.py:99-129`). Un ticker renommé, endpoint bloqué ou règle d’accès changée peut supprimer cours et historiques, même si la tâche planifiée avait écrit un cache.

**Correctif proposé :** interface de fournisseurs versionnée, source primaire documentée et sous licence, source de secours indépendante, cache persistant réellement lu avec `as_of/source/qualité`, import de relevés broker et export brut des valeurs historiques. Aucune source de marché unique ne doit être présentée comme garantie sur 40 ans. Effort M.

## L-05 — Le fichier INSEE change de base mais sa provenance écrite reste codée « base 2025 »

**Sévérité : MINEUR · Effort : S**

**Preuve / scénario :** `jobs/update_inflation.py:175-182` choisit dynamiquement `max(BASE_PER)`; cependant la colonne `source` créée à `:243-249` encode textuellement « IPC base 2025 ». Si l’INSEE rebase le jeu en 2030, les nouvelles valeurs seront extraites d’une base différente mais annotées « base 2025 ». Le ratio annuel peut rester invariant au rebasing, mais la provenance enregistrée serait fausse. Le job télécharge le grand fichier Mélodi à chaque exécution (`:117-129,211-235`) et s’exécute dans le workflow quotidien (`.github/workflows/daily.yml:53-65`).

**Correctif proposé :** conserver le `BASE_PER` réellement retenu dans le résultat et la source; loguer URL/date/hash du jeu, vérifier les mois et les valeurs; utiliser cache HTTP/ETag ou extraction ciblée pour éviter de rapatrier le fichier complet chaque soir. Effort S à M.

## L-06 — Dépendances Python réinstallées depuis des plages ouvertes, sans environnement verrouillé

**Sévérité : MAJEUR · Effort : M**

**Preuve / scénario :** `requirements.txt` contient plusieurs dépendances seulement bornées vers le bas (`streamlit>=1.32`, `numpy>=1.24`, `supabase>=2.3`); chaque job CI installe ces résolutions du jour (`.github/workflows/tests.yml:18-24`, `.github/workflows/daily.yml:27-65`). `yfinance` est limité à `<2`, pandas à `<3`, mais le lock complet/transitif n’est pas conservé dans ce fichier. Une nouvelle résolution peut changer API, résultats ou format en dehors d’une modification du code; cela complique la reproductibilité d’un calcul à long terme.

**Correctif proposé :** lockfile généré/reproductible avec hash des packages, automatisation des mises à jour de dépendances par PR, matrice de tests, suivi des versions supportées et archivage de l’environnement de chaque release. Effort M.

## L-07 — L’historique dépasse rapidement la limite de lecture avant la limite des 40 ans

**Sévérité : MAJEUR · Effort : M**

**Preuve / scénario :** aucun des lecteurs Supabase ne pagine (`core/db.py:187-190`, Android `net.js:346-351`); la limite standard documentée est 1 000 lignes. Avec un point quotidien, le lecteur ne peut pas parcourir 40 ans (~14 610 snapshots) et dépasse 1 000 en moins de trois ans. Détail et correction dans [05](05-integrite-donnees.md).

**Correctif proposé :** pagination et stockage archival par partition/année, avec tests d’import/lecture sur un jeu de 15 000 lignes; calculs incrémentaux vérifiables au lieu de tout recharger sur le téléphone. Effort M.

## Conclusion de longévité

Les sources officielles (INSEE, DGFiP/BOFiP, Légifrance) sont disponibles aujourd’hui, mais elles ne sont pas toutes interrogées avec une provenance versionnée et la plupart des règles fiscales restent à mettre à jour manuellement. Les comptes, cours, devise, snapshots, taux et hypothèses n’ont pas encore les marqueurs complets de fraîcheur, de source et de millésime nécessaires pour pouvoir refaire un calcul en 2066. Le plan [08](08-plan-autonomie-40-ans.md) propose l’ordre d’automatisation et les critères de validation.

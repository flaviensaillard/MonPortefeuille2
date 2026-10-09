# 01 — Rapport programmeur : architecture et qualité d’exécution

**Version examinée :** 2.0.1 · **HEAD :** `7be0e11` · 09/10/2026. Lecture seule; aucun code, test ou workflow modifié. Sévérités et efforts définis dans [la synthèse](00-SYNTHESE.md).

## P-01 — Deux moteurs de calcul, deux chemins réseau, une base commune

**Sévérité : MAJEUR · Effort : L**

**Preuve / scénario :** la WebView charge ses modules `models.js`, `net.js`, `metrics.js`, `fiscal.js`, `views.js` (`app/src/main/assets/www/index.html:58-70`) et appelle un pont Java qui réalise lui-même des requêtes réseau (`app/src/main/java/com/portefeuille/app/NativeBridge.java:40-46,81-124`). L’application Streamlit appelle les modules Python (`core/session.py:411-465`, `core/db.py:187-190`). Les deux moteurs implémentent donc séparément prix/FX, performance, données et fiscalité, tout en écrivant/lisant des tables Supabase communes.

Les divergences ne sont pas théoriques : Python substitue un montant étranger brut si le FX manque (`core/tax.py:699-702,846-850`) alors que le miroir JS rend la 2074 indisponible (`app/src/main/assets/www/js/fiscal.js:356-382,494-496`). Le mapping Python associe `or_physique` à `Classe.OR` (`core/models.py:542-550`) alors que le modèle JS conserve la classe `or_physique` (`app/src/main/assets/www/js/models.js:295-304`). Les valeurs par défaut de revenus diffèrent également : Streamlit `pages/4_Fiscalite.py:165-167` contre WebView `app/src/main/assets/www/js/store.js:19-31`.

**Risque :** deux écrans présentant le même calcul peuvent fournir des chiffres fiscaux différents, sans contrat de parité ni version de calcul partagée. Toute règle annuelle doit être reproduite et vérifiée deux fois.

**Correctif proposé :** choisir un moteur canonique derrière une API/versionnée, ou définir des vecteurs de référence JSON communs aux deux runtimes (mêmes entrées, même sortie, mêmes erreurs et arrondis) et les lancer dans les deux suites à chaque PR. Centraliser aussi le schéma et les règles d’unités. Une migration vers un seul moteur est L; commencer par les tests différentiels est M.

## P-02 — Cache quotidien cours/FX annoncé comme consommé, mais non lu

**Sévérité : MAJEUR · Effort : M**

**Preuve / scénario :** `jobs/update_market_data.py:3-5` affirme que l’application lit `pf2_cours`/`pf2_fx`; le job les écrit aux lignes 88-108. La recherche de références dans les fichiers suivis ne trouve que la définition, le contrôle de schéma, les tests et ces écritures — aucun `select` de ces tables dans les chemins applicatifs. Au contraire, `core/prices.py:269-299` et `core/fx.py:100-120` interrogent directement Yahoo; le client Android fait de même via `net.js`. `.github/workflows/daily.yml:38-51` rend le snapshot dépendant du succès du job marché.

**Scénario :** le cache Supabase existe et est actualisé, mais Yahoo tombe ensuite en panne : l’application ne relit pas le cours déjà stocké et peut afficher une valorisation partielle. Inversement, une erreur du job marché empêche le job snapshot même si celui-ci pouvait tenter sa propre valorisation.

**Correctif proposé :** rendre les caches datés réellement consommables avec une fraîcheur explicite, vérifier symbole/devise/date et distinguer « cours récent » de « dernier cours connu ». Ajouter un fournisseur secondaire et garder le comportement fail-closed si aucun taux fiable n’existe. Aligner la description du job avec le comportement réel. Effort M.

## P-03 — La CI n’exécute pas l’une des trois suites JS de non-repli FX

**Sévérité : MINEUR · Effort : S**

**Preuve / scénario :** `.github/workflows/tests.yml:25-35` lance `test_js.js`, `test_comptes.js` et les tests du worker; il ne lance pas `tests/test_taux_absent.js`. Cette suite existe, décrit explicitement les absences de taux à couvrir (`tests/test_taux_absent.js:1-7`) et a passé **34/34** lors du contrôle local de cette revue. Les pushes directs qui ne ciblent pas `main` ne déclenchent pas non plus le bloc `push` (`tests.yml:8-12`), sauf lancement manuel; les PR restent couvertes.

**Risque :** le garde-fou le plus directement lié au faux taux n’est pas une barrière CI durable. Une régression peut être poussée sur une branche sans exécution automatique.

**Correctif proposé :** ajouter la suite 34 tests au workflow et vérifier le déclenchement sur les branches de travail, sans retirer les tests existants. Effort S.

## P-04 — La suite Python dite « sans réseau » contient des tests Yahoo live

**Sévérité : MAJEUR · Effort : M**

**Preuve / scénario :** `.github/workflows/tests.yml:1-4` affirme que les tests ne touchent jamais le réseau, mais `tests/test_tickers_yahoo.py:107-121` appelle réellement `prices.cours()` pour plusieurs tickers Yahoo. Le run précédent dans le sandbox a produit 14 échecs de connexion SSL Yahoo, alors que **625 tests Python passaient et 2 étaient ignorés**. Ces erreurs réseau ne démontrent pas de régression de calcul; elles contredisent néanmoins le contrat d’un test hors réseau et peuvent rendre la CI non reproductible.

**Correctif proposé :** déplacer ces vérifications dans un test d’intégration explicitement opt-in (ou planifié, avec statut séparé); injecter/mocker le transport dans les tests unitaires. En CI bloquante, ne tester que des réponses figées et les règles de traduction/cache. Effort M.

## P-05 — Deux parseurs indépendants du fichier IPC Mélodi

**Sévérité : MINEUR · Effort : M**

**Preuve / scénario :** Python exige les colonnes sélectrices et `BASE_PER`, sinon lève une erreur (`jobs/update_inflation.py:148-154`), et choisit la base récente (`:175-182`). Le parseur Java parcourt le CSV et ne rend obligatoires que période et valeur (`NativeBridge.java:326-334`); les filtres de dimensions ne s’appliquent que si leurs indices existent (`:356-379`), idem pour la base. Si l’INSEE modifie l’en-tête, Python échoue clairement tandis que Java peut accepter des lignes sans filtrage et renvoyer une série plausible.

**Correctif proposé :** partager un fichier de référence/fixtures et des résultats attendus entre parseurs; en Java, exiger les mêmes dimensions et la base, vérifier la continuité des mois et renvoyer une erreur explicite si un filtre manque. Effort M.

## P-06 — Les entrées fiscales par défaut divergent selon l’écran

**Sévérité : MINEUR · Effort : S**

**Preuve / scénario :** Streamlit initialise des salaires/intérêts à `32 473`, `29 772` et `200` euros (`pages/4_Fiscalite.py:165-167`) tandis que l’Android démarre ces trois entrées à zéro (`app/src/main/assets/www/js/store.js:19-31`). Sur une base fraîche ou des paramètres non synchronisés, le même foyer n’obtient pas le même simulateur.

**Correctif proposé :** une source persistée commune; à défaut, mêmes valeurs de défaut neutres et état « à renseigner » plutôt qu’une simulation préremplie silencieusement. Effort S.

## État des contrôles

Les trois tests JavaScript requis ont passé 90/90, 79/79 et 34/34 lors du run déjà réalisé. Les erreurs Yahoo Python sont conservées séparément et ne sont pas classées comme défauts de calcul. `test_rendu.js` n’a pas été exécuté faute de `jsdom`; il n’est pas compté dans les trois suites ci-dessus. Aucun test n’a été modifié ni relancé pour produire ce rapport.

# MonPortefeuille 2

Application de suivi de portefeuille construite sur les mêmes bases que la v1 —
**Streamlit, Supabase, GitHub Actions** — avec la mécanique de calcul corrigée et
les tâches répétitives automatisées.

Le portefeuille suivi est celui de l'**Université de l'Épargne**, et les indicateurs
sont choisis pour refléter la méthode de Charles Gave plutôt que les conventions de
la finance de marché.

---

### Guides pas à pas (aucune connaissance technique requise)

| Guide | Pour quoi |
|---|---|
| **`GUIDE-IA-ANALYSE-LONG-TERME.md`** | **Changer la façon dont l'IA répond** : horizon retraite 2055, analyse au lieu de citation, recherche extérieure |
| `GUIDE-INDEXATION-PAS-A-PAS.md` | Mettre le corpus dans l'IA et suivre l'avancement, jour par jour |
| `INSTALLATION-IA-EN-LIGNE.md` | Brancher le service IA (Cloudflare, clés, application) |
| `QUOI-FAIRE.md` | Ce qui reste à décider ou à vérifier sur les données |

---

## L'assistant (dossier `ia/`)

Le service Cloudflare (`ia/worker`) répond en **trois paragraphes imposés** :
« Selon le corpus, … », puis « En me basant sur tes données, sur le corpus et
sur les informations extérieures que j'ai trouvées, … », puis « Ce qui dépend de
toi : … ». Il confronte le corpus du porteur à ses agrégats et à des sources
trouvées sur le web, et replace chaque réponse dans l'horizon de long terme
(départ à la retraite en 2055, modifiable).

- les règles en clair : `ia/REGLES.md` ;
- le trajet d'une question : `ia/ARCHITECTURE.md` ;
- ce qu'il faut copier chez Cloudflare, étape par étape :
  `GUIDE-IA-ANALYSE-LONG-TERME.md` ;
- les tests du service : `node ia/tests/test_worker.mjs`.

---

## Ce qui change par rapport à la v1

La v1 fonctionnait, mais six défauts faussaient ses résultats. Ils sont tous
corrigés, et chacun est verrouillé par un test.

| # | Défaut de la v1 | Correction |
|---|---|---|
| 1 | L'assiette de rééquilibrage ignorait les `🏦 Cash réserve` (12 277 €, 13 % du patrimoine). Toutes les dérives affichées étaient fausses. | Le périmètre est porté par le modèle : `INVESTI` / `PRECAUTION` / `COURANT`. L'épargne de précaution est exclue *pour une raison énoncée*, pas oubliée par un filtre de type. |
| 2 | `TG_Score TWR %` était une copie littérale de `Score TWR %`. Deux performances cumulées divergeant de 21 points, dont une fausse. | Une seule mesure par concept. Le TWR n'est jamais stocké : il est calculé à la demande depuis les snapshots. |
| 3 | Barèmes fiscaux sur-indexés d'environ 1,3 %, endpoint `api.gouv.fr` inexistant masqué par un `try/except`, et **un seul jeu de barèmes pour tous les exercices**. | Barèmes indexés par **année de cession**, table datée et sourcée, fiabilité affichée honnêtement. |
| 4 | Or ETC et or physique confondus : tout au régime des valeurs mobilières. | Trois régimes distincts : 150-0 A, 150 VH bis (avec l'abattement de 305 € qui manquait), 150 VI. |
| 5 | Projection retraite en dollars déflatés par l'inflation française, sans conversion. Apports futurs indexés sur l'inflation du mauvais scénario. | Projection en **euros**, chaque scénario avec sa propre inflation, et une sensibilité au taux de change affichée. |
| 6 | Replis silencieux : `1,05` pour EUR/USD, `1,0` pour les devises, `2 000 $` pour l'or, `0 %` pour l'inflation 2026. | **Aucune valeur de repli.** Une donnée manquante lève une exception et affiche un bandeau. |

### La correction de fond

La v1 collectait le prix de l'or à chaque apport de capital, dans une colonne
`Montant Or` dédiée, et **ne s'en servait jamais**. Or pour Gave, l'or n'est pas un
placement mais l'étalon de valeur : *« l'or montera tant que les monnaies ne
redeviendront pas des réserves de valeur »*.

La v2 fait de la **performance en onces d'or** une métrique de premier plan, à côté
de la performance en euros et en euros réels. Une seule courbe répond à la question
qui compte, et elle est sur la page Suivi.

---

## Installation

### 1. Créer le schéma Supabase

Dans l'éditeur SQL de Supabase, exécutez `migrations/001_init.sql`.

Les tables sont préfixées `pf2_` : **la v1 n'est pas touchée** et continue de
fonctionner pendant la transition.

### 2. Révoquer l'ancienne clé

La v1 commitait son URL et sa clé Supabase **en dur** dans `take_snapshot.py` et
`calc_perf.py`, sur un repo public.

1. Supabase → Settings → API → révoquer l'ancienne clé publishable
2. Créer une nouvelle clé
3. La stocker dans les secrets GitHub et `.streamlit/secrets.toml` — jamais dans le code

### 3. Configurer les secrets

```bash
cp .streamlit/secrets.toml.example .streamlit/secrets.toml
# puis renseigner SUPABASE_URL et SUPABASE_KEY
```

`.streamlit/secrets.toml` est dans `.gitignore`.

### 4. Lancer

```bash
pip install -r requirements.txt
streamlit run app.py
```

### 5. Migrer les données de la v1

Un script d'import est fourni : `jobs/importer_v1.py`. Il lit les tables
`Transaction` et `Historique` de la v1 et écrit dans `pf2_transactions` et
`pf2_apports`.

```bash
SUPABASE_URL=... SUPABASE_KEY=... python jobs/importer_v1.py --dry-run
SUPABASE_URL=... SUPABASE_KEY=... python jobs/importer_v1.py
```

---

## Le plan d'allocation

Défini dans `core/models.py`, modifiable en un endroit.

| Poche | Cible | Bande | Actifs |
|---|---|---|---|
| Réserve de valeur (Or + Bitcoin) | 20 % | ±3 pts | IGLN.L, BTCUSDT |
| Énergie | 30 % | ±5 pts | XDW0.L, FLXC.L |
| Asie / Chine | 30 % | ±5 pts | RI.PA |
| Obligations japonaises | 20 % | ±5 pts | XJSE.SW |

**Hors portefeuille**, suivis mais jamais rééquilibrés :

| Périmètre | Actifs |
|---|---|
| Épargne de précaution | CHF (livret Swissquote) |
| Compte courant | EUR, USD, CNY (Revolut) |

La bande est plus serrée sur la réserve de valeur parce que c'est la poche qui
porte la thèse anti-monnaie-fiduciaire : une dérive y coûte plus en doctrine qu'en
performance.

---

## Architecture

```
app.py                  Tableau de bord
pages/                  Les 7 autres pages (navigation native Streamlit)
core/
  models.py             Poches, périmètres, classes d'actifs, régimes fiscaux
  fiscal_bars.py        Barèmes de l'impôt, indexés par année
  fx.py                 Taux de change — jamais devinés
  prices.py             Cours — jamais devinés
  metrics.py            TWR, rendement réel, rendement en or, IRR, volatilité
  portfolio.py          Positions calculées depuis les transactions
  rebalance.py          Rééquilibrage par poche et bande
  tax.py                Moteur fiscal français
  config.py             Réglages typés, sans clé en double
  db.py                 Accès Supabase
  session.py            Chargement et calcul partagés
  ui.py                 Helpers d'affichage
jobs/                   Robots GitHub Actions
migrations/             Schéma SQL
tests/                  52 tests, sans réseau ni base
```

### Le principe transversal

**Aucune valeur de repli.** Un cours ou un taux de change manquant lève une
exception, et l'application affiche un bandeau listant ce qui manque. C'est la
correction structurelle de la v1, où une panne Yahoo produisait des performances
flatteuses construites sur des chiffres inventés.

---

## Automatisation

`.github/workflows/daily.yml` fait tourner quatre robots chaque soir :

| Heure UTC | Robot | Rôle |
|---|---|---|
| 21h05 | `update_market_data.py` | Cours et taux de change |
| 21h35 | `daily_snapshot.py` | Valorisation du jour, en euros **et en onces d'or** |
| 22h05 | `update_inflation.py` | Inflation annuelle |
| 22h35 | `fiscal_alerts.py` | Alertes fiscales |

Les secrets `SUPABASE_URL` et `SUPABASE_KEY` doivent être définis dans
Settings → Secrets and variables → Actions.

`.github/workflows/tests.yml` lance les tests à chaque push.

---

## Ce qu'il reste à vérifier

Le moteur fiscal est une **estimation, pas une déclaration**. À recouper avec le
BOFiP avant toute déclaration :

- les barèmes et décotes de 2025 et 2026 ;
- le plafonnement du quotient familial ;
- la qualification fiscale exacte d'un ETC or (IGLN.L) ;
- le barème d'abattement de l'or physique (article 150 VI) ;
- le traitement de l'abattement sur la taxe forfaitaire sur les métaux précieux.

Ces points sont marqués « À VÉRIFIER » dans `core/fiscal_bars.py` et `core/tax.py`.

---

## Tests

```bash
python -m pytest tests/ -v
```

52 tests, sans réseau ni base de données. Ils verrouillent notamment :

- le TWR par sous-périodes et la neutralisation des apports ;
- la relation de Fisher pour le rendement réel ;
- le rendement en or, qui **refuse** un cours invalide ;
- l'exclusion de l'épargne de précaution de l'assiette d'allocation ;
- les bandes par poche et le seuil de rentabilité des ordres ;
- le barème fiscal, tranche par tranche ;
- l'abattement de 305 € sur la plus-value crypto ;
- les deux régimes de l'or physique et le plus favorable des deux ;
- la CSG déductible dans la comparaison PFU / barème.

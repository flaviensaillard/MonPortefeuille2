# MonPortefeuille 2.1.0 — notes de version

**Version :** 2.1.0 · **Code de version :** 28 · **Release unique :** `apk-2.1.0`

Cette version corrige les constats de la revue **2.0.1** (dossier `telechargements/revue-2.0.1/`, branche `arena/7947e984-monportefeuille2`, HEAD examiné `7be0e11`). Elle suit l'ordre imposé par la revue : sécurité, intégrité des données, rendement pondéré (TWR), fiscalité, intégration continue.

**Règle suivie partout :** chaque défaut a d'abord été verrouillé par un test qui **échouait sur la 2.0.1**, puis corrigé. Les vérifications ci-dessous se refont avec `python -m pytest tests/` et `node tests/<suite>.js`.

---

## 1. Avant d'installer : ce qu'il faut faire côté Supabase et GitHub

### 1.1 Migrations à appliquer, dans cet ordre

Dans l'éditeur SQL du projet Supabase, appliquer les fichiers du dépôt **dans l'ordre** (001 à 003 sont supposés déjà appliqués) :

| Ordre | Fichier | Rôle |
|---|---|---|
| 1 | `migrations/004_auth_rls.sql` | Propriétaire `user_id` sur les tables `pf2_`, RLS par utilisateur, RPC d'écriture atomique. **Remplace les politiques ouvertes de la 2.0.1.** |
| 2 | `migrations/005_snapshot_complet.sql` | Colonne `complet` sur les snapshots. |
| 3 | `migrations/006_twr_valorisation_flux.sql` | Valorisation du patrimoine juste avant chaque apport (TWR exact). |
| 4 | `migrations/007_inventaire_crypto.sql` | Inventaire des crypto-actifs détenus hors application (2086). |

Les robots planifiés (GitHub Actions) écrivent avec la clé de service : ils doivent recevoir `SUPABASE_USER_ID` (identifiant du propriétaire). Sans cette variable, la base refuse leurs écritures (propriétaire obligatoire).

### 1.2 Clé de signature Android

La 2.0.1 mettait la clé de signature en cache dans un dépôt public : elle est traitée comme **compromise**. La 2.1.0 ne met plus jamais de clé en cache ; elle se lit depuis les secrets GitHub. La procédure de rotation est dans `docs/SECURITE-LIVRAISON.md`.

**Conséquence pour l'utilisateur :** une nouvelle clé de signature ne peut pas mettre à jour une 2.0.1 installée. Il faut désinstaller la 2.0.1 puis installer la 2.1.0. Les données (transactions, apports, snapshots) sont dans Supabase et ne sont pas perdues ; seuls les réglages locaux de l'application sont à ressaisir.

---

## 2. Les 10 constats prioritaires, un par un

| # | Constat de la revue 2.0.1 | Correction | Vérification |
|---|---|---|---|
| **1** | Politiques Supabase `USING (true)` : n'importe quel détenteur de la clé publique lisait et modifiait toutes les lignes. | Migration 004 : propriétaire par ligne, RLS sur les 9 tables `pf2_`, anonyme sans accès. Connexion email / mot de passe dans l'application (option A, choisie). | `tests/test_rls.py` (23 tests, PostgreSQL embarqué) ; `tests/test_auth_client.js` (16) |
| **2** | Clé de signature APK mise en cache publique, mot de passe par défaut connu. | Plus de cache de clé ; secrets GitHub ; mot de passe par défaut supprimé ; rotation documentée. | `tests/test_livraison_securisee.js` (14) |
| **3** | Devise absente devenue `NAN`, puis valorisée au taux 1 ; côté fiscal, le montant étranger brut devenait des euros. | Liste ISO 4217 partagée ; taux absent = `NULL` annoncé, jamais 1 ; fiscal : plus de repli sur le brut (T-01). | `tests/test_devise_absente.js` (11), `tests/test_devise_absente.py` (11), `tests/test_fiscal_inventaire.py` (TestTauxAbsent) |
| **4** | Snapshots partiels écrits sans marque de complétude ; portefeuille en liquidités seules sans point. | Colonne `complet` (migration 005) ; un point partiel n'entre jamais dans une série ; liquidités seules = point quand même ; alerte « Snapshot partiel ». | `tests/test_snapshot_complet.py` (7) |
| **5** | 2086 : crypto-actifs détenus hors application ignorés du dénominateur ; erreurs de cours avalées par `except Exception: pass`. | Inventaire externe (migration 007, RLS) entrant dans les lignes 212 et 220 ; cours, taux, solde ou prix d'acquisition manquant = calcul **incomplet** et nommé ; plus aucun `except … : pass` dans le fiscal. | `tests/test_fiscal_inventaire.py` (9, dont le verrou sans `except … pass`) ; `tests/test_rls.py` (TestInventaireCrypto) |
| **6** | Vente supérieure à la position : rejetée par le portefeuille, mais calculée en 2074 (gain sur la quantité entière). | Même règle dans les moteurs JS et Python ; la vente excédentaire est refusée au formulaire, écartée des 2074 et 2086 et annoncée ; jamais chiffrée. | `tests/test_ventes_excedentaires.py` (12) ; `tests/test_ventes_excedentaires.js` (18) |
| **7** | TWR : chaque flux supposé en fin d'intervalle ; exemple de la revue : 100 €, apport de 100 € au milieu, +10 % → affiché +20 %, réel +10 %. | Valorisation juste avant chaque flux (migration 006 et saisie). Un intervalle non valorisé n'est pas chaîné : il est annoncé « non calculé ». `test_metrics.py` corrigé, miroir JS aligné. | `tests/test_twr_strict.py` (10) ; `tests/test_twr_strict.js` (16) ; `tests/test_metrics.py` (51) ; `tests/test_valorisation_flux.js` (9) |
| **8** | Transaction et mouvement de compte écrits en deux requêtes, avec suppression « compensatoire » : une panne laissait des titres sans argent débité. | Création et modification par RPC atomiques (migration 004) ; rejeu idempotent ; zéro compensation. | `tests/test_atomicite_ecritures.js` (26) ; `tests/test_rls.py` (RPC atomiques) |
| **9** | Lectures Supabase sans pagination : au-delà de 1 000 lignes, l'historique était tronqué en silence. | Lecture paginée partout (JS et Python), ordre stable par table ; une page en échec fait échouer toute la lecture. | `tests/test_pagination.js` (11, jusqu'à 15 000 lignes) ; `tests/test_pagination_db.py` (5) |
| **10** | Données fiscales du foyer (salaires, intérêts, kilomètres, repas) enregistrées **sans année** : un autre millésime réutilisait les mêmes montants. | Données annuelles suffixées par l'année (`f_s1_2025`) ; une année sans donnée est une lacune, jamais comblée par une autre année ; enregistrement explicite et confirmation par année ; reprise des anciennes valeurs sur geste explicite seulement ; plus de valeurs personnelles par défaut. | `tests/test_fiscal_millesime.py` (19) ; `tests/test_fiscal_millesime_js.js` (3) ; `tests/test_execution_pages.py` |

---

## 3. Détail par constat

### Constat 1 — Sécurité des données (RLS)
- Option retenue : **A — authentification Supabase par email et mot de passe**. Chaque utilisateur ne voit et ne modifie que ses lignes.
- Tests négatifs : un utilisateur anonyme ne lit ni n'écrit rien ; un utilisateur B ne voit pas les lignes de A ; une écriture sans propriétaire est refusée.
- Les robots gardent la clé de service et doivent fournir `SUPABASE_USER_ID`.

### Constat 2 — Clé de signature
- Le workflow de livraison ne met plus rien en cache, lit la clé dans les secrets, et purge l'ancien cache de clé compromise.
- Le mot de passe par défaut de la clé a disparu du script de construction.
- La WebView est durcie (liste blanche de domaines, redirections coupées, ouverture externe en HTTPS seulement) : `tests/test_webview_durci.js` (15).

### Constat 3 — Devises absentes
- `core/devises.py` et `DEVISES_ISO` (JS) portent la même liste ISO 4217 (173 codes), vérifiée par test de parité.
- Un taux absent n'est jamais 1 : côté portefeuille, côté fiscal et côté saisie.

### Constat 4 — Snapshots complets
- `jobs/daily_snapshot.py` : cours ou taux manquant → `complet = false`, liste des manquants, alerte « Snapshot partiel » dans le corps du message.
- Les séries de performance excluent les points partiels ; la colonne est ajoutée par la migration 005.

### Constat 5 — 2086 et erreurs avalées
- Lignes 212 (valeur globale) et 220 (prix d'acquisition) : incluent le solde externe valable à la date de cession.
- Règle : un actif déclaré hors application doit avoir un solde **à une date antérieure ou égale à chaque cession** ; à défaut, le calcul s'arrête et le dit. Pour déclarer « rien détenu », saisir une quantité 0 à une date ancienne.
- Le résultat expose `calcul_complet`, `indisponible` (liste nommée) et `sources_externes` (plateformes utilisées).
- La page 4 (Fiscalité) n'affiche aucun formulaire et ne lance aucune simulation tant que le calcul est incomplet.

### Constat 6 — Vente excédentaire
- Le formulaire de saisie contrôle la quantité détenue, pas seulement la quantité positive.
- Les deux moteurs (JS et Python) appliquent la même règle, testée des deux côtés : achats du jour comptés, ventes du jour retirées par prudence, achats avant ventes à date égale.
- Une vente excédentaire déjà enregistrée est écartée des 2074 et 2086 et annoncée en bannière (Python : `core/portfolio.py`, JS : `PF.portefeuille.erreurVenteExcedentaire`).

### Constat 7 — TWR exact
- `core/metrics.py` : `rendements_stricts` / `twr_strict` ; `app/.../js/metrics.js` : `rendementsStricts` / `twrStricts` (mêmes règles).
- Un intervalle sans flux est exact quelle que soit sa longueur.
- Un intervalle dont chaque flux est valorisé est chaîné exactement.
- Un intervalle dont un flux n'est pas valorisé n'est **pas** calculé : il apparaît comme « non calculé » (pages Performance et Retraite, vue Android).
- Le rendement en or ne chaîne que les intervalles sans flux.
- Retraite : un rendement historique absent n'est plus remplacé par 5 % sans avertissement ; le 5 % est présenté comme une hypothèse.

### Constat 8 — Écritures atomiques
- Transaction et mouvement de compte passent par une seule requête RPC.
- Une panne entre les deux ne laisse aucune ligne orpheline ; un rejeu avec la même clé d'idempotence ne duplique rien.

### Constat 9 — Pagination
- Limite standard Supabase : 1 000 lignes par réponse. La lecture enchaîne les pages (`limit`/`offset`) sur un ordre stable.
- Une page en échec fait échouer la lecture entière : l'historique n'est plus jamais tronqué en silence.

### Constat 10 — Millésime des données fiscales
- Identité du foyer (statut, enfants, parts, pays) : clé simple.
- Données annuelles (salaires, intérêts, kilomètres, puissance, repas, frais réels) : clé suffixée par l'année.
- Une année sans donnée affiche « aucune donnée enregistrée » et n'emprunte aucune valeur d'une autre année.
- Enregistrement explicite (plus d'écriture automatique de valeurs par défaut), case de confirmation « données de l'année N ».
- Reprise des anciennes valeurs sans année : bouton explicite, jamais une année déjà saisie n'est écrasée.
- Une lecture ou une écriture de configuration en échec affiche une erreur au lieu de valeurs de repli.
- Android : seule l'identité du foyer est poussée vers la configuration partagée ; les données annuelles restent locales (voir « limites »).

---

## 4. Autres constats traités dans cette version
- **T-01** (repli FX vers le montant brut) : traité côté fiscal (2074, 2086, cessions).
- **T-03** (vente incohérente en fiscal) : traité avec le constat 6.
- **T-07** (profil annuel) : traité avec le constat 10.
- **T-08** (veille des barèmes « à jour » après une panne) : une panne donne l'état « sonde indisponible », jamais « à jour » ; la panne n'est pas mise en cache. `tests/test_fiscal_veille.py` (3).
- **F-17** (rendement retraite de 5 % présenté comme historique) : traité avec le constat 7.
- **F-20** (historiques partiels) : traité avec le constat 4.

---

## 5. Limites connues — NON traitées en 2.1.0
À planifier dans une version ultérieure ; aucune de ces limites n'est masquée :

- **Android — millésime annuel** : la fiche « Situation fiscale » garde ses données annuelles en local, sans année. Le calcul Android ne doit pas servir de déclaration tant que ce portage n'est pas fait ; la déclaration de référence est la page Fiscalité de l'application Streamlit.
- **Android — inventaire externe** : le formulaire 2086 Android ne voit pas les positions saisies hors application (elles se saisissent dans la page Fiscalité). Il bloque toutefois le calcul dès qu'un cours ou un taux manque.
- **T-04** (or physique routé vers l'or papier en Python ; choix automatique du régime) — non traité.
- **T-05** (frais de repas sans contrôle d'éligibilité ni de participation employeur) — non traité.
- **T-06** (taux de prélèvements sociaux 2025 non déterminé par régime) — non traité.
- **F-16** (colonnes USD des snapshots non persistées) — non traité.
- **F-18** (projection de rente déterministe, sans simulation de séquence) — non traité.
- **F-19** (prix de l'or : contrat à terme, non le spot) — non traité, source affichée.
- **`except … : pass` hors fiscal** : `core/db.py` (snapshots, import, allocation), `core/session.py` (enrichissements USD), `core/models.py` — non traités ; le verrou ne porte que sur le fiscal.
- **Table `Config`** : lue et écrite par l'application, elle n'est pas créée par le dépôt. Sa protection d'accès dans Supabase reste à vérifier et à documenter.

---

## 6. Tests et intégration continue
- **Python hors réseau :** 708 tests passent, dont 23 tests RLS sur PostgreSQL embarqué (aucun Supabase requis).
- **JavaScript hors réseau :** 13 suites, 342 vérifications.
- **Exclues de la CI (dépendent du réseau ou d'identifiants) :** `tests/test_tickers_yahoo.py`, `tests/test_dates_de_bout_en_bout.py`, `tests/test_snapshot_resilient.py`, `tests/test_rls_integration.py`. Elles restent exécutables à la main.
- `tests/test_rendu.js` (DOM simulé) : exclu, faute de jsdom dans le dépôt.
- La CI (`.github/workflows/tests.yml`) lance désormais l'ensemble de ces suites.

## 7. Release
- Une seule release : `apk-2.1.0`, immuable. Le workflow refuse d'écraser une release existante avec un APK différent.
- La release `apk-2.0.1` reste en ligne, avec la mention « Surchargée par la 2.1.0 ».

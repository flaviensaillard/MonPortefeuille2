# MonPortefeuille 2.2.0 — notes de version

**Version :** 2.2.0 · **Code de version :** 30 · **Release unique :** `apk-2.2.0`

La 2.2.0 regroupe trois chantiers : le TWR corrigé (A), l'empreinte digitale
rendue diagnostique (B), et la sauvegarde chiffrée (C). La 2.1.1 reste en ligne ;
aucune release antérieure n'est modifiée.

Ce qui n'est PAS dans cette version : les données externes, la veille fiscale
et les lectures silencieuses (D et E) relèvent de la 2.3.0. Aucune migration
Supabase n'est livrée.

---

## 0. Ce qu'il faut savoir avant d'installer

- **Le TWR affiché change.** Un rendement qui valait +20 % à tort, parce qu'un
  apport était compté en fin de période, vaut désormais +10 % (constat A4). Un
  rendement qu'on ne peut pas calculer exactement s'affiche « non calculé », et
  n'est jamais remplacé par un chiffre approché.
- **L'empreinte doit être testée sur votre téléphone** (constat B5). Aucun test
  automatique ne remplace cette vérification.
- **Une phrase de sauvegarde est à créer** (constat C4), sans quoi le robot de
  sauvegarde s'arrête volontairement.

---

## A. Correction du TWR

### A1 — Valorisation manquante reconstruite (`core/metrics.py`, `valorisations_avant_flux`)

Avant 2.2.0, un apport sans valorisation mesurée « avant geste » était
simplement ignoré, et l'intervalle concerné était mal chaîné.

Désormais, pour chaque flux :
1. une valorisation **mesurée** (`valeur_avant_*`) reste prioritaire ;
2. sinon elle est **reconstruite** depuis le snapshot le plus proche
   **strictement antérieur** au flux. Un snapshot du même jour que le flux est
   exclu ; l'ordre est strict ;
3. sans snapshot antérieur valorisé, elle est **manquante**, avec sa raison.

Vérification :
```
python -m pytest tests/test_twr_v220.py -q
node tests/test_twr_v220.js          # attendu : 19 réussis, 0 échec
```

### A2 — TWR global jamais partiel (`core/metrics.py`, `twr_exact`)

Si un seul intervalle n'est pas calculé, le TWR global est « non calculé » avec
la liste des intervalles écartés. Un chaînage partiel n'est jamais présenté
comme un total.

Vérification : mêmes commandes qu'en A1 ; le test `test_twr_strict` vérifie la
même règle côté JS (`node tests/test_twr_strict.js`, attendu : 16 réussis).

### A3 — Diagnostic en lecture seule (`jobs/diagnostic.py`, `.github/workflows/diagnostic.yml`)

Pour chaque flux des trois dernières années, le diagnostic affiche : la date, le
montant, le nombre d'apports, la valorisation utilisée (mesurée, reconstruite ou
manquante), son origine, le snapshot retenu et sa date. Il indique aussi si le
TWR global est calculé.

Vérification :
```
python -m pytest tests/test_diagnostic_flux_v220.py -q     # 9 réussis
```
Exécuter le workflow « Diagnostic » à la main (lecture seule, aucune écriture).

### A4 — Progression : même méthode que la page Performance (`core/session.py`)

L'indicateur « depuis le dernier enregistrement » (tableau de bord) utilisait la
convention « flux en fin de période ». Il est maintenant calculé par
`_twr_strict_fenetre`, la même méthode que la page Performance. Les deux
instants d'un même jour (snapshot nocturne et direct) restent distincts.

- Golden : 100 € au départ, 100 € versés à mi-période, +10 % ensuite. Résultat
  attendu **+10 %** (l'ancien code donnait +20 %).
- Un flux sans valorisation avant affiche « — », jamais 0 %.

Vérification :
```
python -m pytest tests/test_progression_twr_strict.py tests/test_progression_snapshot.py -q
```
Rouge sur la 2.1.1 : `test_golden_apport_a_mi_periode_donne_dix_pour_cent`
et `test_flux_sans_valorisation_avant_donne_non_calcule_et_pas_un_total_partiel`.

Le libellé « Depuis le dernier enregistrement » reste le même. Si un achat de
titres intervient après le dernier snapshot, son flux n'est pas valorisé : le
pourcentage affiche « — ». C'est voulu.

### A5 — Golden et bout en bout

- Golden : 100 € → apport 100 € à mi-période → +10 % après : **+10 %**.
- Bout en bout sur snapshots réalistes, dont le cas « reconstruit depuis la
  veille » : `tests/test_twr_v220.py`.

### A6 — Limite à connaître

La reconstruction place le flux **au début** de l'intervalle, c'est-à-dire qu'on
suppose le portefeuille inchangé entre le snapshot de la veille et le flux. L'erreur
sur le rendement de cet intervalle est **bornée par le mouvement de marché** de
cet intervalle. Une valorisation mesurée est toujours préférée. Un flux sans
snapshot antérieur n'est pas estimé : son intervalle est « non calculé » et le
TWR global aussi. Cette limite est documentée dans la docstring de
`valorisations_avant_flux`.

### Vérification rouge sur l'ancien code

Les tests A ont été exécutés contre `40f812f` : 22 échecs Python sur 25 (les 3
autres sont des cas de non-régression), et le test JS plante faute de
`valorisationsAvantFlux`.

---

## B. Activation de l'empreinte digitale

### B1 — Le vrai code d'erreur remonte (`NativeBridge.java`, `biometrie.js`)

Avant : toute erreur devenait « Activation annulée : l'empreinte n'a pas confirmé
votre identité ». Désormais, chaque code de `BiometricPrompt` est nommé :
`ERROR_NO_BIOMETRICS`, `ERROR_NONE_ENROLLED`, `ERROR_HW_UNAVAILABLE`,
`ERROR_LOCKOUT`, `ERROR_LOCKOUT_PERMANENT`, `ERROR_USER_CANCELED`,
`ERROR_NEGATIVE_BUTTON`, etc. (`codeErreurBiometrie`, codes 1 à 15). Un code
inconnu garde son code système, jamais un libellé générique.

Vérification :
```
node tests/test_empreinte_codes.js        # attendu : 36 réussis
python -m pytest tests/test_empreinte_cableage.py -q   # 23 réussis
```
Le second test recoupe la liste des codes émis par Java avec la table `LIBELLES`
de `biometrie.js` : un code sans libellé fait échouer la suite.

### B2 — Permissions, disponibilité, cohérence (`AndroidManifest.xml`, `NativeBridge.java`)

- `USE_BIOMETRIC` et `USE_FINGERPRINT` sont déclarées. Leur absence provoquait
  une `SecurityException` avalée en « indisponible ».
- Le réglage n'est affiché qu'après `canAuthenticate`, et la raison de
  l'indisponibilité est affichée (`diagnosticEmpreinte` : `ok`,
  `sdk_trop_ancien`, `permission_manquante`, `materiel_absent`,
  `aucune_empreinte_enrolee`, etc.).
- Activation et déverrouillage passent par **un seul** chemin de prompt
  (`demanderEmpreinte`) avec `BIOMETRIC_STRONG` sur Android 11 (API 30) et plus.

Vérification : `python -m pytest tests/test_empreinte_cableage.py -q`
(`test_le_manifeste_declare_les_permissions_biometriques`,
`test_les_authentificateurs_sont_coherents_entre_activation_et_deverrouillage`).

### B3 — Clé Keystore et invalidation

- Le cipher est initialisé **avant** le prompt (`preparerChiffre`). Un échec de clé
  ne peut plus apparaître après la biométrie.
- `KeyPermanentlyInvalidatedException` : la clé et les jetons sont supprimés, et
  l'application redemande le mot de passe pour recréer l'empreinte.
- Choix documenté : la clé n'exige pas d'authentification (`setUserAuthenticationRequired`
  absent). Sans ce choix, le scellement silencieux des jetons rafraîchis serait
  impossible. La porte d'ouverture reste le `BiometricPrompt` lié au `CryptoObject`.
  Ce choix est écrit dans le code et vérifié par un test.

Vérification : `python -m pytest tests/test_empreinte_cableage.py -q`
(`test_le_chiffre_est_prepare_avant_l_appel_du_prompt`,
`test_key_permanently_invalidated_est_geree_sans_echec_muet`).

### B4 — Mot de passe jamais stocké, repli intact

Le mot de passe n'est jamais stocké : ni dans les réglages, ni dans la session,
ni dans ce que reçoit le pont natif. Les jetons sont chiffrés par le Keystore.
Le repli email/mot de passe est inchangé.

Vérification : `node tests/test_empreinte_logique.js` (33 réussis, dont les
tests 17a à 17c) et `node tests/test_empreinte_codes.js` (repli, 36 réussis).

### B5 — Test sur appareil réel (à faire par vous)

La compilation Java n'est pas possible dans l'environnement de développement.
Le code a été vérifié par analyse syntaxique, par les tests ci-dessus, puis par
la compilation de la CI (`apk.yml`). **Il reste à tester sur un téléphone réel** :

1. Installer `Porte-feuille-2.2.0.apk` par-dessus la 2.1.1 (même signature).
2. Se connecter par e-mail et mot de passe.
3. Réglages → activer l'empreinte, confirmer. Vérifier que l'activation réussit.
4. Fermer l'application, la rouvrir, déverrouiller par empreinte.
5. Pour vérifier les messages d'erreur : annuler le prompt (le message doit
   dire « annulée », pas « indisponible »), puis, si possible, désactiver
   l'empreinte dans les réglages du téléphone : le réglage doit afficher la
   raison exacte.
6. Repli : annuler, puis se connecter par mot de passe : doit fonctionner.

Notez le résultat (modèle, version Android, étape en échec, message affiché).

---

## C. Survie des données — sauvegarde chiffrée

### C1 — Format et chiffrement (`core/sauvegarde.py`)

Une archive `.pf2` contient, pour chaque table, les lignes, leur nombre et un
SHA-256 calculé sur la forme canonique. Un SHA-256 global couvre l'ensemble, et
une synthèse (nombre de lignes, sommes des montants) sert de contrôle.

- Tables : `pf2_transactions`, `pf2_apports`, `pf2_snapshots`, `Config`
  (versions fiscales) — obligatoires ; `pf2_operations_compte`, `pf2_comptes` —
  optionnelles, déclarées « absentes » si elles n'existent pas.
- Chiffrement : **AES-GCM**, clé dérivée de la phrase par **scrypt**
  (n=2^15, r=8, p=1), sel et nonce aléatoires. L'en-tête sert d'AAD.
- Une table obligatoire illisible annule **toute** la sauvegarde : pas
  d'archive partielle présentée comme complète.

Vérification : `python -m pytest tests/test_sauvegarde.py -q` (23 réussis).

### C2 — Export automatique (`jobs/sauvegarde.py`, `.github/workflows/sauvegarde.yml`)

Chaque dimanche à 20 h UTC, puis à la demande :
1. lecture des tables Supabase ;
2. chiffrement et écriture de `pf2-AAAA-MM-JJ.pf2` et de son `.sha256` ;
3. **restauration de contrôle** du fichier produit (`jobs/restauration.py`) et
   vérification de l'empreinte : si l'une échoue, le workflow échoue ;
4. publication du fichier chiffré en **artefact** (conservé 90 jours) : c'est la
   copie hors ligne. On le télécharge depuis l'onglet « Actions ».

Vérification : `python -m pytest tests/test_sauvegarde.py -q` (test du workflow :
ordre des étapes, phrase jamais imprimée). Sans phrase, le job s'arrête
(code 2) et ne produit rien :
```
env -u SAUVEGARDE_CLE python jobs/sauvegarde.py ; echo $?    # attendu : 2
```

### C3 — Restauration testée automatiquement (`jobs/restauration.py`)

La restauration vérifie, dans l'ordre : l'empreinte du fichier, le déchiffrement,
le nombre de lignes de chaque table, la somme de contrôle de chaque table, la
somme globale et la synthèse (sommes des montants). Un fichier altéré d'un seul
octet, une mauvaise phrase ou une ligne supprimée sont refusés. La copie CSV
(`--csv DOSSIER`) conserve le nombre de lignes et les colonnes.

Le script **ne réécrit jamais Supabase** : une restauration en base est une
décision à prendre table par table.

Restaurer chez vous :
```
SAUVEGARDE_CLE='votre phrase' python jobs/restauration.py pf2-2026-10-11.pf2 --csv ./csv
```

### C4 — Surface et chiffrement : décisions

- **Surface** : le robot hebdomadaire et l'artefact ; pas d'export depuis
  l'application Android dans cette version.
- **Phrase** : la proposition initiale était une phrase saisie à chaque export.
  Un export automatique ne peut pas la demander. Choix retenu : une phrase de
  12 caractères minimum, enregistrée comme **secret GitHub** `SAUVEGARDE_CLE`, jamais
  dans le code ni dans le journal. **À confirmer** : si vous préférez la saisie à
  chaque export, la sauvegarde deviendra manuelle.
- **Limite** : la phrase est la seule protection du fichier. Une phrase faible
  se casse hors ligne. Choisissez une phrase longue et notez-la hors du téléphone.

### C5 — Mise en service

1. Créer le secret `SAUVEGARDE_CLE` (Settings > Secrets and variables > Actions).
   Les secrets `SUPABASE_URL` et `SUPABASE_KEY` existent déjà.
2. Lancer « Sauvegarde chiffrée » à la main (workflow_dispatch).
3. Télécharger l'artefact, puis tester la restauration en local (commande C3).
4. Conserver l'archive hors du dépôt : le dépôt ignore `sauvegardes/`, `*.pf2`
   et `*.pf2.sha256`.

---

## Progression (constat transversal)

`progression_periode` n'a plus de convention propre : il partage la méthode de la
page Performance. Voir A4.

---

## Mise en service de la 2.2.0

1. Fusionner la PR vers `main`. Le workflow `apk.yml` construit et publie
   `apk-2.2.0` (release unique et immuable, sans écraser une autre release). Les
   exécutions de branche ne font que vérifier que l'APK se construit.
2. Installer `Porte-feuille-2.2.0.apk` par-dessus la 2.1.1 (§ B5).
3. Créer le secret `SAUVEGARDE_CLE` puis lancer une première sauvegarde (§ C5).

---

## Vérifications exécutées pour cette version

| Suite | Résultat |
|---|---|
| `python -m pytest tests` | 889 réussis, 14 échecs, 4 ignorés. Les 14 échecs sont les mêmes que sur `main` (`40f812f`) : tests réseau (Yahoo, `test_snapshot_resilient`, `test_dates_de_bout_en_bout`), inchangés. |
| `node tests/test_js.js` | 90 réussis |
| `node tests/test_empreinte_codes.js` | 36 réussis |
| `node tests/test_empreinte_logique.js` | 33 réussis |
| `node tests/test_twr_v220.js` | 19 réussis |
| `node tests/test_twr_strict.js` | 16 réussis |
| `node tests/test_taux_absent.js` | 34 réussis |
| `node tests/test_livraison_securisee.js` | 15 réussis |

Connu et hors périmètre : `tests/test_rendu.js` échoue sur 3 points **à
l'identique sur `main`** (rendu de la page Performance « périodes manquantes »,
millésime fiscal, guide replié). La CI exclut ce test pour cette raison. Il
n'est pas corrigé ici ; c'est à traiter séparément.

Environnement : `test_rendu.js` exige `jsdom`, absent du dépôt. Il a été installé
dans le cache local pour l'exécuter.

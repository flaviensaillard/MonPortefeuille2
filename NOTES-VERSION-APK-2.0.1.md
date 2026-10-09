# APK 2.0.1 (code 27) — brouillon de notes de version

> Brouillon à relire avant publication. Chaque affirmation a été contrôlée dans le code de `59e3065` (main), sauf mention contraire.
> Commit de référence de la release : **à confirmer** (voir la décision demandée). Le code de `app/` est identique entre `71a90a9` et `59e3065`.

## Ce qui change depuis la 2.0 (code 26)

La 2.0.1 reprend la 2.0 et supprime les taux de repli qui restaient. Un chiffre calculé avec un taux inventé n'est jamais affiché : à la place, la mention « taux indisponible ».

### Comptes de liquidités (2.0)

Les lignes de liquidités de l'onglet Données (USD, CHF, CNY) sont remplacées par de vrais **comptes** :

- **Créer** un compte : nom, banque (texte libre ; l'application propose les banques déjà saisies), devise, type et motif.
- **Type** : **réserve** (épargne de précaution, jamais proposée à l'achat ou à la vente de titres) ou **disponible** (compte courant, pour les achats et ventes de titres de sa devise).
- **Archiver** plutôt que supprimer : un compte archivé ne reçoit plus d'opération, disparaît des listes, mais son solde reste compté dans le patrimoine.
- **Opérations** : solde d'ouverture, dépôt, retrait, virement, achat de titres, vente de titres, frais.
- **Virements : même devise uniquement.** Un virement USD → CHF est refusé, car il n'y a aucun change entre devises. Un virement est deux jambes liées, et chaque jambe affiche le compte d'en face (« → » ou « ← »).
- **Cloisonnement** : un achat ou une vente ne touche qu'un compte disponible de la devise du titre. Une réserve n'est jamais débitée ni créditée par un achat ou une vente.
- **Migration automatique** : au premier lancement 2.0, les soldes USD, CHF et CNY de Données sont reportés en soldes d'ouverture de comptes. La table Données n'est pas modifiée.
- **Écran Portefeuille (Streamlit)** : les comptes sont en lecture seule.

### Message achat / vente

Si le cours de change du jour manque, l'application affiche « Taux indisponible », n'enregistre pas l'opération et propose « Réessayer ». Aucune valeur n'est estimée. Le taux est vérifié **avant** l'écriture de la transaction.

### Règle « taux indisponible » : aucun repli silencieux

- **Apports et retraits** : valorisés au cours réel du jour, ou refusés avec « Réessayer ».
- **Titres** : un titre dont le taux manque est « non calculé », exclu des totaux et signalé. Il n'est pas remplacé par la valeur dans l'autre devise.
- **Fiscalité** : « Montant non calculé, taux indisponible au … » ; aucun montant d'impôt n'est affiché.
- **Rééquilibrage** : « Ordre non calculé, cours de change indisponible » ; la quantité n'est pas calculée.
- **Retraite** : sans taux de référence, la rente en euros n'est pas calculée (« Rente non calculée »).
- **Alerte crypto (robot)** : si le taux d'une cession manque, la cession est signalée « taux de change indisponible » au lieu d'être convertie.
- **Moteur Python** : `fx.taux` lève `FXIndisponible` quand le cours manque. Il n'existe plus de valeur de remplacement.
- **Démonstration** : le jeu de démonstration (`demoContexte`) garde des cours de change fixes. Certaines constantes sont annotées « démo, ne pas imiter ». Ce ne sont pas des taux réels.

### Replis supprimés

Application (JavaScript) :
- `tEur || 1` et `tUsd || tauxEur * 1.125` (apports et retraits) ;
- le cours USD utilisé comme cours EUR, et `1` pour le coût des positions ;
- `1 / 1,125` (fiscalité, crypto) ;
- `U.num(…, 0)` sur un gain sans série ;
- `montant_eur` affiché comme des dollars dans la liste des apports ;
- `dernierTaux || 1` (ordres) ;
- `0` envoyé comme taux à l'assistant IA (il reçoit désormais `null`, voir `71a90a9`).

Moteur et écrans (Python) :
- `core/portfolio.py` et `core/session.py` : repli silencieux sur le cours ;
- `core/session.py` et `core/ui.py` : 1,125 dans le chargement et l'affichage ;
- `core/metrics.py` : rente et sensibilité au change ;
- `core/db.py` : `ajuster_solde_compte` ne fabrique plus une « Valeur totale » à 1,0. Sans taux, elle lève une erreur ;
- `core/rebalance.py` : quantité sans cours ;
- `jobs/fiscal_alerts.py` : 1 / 1,125 ;
- `jobs/daily_snapshot.py` : une ligne sans taux est écartée et signalée, jamais valorisée à 1,0 ;
- pages Portefeuille et Retraite : multiplications par un taux absent, remplacées par « — » ou une exclusion annoncée.

Le taux est vérifié avant l'écriture pour l'achat et la vente.

### Base de données : migration 003

`migrations/003_comptes.sql` crée `pf2_comptes` et `pf2_operations_compte`. Elle ne modifie aucune table existante.
- Le solde n'est jamais stocké : il est calculé comme la somme signée des opérations.
- Un compte n'est jamais supprimé (il est archivé).
- Supprimer un apport ou une transaction supprime l'opération de compte liée (cascade), donc sans mouvement orphelin.
- Les deux tables ont la RLS activée. Le script est idempotent (`create … if not exists`, `drop policy if exists`).
- Retour arrière : supprimer `pf2_operations_compte` puis `pf2_comptes`.

À exécuter dans Supabase avant d'utiliser la 2.0 : SQL Editor > New query > coller le fichier > Run.

### Vérification

- Tests ajoutés : `tests/test_taux_absent.js`, `tests/test_taux_absent_python.py`, `tests/test_charger_message_taux.py`, `tests/test_taux_indisponible.py`, `tests/test_comptes.js`, `tests/test_comptes.py`.
- La CI contrôle la présence des garde-fous dans `app/src/main/assets/www/js/net.js` (`seuilEcart`, `varJour` : 6 occurrences attendues) et échoue sinon.

### Limites connues

- Les cours Yahoo ne sont pas accessibles depuis l'environnement de build : la validation des cours se fait sur appareil.
- Retraite : une année sans valeur d'inflation INSEE est comptée à 0 (`app.js`, `U.num(…, 0)`), et les scénarios par défaut de l'écran retraite sont à 2 % (`store.js`). Ce point n'est pas traité par la 2.0.1 et reste à traiter séparément.

## Statut

Validée sur appareils réels par l'utilisateur. La fusion dans `main` est faite (commit `59e3065`).

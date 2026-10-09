# 08 — Plan d’autonomie sur 40 ans

**Cible :** préserver des données vérifiables et recalculables jusqu’en 2066, sans confondre « automatisé » et « exact ». Plan proposé, non exécuté dans cette revue. Aucun correctif, rebuild, changement de schéma ou appel en écriture n’a été fait.

## Principes non négociables

1. **Une seule source de vérité par fait**, ou une règle de priorité explicite. Une position vient des transactions valides; un solde vient des mouvements; un snapshot conserve réellement les valeurs qui ont servi au calcul.
2. **Toute valeur porte son unité, sa date, sa source et son année d’effet.** « Aujourd’hui », « inconnu », `NULL` et zéro doivent être différents.
3. **Pas de taux ou de cours de remplacement silencieux.** Si une source officielle/fiable manque, marquer le calcul indisponible, garder l’historique brut et afficher l’étendue de l’incertitude.
4. **Une mise à jour automatique propose, une validation juridique adopte.** Aucun assistant IA, scrape de titre ou retour HTTP vert ne fait foi à la place du texte fiscal.
5. **Tout doit être exportable, restaurable et testable hors réseau.** Des tests live fournisseur existent à part; ils ne doivent pas conditionner les calculs unitaires.

## Priorité 0 — Réduire les deux risques de sécurité avant une prochaine diffusion

| Action proposée | Déclencheur / source | Contrôle automatique | Effort |
|---|---|---|---|
| Traiter le keystore comme exposé, retirer tout secret du cache public, organiser l’impact sur les APK déjà installés et le certificat. | Événement déjà observé : le cache `apk-keystore-v1` existe sur la branche `main` du dépôt public; `build.sh` utilise un mot de passe par défaut. | Vérification indépendante du cache, inventaire du certificat des releases, décision documentée avant un nouveau build; aucune clé privée dans artifacts/caches. | **M** |
| Remplacer les policies RLS ouvertes par des identités/propriétaires et une séparation par utilisateur; isoler les tables de production. | Toute migration Supabase. | Tests d’intégration avec rôle anon et deux utilisateurs : chacun ne lit/modifie que ses lignes; tests négatifs `SELECT/INSERT/UPDATE/DELETE`. | **L** |
| Réduire les capacités WebView et du pont réseau. | Toute release Android. | Test automatisé de manifeste/réglages; allowlist HTTPS des endpoints; revue des appels JS exposés. | **M** |
| Établir la révocation des clés historiques mentionnées dans le workflow v1. | Une seule fois, puis à chaque incident secret. | Scan de secrets du HEAD et de l’historique; journal de rotation côté Supabase, sans publier les valeurs. | **S** |

**Sources techniques :** [GitHub cache Actions](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching), [Supabase RLS](https://supabase.com/docs/guides/database/secure-data), [Android WebView](https://developer.android.com/privacy-and-security/risks/webview-unsafe-file-inclusion).

## Priorité 1 — Garantir l’intégrité des flux, positions et snapshots

| Automatisation / mécanisme | Source et contrôle | Effort |
|---|---|---|
| RPC PostgreSQL transactionnelle pour créer/modifier une transaction de titre et son mouvement cash; commandes idempotentes et liens vérifiés. | Contrat de données versionné; test de panne entre chaque écriture, rejeu et suppression. | **M** |
| Validateur de journal chronologique unique; un débordement de vente rend le portefeuille ET le résultat fiscal incomplets jusqu’à correction. | Transactions enregistrées, test propriété `quantité détenue ≥ 0`, comparaison Python/JS. | **M** |
| Snapshot atomique logique par composant (titres, liquidités, taux, valeurs USD/EUR), avec `complete`, erreurs, source/date de cours et taux. Les comptes seuls doivent générer un point. | Cours et FX récupérés, validation de complétude avant d’entrer dans les séries TWR; points partiels écartés par défaut. | **M** |
| Persister les vrais totaux USD par poche et les taux qui ont servi; conserver les EUR comme seconde vue, ne pas extrapoler le taux de la poche investie sur le cash. | Snapshot journalier horodaté et test mixant EUR/USD/CHF. | **M** |
| Paginer toutes les tables et introduire un archivage/partitionnement par date; contrôler les comptes de lignes attendus. | Supabase/PostgREST : [limite et pagination](https://supabase.com/docs/reference/python/limit); tests 1,001 et 15,000 lignes. | **M** |
| Vérifier chaque devise contre ISO 4217; l’absence est `NULL`, jamais `NAN=1`; bloquer la valorisation avec une bannière explicite. | ISO 4217 publié par SIX, listes versionnées; cas de tests devise manquante/inconnue. | **S** |
| Calculer un TWR exact avec valuations avant/après chaque flux; si ce n’est pas possible, mesurer le biais temporel et nommer la méthode. | Journal des apports/retraits + snapshots; tests milieu de période et données trouées; vecteur partagé Python/JS. | **M** |

## Priorité 2 — Automatiser les données externes avec provenance et repli contrôlé

### Cours de marché et FX

- Remplacer le couplage direct `yfinance` par une interface `MarketDataProvider`; choisir un fournisseur avec API documentée/licence et conditions de conservation adaptées. Les bourses/émetteurs restent la référence pour les jours de cotation et NAV; Yahoo peut rester un fournisseur secondaire, pas l’unique source de vérité.
- Écrire chaque observation avec `instrument`, `currency`, `market_date`, `retrieved_at`, `provider`, `value`, `quality`, et correction/version; lire effectivement les tables de cache.
- Réconciliation : cours non nul, devise attendue, séance cohérente, variation maximale expliquée; ticker renommé = incident visible, jamais zéro ou dernier cours silencieux.
- Pour les conversions FX, importer aussi un flux officiel et archivable de la Banque centrale européenne, par exemple le [service de données ECB — Exchange Rates](https://data.ecb.europa.eu/). Comparer les taux documentés, gérer les jours sans fixing et ne pas mélanger date de cours et date de conversion.
- Si les deux sources échouent : conserver le dernier point comme « ancien » mais le retirer du calcul courant/du snapshot complet; afficher sa date. Le « last known » est une information, pas un taux actuel.

**Effort : M** pour abstraire les providers et lire un cache daté; **L** si l’on ajoute plusieurs fournisseurs contractuels, historique long et supervision.

### Inflation

- Garder l’INSEE Mélodi/IPC comme source officielle : [fichier IPC Mélodi](https://api.insee.fr/melodi/file/DS_IPC_PRINC/DS_IPC_PRINC_CSV_FR). Archiver l’URL, la date de téléchargement, le checksum, la période, la géographie, la population, la nomenclature, `BASE_PER` retenue et la formule (moyenne annuelle ou variation intra-annuelle).
- Utiliser le `BASE_PER` réellement sélectionné dans la provenance, pas le libellé codé « base 2025 »; contrôler les 12 mois, trous, doublons et les valeurs de référence. Faire un seul pipeline testable pour Python et Android.
- Calcul quotidien : requêter avec cache HTTP/ETag si possible; n’écrire que les données nouvelles/corrigées. Panne ou changement de format = « non vérifié », ne pas annoncer « à jour ».
- Tests figés par millésime à partir des publications officielles; les tests de réseau sont distincts et non bloquants pour les calculs.

**Effort : M.**

### Barèmes fiscaux et données annuelles du foyer

- Références à surveiller automatiquement : [Légifrance](https://www.legifrance.gouv.fr/), [BOFiP](https://bofip.impots.gouv.fr/), [Impôts.gouv.fr](https://www.impots.gouv.fr/), [URSSAF](https://www.urssaf.fr/). L’outil détecte une nouvelle loi/BOFiP et crée une PR de données avec liens/version; il ne transforme pas automatiquement un titre de dataset en taux fiscal.
- Représenter chaque donnée fiscale par `année de revenus`, `date d’effet`, `juridiction`, `régime/assiette`, `montant`, `source officielle`, `date d’import`, `provisoire/définitif` et note d’interprétation. CSG de placements, revenus du patrimoine, crypto et métaux ne doivent pas partager un seul taux implicite.
- Vérifications : tests golden pour les seuils IR, PFU, moins-values, règles 2074/2086, or physique, frais kilométriques, repas, plafonds 10 %. Différences de taux = tests explicites; date d’effet et rétroactivité vérifiées.
- Le revenu/salaire, les intérêts, frais kilométriques, tickets-repas, comptes étrangers et documents restent des données annuelles du foyer. Une checklist rappelle chaque année les champs à confirmer et importe, quand l’utilisateur le souhaite, le récapitulatif fiscal officiel; aucune ancienne déclaration ne doit être copiée comme certaine.
- Un juriste/fiscaliste ou le contribuable valide toute règle de droit avant adoption; conserver l’ancienne table et les versions passées pour refaire un calcul.

**Effort : M** pour les alertes/PR et versions; **L** pour la couverture fiscale, golden tests et validation de chaque régime.

## Priorité 3 — Rendre la projection retraite honnête et testable

- Séparer « performance observée » et « rendement supposé »; si le TWR n’existe pas, afficher indisponible et permettre une hypothèse, jamais un faux 5 % historique.
- Générer scénarios déterministes à côté de séquences variables : mauvaises premières années, inflation/FX défavorables, frais, retrait du capital, période de longévité, décès/survivant et pension publique à partir de relevés confirmés.
- Montrer médiane, plages et probabilité d’épuisement avec méthode documentée; versionner les hypothèses de rendement et d’impôt avec leur date de référence. Le 31,4 % actuel ne peut pas être présenté comme un taux légal certain en 2055.
- Exporter les hypothèses et chaque projection afin qu’un utilisateur futur sache exactement ce qui a été supposé.

**Effort : M** pour rendre l’incertitude visible; **L** pour une simulation probabiliste validée et l’intégration complète des revenus retraite.

## Priorité 4 — Éprouver la conservation sur plusieurs décennies

1. **Sauvegarde chiffrée automatique** : export CSV/JSON portable des transactions, opérations, snapshots et versions fiscales; chiffrement avant sortie du service; somme de contrôle et rétention connue. L’utilisateur garde au moins une copie hors ligne.
2. **Restauration semestrielle automatisée** dans une base temporaire; comparer comptes de lignes, soldes, quantités, checksums et résultats de calcul; alerter si la restauration ne passe pas.
3. **Schéma migrable** : migrations numérotées et testées sur une copie de plusieurs décennies; conserver la version du moteur de calcul et du schéma utilisées lors de chaque release.
4. **Dépendances verrouillées** : fichier lock/hash, bot de mises à jour de sécurité, revue des migrations majeures et builds reproductibles. Les workflows de marché doivent rester opérationnels lorsque Yahoo/API n’est pas joignable.
5. **Tests sans réseau** : fixtures archivées de cours, FX et INSEE; tests de propriétés (aucune quantité négative, pas de conversion à 1 sans code devise, aucun snapshot complet si une ligne manque); matrices identiques sur Python, JavaScript et SQL.
6. **Suivi de fraîcheur** : alerte si snapshot, inflation, FX ou barème dépassent leur date attendue; incident remonté avec cause, pas message vert en cas de timeout.
7. **Responsabilité mainteneur** : document court pour changer les clés/signatures, migrer de broker, révoquer un secret, restaurer une base, mettre à jour un barème et quitter un fournisseur. Ne pas dépendre d’un compte personnel/assistant IA pour maintenir le produit.

**Effort : M** pour export, verrous et contrôles; **L** pour reprise/restore automatisés, supervision et migration durable.

## Décisions qui nécessitent une validation humaine

- Le périmètre fiscal exact du foyer, broker, précompte et options de régime; les sources citées donnent la règle générale, pas la situation personnelle.
- Le choix d’un fournisseur de cours et ses droits d’archivage/republication.
- La stratégie de remplacement de la clé APK si elle est considérée compromise : certificat de signature actuel, compatibilité des APK déjà installés et diffusion d’une version sûre.
- Les données personnelles stockées dans Supabase, les durées de conservation et le choix de sauvegarde cloud/offline.

## Les 3 choses les plus dangereuses de cette application sont…

1. **La base de portefeuille est ouverte à tous les rôles `anon`/`authenticated`** : une personne ayant l’URL et la clé publishable peut lire, modifier ou supprimer l’historique si les policies déployées correspondent au SQL.
2. **Le keystore APK est placé dans un cache GitHub Actions d’un dépôt public, avec un mot de passe par défaut écrit dans le code** : considérer le certificat de publication comme compromis jusqu’à vérification et plan de rotation.
3. **Des chiffres patrimoniaux et fiscaux plausibles peuvent être calculés sur des données fausses ou incomplètes** : `NAN` valorisé à 1, FX étranger remplacé par le brut, crypto 2086 incomplet, ventes incohérentes et snapshots partiels.

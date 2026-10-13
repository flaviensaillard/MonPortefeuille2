# Migration 011 — exécution contrôlée (schéma seulement)

**État rapporté par le propriétaire le 13/10/2026 : migration effectuée dans Supabase SQL Editor et contrôle des cinq R1 `historique_non_verifie` / `actif=false` réussi.** Le sandbox ne possède pas de connexion SQL pour une relecture indépendante post-migration. Le [run préalable 38369577641](https://github.com/flaviensaillard/MonPortefeuille2/actions/runs/38369577641) est vérifié par l'agent : conclusion `success` sur le commit `9f1e784`, export, restauration, présence des cinq R1 dans l'archive, lecture distante et comparaison archive/base réussis. Cette sauvegarde précède la migration et n'est **pas** un cliché post-migration.

**Portée autorisée : uniquement la structure de `pf2_fiscal_annees`.** La R2
2025 n'est ni insérée, ni validée, ni activée. Aucune PR n'est fusionnée.
Le dépôt est public : ne publier ni archive, ni clé de sauvegarde, ni identifiant,
ni résultat SQL contenant des données personnelles.

## Prérequis bloquants AVANT l'éditeur SQL

1. Sur GitHub Actions, lancer **« Sauvegarde chiffrée »** manuellement, en
   choisissant **`arena/4e8a2b4d-monportefeuille2`** (et non `main`). Il faut
   un run nouveau, postérieur à la décision de migrer, contenant les contrôles
   ajoutés au workflow. Ne jamais relancer `importer_fiscal.yml`.
2. Attendre la conclusion **success** du run entier. Ses étapes doivent avoir
   réussi : export chiffré, restauration de contrôle, vérification de la présence
   des cinq R1 fiscales dans **l'archive restaurée**, upload de l'archive,
   lecture fiscale filtrée en lecture seule, puis **comparaison des empreintes
   archive/lecture distante**. Une étape manquante, annulée ou en échec interdit
   la migration. L'artefact chiffré doit être présent (90 jours) ; le conserver
   dans un endroit sûr avec sa phrase de chiffrement **sans la transmettre**.
3. Le résultat ne doit révéler que cinq lignes R1 (2022–2026), un seul
   propriétaire applicatif et des empreintes identiques dans l'archive et la
   lecture distante. Le workflow ne fait **aucune écriture** dans Supabase.
   Faire l'application SQL rapidement après ce run ; en cas de changement de
   base entre-temps, recommencer la sauvegarde et la comparaison.

**Pourquoi l'exécution est manuelle :** les secrets existants de GitHub Actions
(`SUPABASE_URL` et la clé REST service_role) permettent les requêtes de tables,
mais ne donnent pas de connexion SQL PostgreSQL pour exécuter `ALTER TABLE`.
Le dépôt ne contient pas de RPC d'exécution SQL, et le sandbox ne peut pas
joindre directement le projet Supabase. Ne pas créer de fonction SQL ouverte
via l'API REST ni transmettre un mot de passe au chat.

## Migration, et rien d'autre

Dans l'éditeur SQL du projet Supabase du propriétaire, copier **intégralement**
`migrations/011_fiscal_validation.sql` depuis la branche indiquée ci-dessus et
l'exécuter **une fois** seulement après les étapes 1–3. Le fichier est
transactionnel (`begin` / `commit`) et rejouable, sans insertion de R2. Il ajoute
`statut_validation`, `perimetre_validation`, `actif` avec valeurs par défaut
`historique_non_verifie`, `{}`, `false` pour les lignes déjà présentes ; il
ajoute un contrôle et un index d'unicité des révisions actives par année.
Il ne modifie pas `parametres`, `origine`, `source_ref`, ni l'année ou la révision.
Il n'accorde pas de droit d'écriture à l'APK.

**Contrôle en lecture après SQL** (dans le même éditeur) :

```sql
select annee_revenus, revision, origine, statut_validation, actif,
       md5(parametres::text) as empreinte_parametres
  from public.pf2_fiscal_annees
 order by annee_revenus, revision;
```

Pour le propriétaire concerné : toujours **une R1 pour chacune des années
2022–2026**, `historique_non_verifie` et `actif = false` pour toutes ; aucune R2.
L'empreinte de `parametres` sert seulement à vérifier une égalité avant/après,
**pas** à authentifier l'archive. Ne poster que le nombre de lignes et les
statuts/révisions, jamais les empreintes complètes si l'on ne souhaite pas les
rendre publiques. En cas de résultat différent, ne pas poursuivre vers R2 :
examiner d'abord la transaction de migration et l'historique de sauvegarde.

Ce contrôle ne déclenche **aucune activation** ; la conception et les tests du
lecteur APK ainsi que la validation des règles 2025 restent des travaux séparés.

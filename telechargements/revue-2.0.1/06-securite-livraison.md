# 06 — Rapport sécurité, RLS et livraison Android

**Version examinée :** 2.0.1 · HEAD `7be0e11` · 09/10/2026. Les risques sont classés sur la configuration présente; ce rapport n’a pas tenté d’extraire un cache, d’accéder aux données Supabase ou de reconstruire l’APK.

## S-01 — Les policies Supabase exposent toutes les lignes `pf2_` à `anon`

**Sévérité : BLOQUANT · Effort : L**

**Preuve / scénario :** `migrations/002_rls.sql:36-83` crée des policies `FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)` sur transactions, apports, snapshots, cours, FX, inflation et alertes. `migrations/003_comptes.sql:125-140` fait la même chose pour les comptes et opérations. Le schéma ne comporte pas de propriétaire `user_id` qui limite chaque requête. Le commentaire du SQL reconnaît que tout porteur de la clé publique peut lire et écrire (`002_rls.sql:19-25`).

**Impact :** lecture des transactions/soldes, insertion de lignes, altération/suppression des opérations et corruption de l’historique par tout client qui connaît l’URL et la clé publishable. Une clé publishable/anon est destinée au client, pas à servir de secret; elle doit être accompagnée de policies restrictives. Le dépôt public contient le code d’intégration, et l’application stocke les réglages de connexion localement (`store.js:10-16`).

**Correctif proposé :** ne pas diffuser de données réelles sous ces policies. Introduire une identité et des policies avec `auth.uid()`/propriétaire, droits minimaux par table, politiques séparées par opération, contraintes et tests RLS réels pour anon/authenticated. Revoir aussi l’ancien schéma v1. Effort L, migration et reprise des lignes incluses.

**Références :** [Supabase — sécuriser la Data API](https://supabase.com/docs/guides/database/secure-data), [tables et RLS](https://supabase.com/docs/guides/database/tables).

## S-02 — Le dépôt public met en cache le chemin du keystore; le build fournit un mot de passe par défaut connu

**Sévérité : BLOQUANT · Effort : M**

**Preuve / scénario vérifié :** `.github/workflows/apk.yml:41-44` met le répertoire `keystore` dans `actions/cache` sous la clé fixe `apk-keystore-v1`. `build.sh:48-50,105-116` place `keystore/portefeuille.jks`, le génère si absent, et utilise `KEY_PASS=portefeuille` si aucune variable n’est fournie. Le workflow APK ne définit pas `KEY_PASS` dans `.github/workflows/apk.yml:15-80`. `gh repo view` confirme que `flaviensaillard/MonPortefeuille2` est public. Une lecture non destructive de l’API Actions, le 09/10/2026, renvoie un cache `apk-keystore-v1` sur `refs/heads/main`, créé le 06/10/2026 à 09:26 UTC, taille 2 931 octets. Le contenu n’a volontairement pas été extrait; compte tenu du chemin et de la taille, il faut considérer la clé comme exposée jusqu’à inspection/rotation.

La documentation GitHub recommande de ne jamais placer de credential dans un cache et précise qu’une personne ouvrant une PR peut lire le contenu du cache de la branche de base : [GitHub Actions — sécurité du cache](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching).

**Impact :** un détenteur de la clé privée peut signer un APK portant le certificat de publication et diffuser une mise à jour malveillante aux installations qui acceptent cette signature. Un mot de passe dans le dépôt ne protège pas la clé.

**Correctif proposé :** arrêter de mettre le keystore en cache; considérer la clé actuelle compromise; établir l’impact sur les APK signés, retirer le cache public, remplacer le mécanisme de signature par un secret chiffré à portée minimale (ou service de signature) et versionner les releases sans clobber. La rotation peut rendre incompatibles les mises à jour des installations sideloadées; planifier ce point avant tout rebuild. **Aucune de ces actions n’a été exécutée ici.** Effort M.

## S-03 — Le WebView cumule `file://` universel, JavaScript et pont HTTP natif non limité

**Sévérité : MAJEUR · Effort : M**

**Preuve / scénario :** `MainActivity.java:60-80` active JavaScript, accès fichiers/contenu, accès universel depuis `file://` et désactive Safe Browsing; `:103` expose `NativeBridge` à JavaScript. `NativeBridge.java:81-124` accepte méthode, URL et en-têtes fournis par JavaScript puis ouvre directement l’URL (`:113-132`), sans allowlist d’hôtes/schéma. `AndroidManifest.xml:19` autorise le trafic clair.

Le parcours actuel charge des assets locaux et ouvre les URL HTTP(S) externes dans un autre navigateur (`MainActivity.java:82-93`); aucun exploit XSS n’a été démontré pendant cette revue. Le risque est structurel : en cas d’injection de script dans la page locale ou de changement futur de navigation, les réglages file:// et le pont donnent accès à des lectures fichiers/origines et à des requêtes réseau natives.

**Correctif proposé :** remplacer `file://` par `WebViewAssetLoader`, désactiver l’accès universel et les accès locaux non nécessaires, réactiver Safe Browsing, limiter le pont à une liste courte d’URL HTTPS et de méthodes, valider chaque en-tête et chaque redirection; conserver les sorties HTML échappées. Tester par audit XSS/URL. Effort M.

**Référence :** [Android — WebViews et inclusion de fichiers non sûre](https://developer.android.com/privacy-and-security/risks/webview-unsafe-file-inclusion), [référence `WebSettings`](https://developer.android.com/reference/android/webkit/WebSettings).

## S-04 — Sauvegarde Android autorisée sans règle d’exclusion explicite

**Sévérité : SUGGESTION · Effort : S**

**Preuve / scénario :** `AndroidManifest.xml:11-20` contient `allowBackup=true` et `fullBackupContent=true`. L’application conserve la configuration Supabase et des éléments de patrimoine en stockage WebView (`app/src/main/assets/www/js/store.js:10-12,119-127`; cache alimenté depuis `app.js:64-70,232-243`). Le périmètre exact de sauvegarde WebView n’a pas été validé sur appareil; il ne faut donc pas affirmer que chaque ligne est effectivement transférée.

**Correctif proposé :** définir explicitement les règles Android Auto Backup/Data Extraction, tester un backup et une restauration sur appareil, exclure credentials et données patrimoniales si leur sauvegarde cloud n’est pas le comportement voulu; documenter une exportation chiffrée choisie par l’utilisateur. Effort S.

## S-05 — Version de release fixe et réutilisation de l’asset

**Sévérité : MAJEUR · Effort : S**

**Preuve / scénario :** `.github/workflows/apk.yml:19-21` fixe `VERSION_NAME=2.0.1`/`VERSION_CODE=27`; `:70-78` cible toujours `apk-2.0.1` et `gh release upload --clobber`. Deux builds issus de commits différents peuvent donc remplacer le même APK de release. Le résumé de build rapporte un commit (`:46-56`) mais l’asset téléchargé reste le même nom.

**Correctif proposé :** dériver version/code du tag de release, interdire les versions/code déjà publiés, conserver les assets immuables et publier hash, certificat, commit et attestation de provenance. Effort S.

## S-06 — Une exposition historique de clé Supabase reste à confirmer

**Sévérité : MAJEUR si non révoquée · Effort : S**

**Preuve / scénario :** `.github/workflows/daily.yml:12-14` indique que la v1 a commité des credentials Supabase dans `take_snapshot.py` et `calc_perf.py` et demande de révoquer l’ancienne clé. Le scan de fichiers suivis au HEAD réalisé pour les formes courantes JWT/service-role n’a trouvé aucun motif; il ne contrôle ni tout l’historique Git ni si la clé a effectivement été révoquée.

**Correctif proposé :** confirmer côté Supabase l’invalidation des clés historiques et analyser l’historique/les journaux; une suppression du fichier actuel ne suffit pas. Ne pas recopier de secret dans les rapports ou dans Git. Effort S.

## Décision de diffusion

Le risque RLS est dans le SQL et le risque de keystore est corroboré par un cache Actions existant dans le dépôt public. Ne pas les confondre avec les erreurs Yahoo du sandbox : ce sont deux constats de sécurité indépendants. Aucun cache n’a été supprimé et aucune clé n’a été tournée, conformément au périmètre sans correctif de la phase diagnostique.

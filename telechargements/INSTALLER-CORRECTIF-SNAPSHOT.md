# Correctif : variation depuis le snapshot nocturne

## Ce qui est corrigé

Le direct écrasait le dernier snapshot en mémoire et la progression journalière
était calculée depuis l'avant-dernier enregistrement. Le correctif conserve le
snapshot et ajoute un point en direct distinct, y compris le même jour.
Il corrige les moteurs Python (web Streamlit) et JavaScript (Android).

**Pas de SQL à exécuter. Ne supprimez ni ne modifiez les snapshots Supabase.**
Le point live reste uniquement en mémoire ; le robot nocturne est inchangé.

## 1. Mettre les fichiers sur GitHub

1. Téléchargez et décompressez `correctif-snapshot-2026-10-07.zip`.
2. Dans votre dépôt `flaviensaillard/MonPortefeuille2`, ouvrez la branche qui sert
   au déploiement (habituellement `main`).
3. Remplacez les fichiers par ceux du dossier `fichiers/` de l'archive en
   **conservant exactement les chemins**. N'ajoutez pas le dossier `fichiers`
   lui-même à la racine de votre projet.
4. Enregistrez ces modifications sur GitHub. Les fichiers des tests et le README
   peuvent aussi être remplacés : ils documentent et vérifient la correction.

Depuis l'interface GitHub : ouvrez chaque fichier, cliquez sur le crayon,
remplacez son contenu par le fichier correspondant de l'archive, puis choisissez
« Commit changes ». Pour les nouveaux tests, utilisez « Add file ».
Une seule mise à jour regroupée des fichiers est préférable si vous utilisez git.

Le workflow inclus prépare l'APK **1.7.2**, code Android **19**, afin de ne pas
écraser la release 1.7.0. Si votre APK installé a déjà un code de version supérieur
à 19, augmentez `VERSION_CODE` et choisissez un nouveau `VERSION_NAME` dans
`.github/workflows/apk.yml` avant de lancer la compilation.

Alternative avec git (depuis votre clone, sur votre branche de déploiement) :

```bash
# Après avoir copié le contenu de fichiers/ à la racine de votre clone :
git diff --stat
git add README.md app.py core/session.py app/src/main/assets/www/js/metrics.js \
  app/src/main/assets/www/js/portfolio.js app/src/main/assets/www/js/views.js \
  tests/test_js.js tests/test_twr_portefeuille.py tests/test_progression_snapshot.py \
  .github/workflows/apk.yml
git commit -m "Corriger la progression depuis le snapshot nocturne"
git push
```

## 2A. Si vous utilisez Android

1. Sur GitHub, ouvrez **Actions → Construire l'APK**.
2. Les modifications de `app/` déclenchent normalement une compilation. Attendez
   la fin de la compilation correspondant à votre dernier commit. Sinon, cliquez
   sur **Run workflow**, choisissez la branche mise à jour, puis lancez.
3. Quand le résultat est vert, ouvrez **Releases → APK 1.7.2** et téléchargez
   `Porte-feuille-1.7.2.apk`. Prenez la release précise, pas un ancien lien 1.7.0.
4. Sur le téléphone, ouvrez l'APK et choisissez **Mettre à jour**. Autorisez
   l'installation depuis votre navigateur/gestionnaire de fichiers si Android
   vous le demande.
5. Fermez complètement l'application, rouvrez-la et actualisez les données.

**Ne désinstallez pas d'abord l'ancienne application.** Une mise à jour avec la
même signature conserve normalement vos réglages locaux. Si Android signale un
conflit de signature, arrêtez : il faut retrouver le keystore utilisé pour votre
APK installé. Le workflow utilise le cache de keystore existant ; s'il a expiré,
une nouvelle signature peut être générée et empêcher la mise à jour directe.
Notez vos réglages avant toute réinstallation éventuelle. Ne partagez pas vos
clés Supabase dans la conversation.

## 2B. Si vous utilisez la version web Streamlit

- **Streamlit Community Cloud** : vérifiez que l'application utilise la branche
  et le commit mis à jour. Attendez le redéploiement, puis choisissez **Reboot
  app** dans la gestion de l'application si nécessaire. Rechargez la page et
  utilisez le bouton d'actualisation de l'application.
- **Serveur/local** : mettez à jour les fichiers, redémarrez le processus
  Streamlit comme d'habitude (`streamlit run app.py` pour une installation
  locale), puis rechargez la page.

Un simple rechargement de l'ancienne version ne suffit pas : il faut d'abord
installer le nouveau code ou la nouvelle APK.

## 3. Vérifier le résultat

Avec un snapshot de 72 226,23 € et un direct de 72 529 €, la différence brute en
euros est **+302,77 €**, soit **+0,4192 %**. Ce sont les chiffres du signalement,
pas une garantie de valeur au moment où vous installerez le correctif.

L'application calcule ses pourcentages en **dollars**, change inclus. Le gain en
euros affiché sous un gain USD est son équivalent au taux actuel, pas forcément
la différence des deux valorisations EUR. Si le change est stable et sans flux,
on doit être proche de +0,42 %, plutôt que comparer à 70 115 € d'avant-hier.

Si un écart persiste, relevez : version installée, dernier snapshot (date,
`patrimoine_investi_eur`, `cours_or_usd`, `equivalent_or_oz`), valeur actuelle en
USD et EUR, taux EUR/USD actuel, et éventuels apports/retraits.
Les flux n'ont qu'une date : un apport/retrait effectué après le snapshot mais
le même jour ne peut pas être distingué automatiquement avec ces seules dates.

## Contenu de l'archive

- `fichiers/` : fichiers corrigés à remettre aux mêmes chemins dans le dépôt.
- `correctif.patch` : alternative pour un utilisateur de git, à appliquer avec
  `git apply --check correctif.patch` puis `git apply correctif.patch`, depuis la
  racine d'un clone correspondant à la version de base.
- Ce guide.

Base du patch : `d11a953fd4387c4b391bd1c81adccae52b06e140`.
Si votre code a changé depuis cette base, ne forcez pas un patch qui échoue et
n'écrasez pas vos propres modifications : faites fusionner les changements.

## Vérifications réalisées

- 33 tests Python ciblés : réussis.
- 66 tests JavaScript du moteur : réussis.
- Suite Python hors tests dépendant de Yahoo identifiés : 554 réussis.
- Test de rendu : 26 réussis, 3 échecs déjà présents dans la version de base ;
  aucune erreur JavaScript interceptée.
- Les accès directs à Supabase et Yahoo ne sont pas possibles depuis cet
  environnement. Aucune donnée de production n'a été lue ou modifiée.

L'archive contient du code source, **pas une APK déjà compilée**. Rien n'a été
poussé ni déployé automatiquement sur GitHub pendant la préparation du correctif.

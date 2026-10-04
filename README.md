# Porte-feuille — application Android

Application mobile autonome reprenant **toutes les fonctionnalités de MonPortefeuille 2**
(tableau de bord, portefeuille & opérations, performance, retraite, fiscalité), sans
serveur intermédiaire : l'application parle directement à **votre** base Supabase et à
Yahoo Finance / l'INSEE.

- **Nom** : Porte-feuille · **Paquet** : `com.portefeuille.app`
- **APK** : `dist/Porte-feuille.apk` (Android 8.0 / API 26 et plus)
- **Poids** : environ 190 Ko — aucune bibliothèque tierce, aucun traqueur.

---

## 1. Ce que fait l'application

| Écran | Contenu |
|---|---|
| **Tableau de bord** | Patrimoine total, portefeuille investi, performance TWR depuis le début, épargne de précaution, cash disponible ; flèche **↗ ↘ →** et pourcentage depuis le dernier enregistrement pour chaque actif ; allocation par poche ; rente mensuelle en bas d'écran. |
| **Portefeuille** | Positions détenues, **opérations** (achat / vente / apport / retrait, modifiables et supprimables), **rééquilibrage** (assiette = investi + cash disponible, ordres proposés), **allocation** (cible et fenêtre de dérive par actif, ajout d'actif ou de poche, alerte si le total dépasse 100 %). |
| **Performance** | Période au choix (depuis la veille, mensuelle, mois, année, 1 an, depuis le début, période libre), courbe, gain de marché, apports, volatilité, performance par année, équivalent-or. |
| **Retraite** | Capital projeté à l'année de départ, pouvoir d'achat, rente mensuelle nette perpétuelle, hypothèses modifiables. |
| **Fiscalité** | Situation familiale, **déclaration de base** (salaires, frais réels vs abattement 10 %, cases 1AK / 1BK, revenus étrangers, comptes hors de France), impôt sur le revenu, taux de prélèvement à la source, plus-values (PFU vs barème, case 2OP, 2086 et le seuil de 305 €), guide fiscal par formulaire, bandeau de mise à jour des barèmes. |

### Conventions respectées

- **Le dollar est l'unité de compte** : il s'affiche en blanc, en grand ; l'euro est une
  indication, en bleu, en dessous.
- **Vert si ça monte, rouge si ça baisse, bleu si c'est stable.**
- **Aucune valeur n'est inventée.** Un cours ou un taux de change introuvable est
  signalé ; la ligne est exclue des totaux, jamais remplacée par un chiffre plausible.
- **L'inflation est récupérée par l'application** (INSEE, jeu Mélodi de l'IPC) puis
  enregistrée dans votre table `pf2_inflation` — elle continue d'évoluer dans le temps
  sans intervention.
- **La répartition entre actifs est la vôtre** : l'application ne la « corrige » jamais
  vers une répartition théorique. Elle signale seulement si le total dépasse 100 %.

---

## 2. Première utilisation

1. Installer l'APK (voir §5).
2. Ouvrir l'application : une seule fois, renseigner
   - l'**URL du projet Supabase** (`https://xxxx.supabase.co`) ;
   - la **clé publique (anon key)** — jamais la clé de service.
3. « Tester la connexion », puis « Enregistrer ».

Ces deux valeurs restent **sur le téléphone** (stockage local de l'application). Elles ne
sont envoyées qu'à votre base. Aucun identifiant n'est intégré à l'APK : il n'y en a
aucun à transmettre, et rien à révoquer si le fichier circule.

Un bouton **« Découvrir sans me connecter »** affiche l'application avec un jeu de
données de démonstration, pour juger l'ergonomie avant branchement.

---

## 3. Architecture

```
app/src/main/
├── AndroidManifest.xml
├── java/com/portefeuille/app/
│   ├── MainActivity.java     coque : WebView plein écran, retour, barres système, splash
│   └── NativeBridge.java     réseau natif, vibration, partage, téléchargement INSEE
├── res/                      thème sombre, icône adaptative, mise en page
└── assets/www/               l'application elle-même
    ├── index.html            coque HTML, navigation basse
    ├── css/app.css           thème : cartes, feuilles, graphiques, cibles tactiles ≥ 44 px
    └── js/
        ├── util.js           formatage français, flèches, dates
        ├── models.js         poches, actifs, cibles et bandes de tolérance
        ├── net.js            Yahoo Finance et Supabase (requêtes asynchrones natives)
        ├── store.js          réglages et cache local
        ├── metrics.js        TWR, flux, inflation, rente, projection
        ├── portfolio.js      transactions → positions → valorisation → contexte
        ├── rebalance.js      diagnostic par poche et ordres
        ├── fiscal.js         barèmes, IR, PFU vs barème, guide par formulaire
        ├── ui.js             composants : cartes, feuilles, graphiques SVG
        ├── views.js          les cinq écrans
        └── app.js            navigation, actions, écritures en base
```

**Pourquoi le réseau passe par Java.** Une page servie depuis `file://` a une origine
nulle : de nombreuses API refusent alors les requêtes cross-origin. En confiant les
requêtes à `HttpURLConnection`, l'application se comporte comme n'importe quel client
Android : pas de CORS, pas de préflight, et le téléchargement de l'INSEE (4 Mo) est
analysé côté Java avant de remonter trois nombres à la page.

**Pourquoi une interface en HTML/CSS.** Aucune dépendance à télécharger, un rendu
identique sur toutes les versions d'Android, des animations fluides sans bibliothèque
(graphiques en SVG) et un APK de 190 Ko. La coque native garde la main sur le retour
arrière, les barres système, la vibration, le partage et le splash screen.

---

## 4. Reconstruire l'APK

```bash
# 1. SDK Android (une seule fois)
mkdir -p ~/.cache/android-sdk && cd ~/.cache/android-sdk
curl -sL -o cmd.zip https://dl.google.com/android/repository/commandlinetools-linux-9862592_latest.zip
curl -sL -o plat.zip  https://dl.google.com/android/repository/platform-35_r02.zip
curl -sL -o bt.zip    https://dl.google.com/android/repository/build-tools_r34-linux.zip
unzip -q cmd.zip && mkdir -p platforms build-tools
(cd platforms   && unzip -q ../plat.zip && mv android-15 android-35)
(cd build-tools && unzip -q ../bt.zip   && mv android-14 34.0.0)

# 2. Icônes (optionnel, Pillow)
python3 tools/make_icons.py

# 3. APK signé
./build.sh
```

`build.sh` enchaîne `aapt2 compile` → `aapt2 link` → `javac` → `d8` → `zipalign` →
`apksigner` (v1 + v2 + v3). Il crée le keystore `keystore/portefeuille.jks` s'il
n'existe pas : **ce fichier ne doit jamais être publié** — il est exclu de l'archive
source. Variables utiles : `VERSION_NAME`, `VERSION_CODE`, `KEY_PASS`, `ANDROID_SDK_ROOT`.

### Tests

```bash
node tests/test_js.js     # 53 assertions : formatage, allocation, mesures, fiscalité,
                          # rééquilibrage et chargement complet sur un faux réseau
node tests/test_rendu.js  # 23 assertions : les cinq écrans rendus dans un DOM simulé
node tools/apercu.js      # génère apercu.html : les cinq écrans en cadre téléphone
```

`tests/test_rendu.js` a besoin de `jsdom` :
`npm install jsdom` dans un dossier quelconque, puis adapter le chemin de require en
tête du fichier.

---

## 5. Installer sur le téléphone

1. Copier `Porte-feuille.apk` sur le téléphone (câble, Drive, mail…).
2. Ouvrir le fichier : Android demande l'autorisation d'installer une application
   **source inconnue** — l'accorder pour ce fichier.
3. Si Android affiche « l'application n'a pas été vérifiée », c'est normal : l'APK est
   signé avec un certificat personnel, pas avec celui d'un éditeur du Play Store.

---

## 6. Publier sur GitHub

Dépôt conseillé : `https://github.com/flaviensaillard/MonPortefeuille2`, dossier
`mobile/`, avec l'APK en **Release** :

```bash
git add mobile/
git commit -m "Application Android Porte-feuille"
git push
# puis : Releases > Draft a new release > glisser Porte-feuille.apk
```

À ne **pas** déposer sur un dépôt public : `keystore/portefeuille.jks`, et bien sûr
votre clé Supabase (elle n'est dans aucun fichier du projet).

---

## 7. Limites connues

- Le premier chargement télécharge l'historique complet de chaque titre et de chaque
  paire de devises (comme la version web) : compter 10 à 30 secondes, puis le cache
  local affiche immédiatement vos derniers chiffres au prochain démarrage.
- L'application lit et écrit les tables `pf2_*`, `Config`, `Donnees`, `Projections` et
  `Historique` : les politiques RLS doivent autoriser la clé publique, comme sur la
  version web.

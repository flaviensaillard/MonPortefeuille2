#!/usr/bin/env bash
# Construction de l'APK Porte-feuille — sans Gradle.
#
# La chaîne d'outils du SDK Android suffit : aapt2 pour les ressources, javac
# pour le code, d8 pour le dex, zipalign et apksigner pour la signature. Cela
# évite de dépendre de Gradle et du plugin Android, et rend l'archive
# reproductible avec un simple script shell.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SDK="${ANDROID_SDK_ROOT:-$HOME/.cache/android-sdk}"
BT="$SDK/build-tools/34.0.0"
PLAT="$SDK/platforms/android-35"
AAPT2="$BT/aapt2"
D8="$BT/d8"
ZIPALIGN="$BT/zipalign"
APKSIGNER="$BT/apksigner"
ANDROID_JAR="$PLAT/android.jar"


# Un ecran oublie ne doit pas disparaitre en silence. Si un module declare
# dans index.html manque sur le disque, la construction s'arrete : une APK qui
# perd un onglet sans rien dire est pire qu'une APK qui ne se construit pas.
WWW="$ROOT/app/src/main/assets/www"
for f in js/util.js js/models.js js/net.js js/store.js js/metrics.js js/portfolio.js js/rebalance.js js/ui.js js/fiscal.js js/views.js js/ia.js js/app.js; do
    if [ ! -f "$WWW/$f" ]; then
        echo "Module manquant : $WWW/$f" >&2
        exit 1
    fi
    if ! grep -q "$f" "$WWW/index.html"; then
        echo "$f existe mais n est pas charge par index.html" >&2
        exit 1
    fi
done
for onglet in bord portefeuille performance retraite fiscalite ia; do
    if ! grep -q "data-onglet=\"$onglet\"" "$WWW/index.html"; then
        echo "Onglet $onglet absent de la navigation" >&2
        exit 1
    fi
done

APP="$ROOT/app/src/main"
BUILD="$ROOT/build"
OUT="$ROOT/dist"

VERSION_NAME="${VERSION_NAME:-1.0.0}"
VERSION_CODE="${VERSION_CODE:-1}"
KEYSTORE="$ROOT/keystore/portefeuille.jks"
KEY_PASS="${KEY_PASS:-portefeuille}"
KEY_ALIAS="${KEY_ALIAS:-portefeuille}"

# Le JDK peut ne pas être dans le PATH : on le cherche.
if [ -z "${JAVA_HOME:-}" ]; then
    for cand in /usr/lib/jvm/jdk-11 /usr/lib/jvm/java-11-openjdk* /usr/lib/jvm/default-java; do
        if [ -x "$cand/bin/javac" ]; then
            JAVA_HOME="$cand"
            break
        fi
    done
fi
if [ -n "${JAVA_HOME:-}" ]; then
    export PATH="$JAVA_HOME/bin:$PATH"
fi

for tool in "$AAPT2" "$D8" "$ZIPALIGN" "$APKSIGNER" "$ANDROID_JAR"; do
    [ -e "$tool" ] || { echo "Outil manquant : $tool" >&2; exit 1; }
done

echo "› Nettoyage"
rm -rf "$BUILD"
mkdir -p "$BUILD/obj" "$BUILD/dex" "$BUILD/gen" "$OUT"

echo "› Compilation des ressources"
"$AAPT2" compile --dir "$APP/res" -o "$BUILD/res.zip"

echo "› Édition de liens (aapt2 link)"
"$AAPT2" link \
    -I "$ANDROID_JAR" \
    --manifest "$APP/AndroidManifest.xml" \
    -A "$APP/assets" \
    -o "$BUILD/app.unaligned.apk" \
    --java "$BUILD/gen" \
    -R "$BUILD/res.zip" \
    --auto-add-overlay \
    --min-sdk-version 26 \
    --target-sdk-version 35 \
    --version-code "$VERSION_CODE" \
    --version-name "$VERSION_NAME"

echo "› Compilation Java"
find "$APP/java" "$BUILD/gen" -name '*.java' > "$BUILD/sources.txt"
javac -nowarn -encoding UTF-8 -classpath "$ANDROID_JAR" -d "$BUILD/obj" @"$BUILD/sources.txt"

echo "› Dexage (d8)"
find "$BUILD/obj" -name '*.class' > "$BUILD/classes.txt"
"$D8" --lib "$ANDROID_JAR" --min-api 26 --output "$BUILD/dex" @"$BUILD/classes.txt" >/dev/null

echo "› Assemblage"
cp "$BUILD/app.unaligned.apk" "$BUILD/app.withdex.apk"
( cd "$BUILD/dex" && zip -q -X -j "$BUILD/app.withdex.apk" classes.dex )

echo "› Alignement"
"$ZIPALIGN" -p -f 4 "$BUILD/app.withdex.apk" "$BUILD/app.aligned.apk"

if [ ! -f "$KEYSTORE" ]; then
    echo "› Création du keystore de signature"
    mkdir -p "$(dirname "$KEYSTORE")"
    keytool -genkeypair -v -keystore "$KEYSTORE" -alias "$KEY_ALIAS" \
        -keyalg RSA -keysize 2048 -validity 10950 \
        -storepass "$KEY_PASS" -keypass "$KEY_PASS" \
        -dname "CN=Porte-feuille, OU=Mobile, O=Porte-feuille, L=Aix-les-Bains, C=FR" >/dev/null
fi

echo "› Signature (v1 + v2 + v3)"
"$APKSIGNER" sign --ks "$KEYSTORE" --ks-pass "pass:$KEY_PASS" --key-pass "pass:$KEY_PASS" \
    --ks-key-alias "$KEY_ALIAS" --out "$OUT/Porte-feuille.apk" "$BUILD/app.aligned.apk"

echo "› Vérification"
"$APKSIGNER" verify --print-certs "$OUT/Porte-feuille.apk" | head -12
ls -lh "$OUT/Porte-feuille.apk"
echo "✔ APK prêt : $OUT/Porte-feuille.apk"

#!/usr/bin/env bash
# Réinstalle le SDK Android minimal dans ~/.cache.
#
# POURQUOI CE SCRIPT EXISTE
# Le bac à sable ne conserve pas ~/.cache d'une session à l'autre : à chaque
# nouvelle session, le SDK a disparu et `build.sh` s'arrête sur
# « Outil manquant : aapt2 ». On télécharge donc l'outil en ligne de commande,
# la plateforme et les build-tools. Deux précautions, apprises à leurs dépens :
#   - la dernière version de `cmdline-tools` exige Java 17 ; l'environnement ne
#     fournit que Java 11. On prend donc la version 8512546, compatible ;
#   - les licences doivent être acceptées avant l'installation, sinon
#     sdkmanager refuse silencieusement d'écrire quoi que ce soit.
#
# Usage : bash tools/installer-sdk.sh

set -euo pipefail

SDK="${ANDROID_HOME:-$HOME/.cache/android-sdk}"
OUTILS="$SDK/cmdline-tools"
JDK="/usr/lib/jvm/jdk-11/bin"

mkdir -p "$OUTILS"

if [ ! -x "$OUTILS/latest/bin/sdkmanager" ]; then
    echo "› Téléchargement des outils en ligne de commande"
    curl -sSL -o /tmp/cmdtools.zip \
        "https://dl.google.com/android/repository/commandlinetools-linux-8512546_latest.zip"
    rm -rf "$OUTILS/latest"
    (cd "$OUTILS" && unzip -q /tmp/cmdtools.zip && mv cmdline-tools latest)
    rm -f /tmp/cmdtools.zip
fi

export PATH="$PATH:$OUTILS/latest/bin:$JDK"

echo "› Licences"
mkdir -p "$SDK/licenses"
# Les empreintes des licences Android : acceptées une fois pour toutes.
printf '\n24333f8a63b6825ea9c5514f83c2829b004d1fee' > "$SDK/licenses/android-sdk-license"
printf '\n84831b9409646a918e30573bab4c9c91346d8abd' > "$SDK/licenses/android-sdk-preview-license"
printf '\nd975f751698a77b662f1254ddbeed3901e976f5a' > "$SDK/licenses/intel-android-extra-license"

echo "› Plateforme 35 et build-tools 34"
yes | sdkmanager --licenses >/dev/null 2>&1 || true
sdkmanager --install "platforms;android-35" "build-tools;34.0.0" >/dev/null

echo "✔ SDK prêt : $SDK"
ls "$SDK"

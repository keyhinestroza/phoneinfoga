# shellcheck shell=bash
# env.sh — configuración única de la vía emulada. Todo es sobreescribible
# por variable de entorno. Los demás scripts hacen `source` de este archivo.

# Estado FUERA del repo: el SDK pesa 4-10 GB, jamás cerca de git.
XTV_HOME="${XTV_HOME:-$HOME/.xtv}"

# Si ya existe un SDK de Android (Android Studio), se reutiliza y solo se
# instalan los paquetes que falten.
XTV_SDK="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$XTV_HOME/sdk}}"

XTV_AVD_NAME="${XTV_AVD_NAME:-xtv}"

# Imagen CON Google Play: desde fines de 2025 X exige Play Integrity al hacer
# login (LoginError.AttestationDenied sin GMS). La variante ATD (más ligera)
# solo se adopta si exp1 --try-atd demuestra que el login sobrevive en ella.
XTV_SYSIMG="${XTV_SYSIMG:-system-images;android-35;google_apis_playstore;arm64-v8a}"
XTV_SYSIMG_ATD="${XTV_SYSIMG_ATD:-system-images;android-35;google_atd;arm64-v8a}"

XTV_DEVICE_PROFILE="${XTV_DEVICE_PROFILE:-pixel_6a}"
XTV_SNAPSHOT="${XTV_SNAPSHOT:-golden}"
XTV_ADB_SERIAL="${XTV_ADB_SERIAL:-emulator-5554}"

# La app fue renombrada: soportar ambos package names es obligatorio.
XTV_X_PACKAGES=("com.twitter.android" "com.x.android")

# Presentación
XTV_FULLSCREEN="${XTV_FULLSCREEN:-0}"
# Audio: 'scrcpy' (captura dentro de Android, emulador con -no-audio) o
# 'host' (audio del emulador al Mac, scrcpy --no-audio). exp3 decide.
XTV_AUDIO="${XTV_AUDIO:-scrcpy}"

# cmdline-tools (versión fijada en la URL; el zip lo sirve dl.google.com por HTTPS)
XTV_CMDLINE_TOOLS_URL="${XTV_CMDLINE_TOOLS_URL:-https://dl.google.com/android/repository/commandlinetools-mac-11076708_latest.zip}"

XTV_LOG_DIR="$XTV_HOME/logs"
XTV_STATE_JSON="$XTV_HOME/state.json"
XTV_RESULTS_DIR="${XTV_RESULTS_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/experiments/results}"

# Binarios derivados del SDK
XTV_SDKMANAGER="$XTV_SDK/cmdline-tools/latest/bin/sdkmanager"
XTV_AVDMANAGER="$XTV_SDK/cmdline-tools/latest/bin/avdmanager"
XTV_EMULATOR="$XTV_SDK/emulator/emulator"
XTV_ADB="$XTV_SDK/platform-tools/adb"

# Dry-run global (bootstrap/launch lo activan con --dry-run)
XTV_DRYRUN="${XTV_DRYRUN:-0}"

export ANDROID_SDK_ROOT="$XTV_SDK"
export ANDROID_HOME="$XTV_SDK"

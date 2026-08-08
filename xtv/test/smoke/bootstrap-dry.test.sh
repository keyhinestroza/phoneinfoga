#!/usr/bin/env bash
# bootstrap-dry.test.sh — smoke de bootstrap.sh --dry-run, ejecutable en
# Linux/CI. Asserta el contrato de salida "DRYRUN:" (comandos y config
# esperados) sin tocar el sistema.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOOTSTRAP="$HERE/../../emu/bootstrap.sh"

TMP_HOME="$(mktemp -d)"
trap 'rm -rf "$TMP_HOME"' EXIT

OUT="$(XTV_HOME="$TMP_HOME/.xtv" ANDROID_SDK_ROOT="" ANDROID_HOME="" bash "$BOOTSTRAP" --dry-run 2>&1)"

failures=0
expect() {
  local pattern="$1" desc="$2"
  if grep -qE "$pattern" <<< "$OUT"; then
    echo "[PASS] $desc"
  else
    echo "[FAIL] $desc — patrón no encontrado: $pattern" >&2
    failures=$((failures + 1))
  fi
}

expect 'DRYRUN: curl -fL -o .*cmdline-tools\.zip https://dl\.google\.com/android/repository/commandlinetools-mac-.*_latest\.zip' \
  "descarga cmdline-tools de dl.google.com"
expect 'DRYRUN: .*sdkmanager.* --licenses' \
  "aceptación de licencias vía sdkmanager"
expect 'DRYRUN: .*sdkmanager.* platform-tools emulator system-images;android-35;google_apis_playstore;arm64-v8a' \
  "instala platform-tools + emulator + imagen con Play Store"
expect 'DRYRUN: .*avdmanager create avd -n xtv -k system-images;android-35;google_apis_playstore;arm64-v8a --device pixel_6a' \
  "crea el AVD xtv con perfil pixel_6a"
expect 'DRYRUN: set-config hw\.ramSize=2048' \
  "config: RAM 2048 MB"
expect 'DRYRUN: set-config disk\.dataPartition\.size=4G' \
  "config: userdata 4G"
expect 'DRYRUN: set-config hw\.lcd\.width=720' \
  "config: resolución vertical 720"
expect 'DRYRUN: set-config fastboot\.forceColdBoot=no' \
  "config: quick boot habilitado"

# el dry-run jamás debe tocar el sistema
if [[ -e "$TMP_HOME/.xtv/sdk/cmdline-tools/latest/bin/sdkmanager" ]]; then
  echo "[FAIL] el dry-run descargó/instaló cosas" >&2
  failures=$((failures + 1))
else
  echo "[PASS] el dry-run no instala nada"
fi

# launch.sh --dry-run: la secuencia del doble clic
LAUNCH="$HERE/../../emu/launch.sh"
LOUT="$(XTV_HOME="$TMP_HOME/.xtv" ANDROID_SDK_ROOT="" ANDROID_HOME="" bash "$LAUNCH" --dry-run 2>&1)"
lexpect() {
  local pattern="$1" desc="$2"
  if grep -qE "$pattern" <<< "$LOUT"; then
    echo "[PASS] $desc"
  else
    echo "[FAIL] $desc — patrón no encontrado: $pattern" >&2
    failures=$((failures + 1))
  fi
}
lexpect 'DRYRUN: .*emulator -avd xtv -no-window -snapshot golden -no-snapshot-save -no-boot-anim' \
  "launch: resume headless desde snapshot golden"
lexpect 'DRYRUN: scrcpy .*--window-borderless --always-on-top' \
  "launch: scrcpy sin bordes y always-on-top"
lexpect 'DRYRUN: adb emu kill' \
  "launch: apaga el emulador al cerrar"

if (( failures > 0 )); then
  echo "RESULT: FAIL ($failures asserts)" >&2
  exit 1
fi
echo "RESULT: PASS"

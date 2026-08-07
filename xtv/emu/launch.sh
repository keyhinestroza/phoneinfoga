#!/usr/bin/env bash
# launch.sh — el camino del doble clic. Idempotente: si el emulador ya corre,
# solo reconecta la ventana. Resume del snapshot "golden" (2-6 s) con
# fallback a cold boot + relanzar la app + tap grabado en la pestaña de video.
# Al cerrar la ventana de scrcpy se apaga el emulador (nada de zombis de 3 GB).
#
# Uso: launch.sh [--dry-run]
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=env.sh
source "$HERE/env.sh"
# shellcheck source=lib.sh
source "$HERE/lib.sh"

for arg in "$@"; do
  case "$arg" in
    --dry-run) XTV_DRYRUN=1 ;;
    *) die "argumento desconocido: $arg" ;;
  esac
done

# flags de audio según la ruta elegida (exp3 fija el default en env.sh)
EMU_AUDIO_FLAGS=()
SCRCPY_AUDIO_FLAGS=()
if [[ "$XTV_AUDIO" == "scrcpy" ]]; then
  EMU_AUDIO_FLAGS+=("-no-audio")   # scrcpy captura el audio dentro de Android
else
  SCRCPY_AUDIO_FLAGS+=("--no-audio") # el emulador saca el audio por el host
fi

SCRCPY_FLAGS=(
  -s "$XTV_ADB_SERIAL"
  --window-title "XTV"
  --window-borderless
  --always-on-top
  --stay-awake
)
if [[ "$XTV_FULLSCREEN" == 1 ]]; then
  SCRCPY_FLAGS+=(--fullscreen)
fi

if [[ "$XTV_DRYRUN" == 1 ]]; then
  echo "DRYRUN: $XTV_EMULATOR -avd $XTV_AVD_NAME -no-window -snapshot $XTV_SNAPSHOT -no-snapshot-save -no-boot-anim ${EMU_AUDIO_FLAGS[*]:-}"
  echo "DRYRUN: adb_wait_boot 90"
  echo "DRYRUN: x_to_foreground (fallback cold boot: monkey launcher + tap grabado)"
  echo "DRYRUN: scrcpy ${SCRCPY_FLAGS[*]} ${SCRCPY_AUDIO_FLAGS[*]:-}"
  echo "DRYRUN: adb emu kill"
  exit 0
fi

require_cmd scrcpy "instálalo: brew install scrcpy"
[[ -x "$XTV_EMULATOR" ]] || die "no hay emulador — corre emu/bootstrap.sh"
mkdir -p "$XTV_LOG_DIR"

COLD_BOOT=0
if emulator_running; then
  info "emulador ya corriendo; reconectando ventana"
else
  info "arrancando desde snapshot '$XTV_SNAPSHOT'"
  "$XTV_EMULATOR" -avd "$XTV_AVD_NAME" -no-window \
    -snapshot "$XTV_SNAPSHOT" -no-snapshot-save -no-boot-anim \
    ${EMU_AUDIO_FLAGS[@]+"${EMU_AUDIO_FLAGS[@]}"} \
    >> "$XTV_LOG_DIR/emulator.log" 2>&1 &

  if ! adb_wait_boot 90; then
    warn "el resume no llegó; reintentando con cold boot (30-90 s)"
    adb_ emu kill 2>/dev/null || true
    sleep 2
    COLD_BOOT=1
    "$XTV_EMULATOR" -avd "$XTV_AVD_NAME" -no-window \
      -no-snapshot-load -no-snapshot-save -no-boot-anim \
      ${EMU_AUDIO_FLAGS[@]+"${EMU_AUDIO_FLAGS[@]}"} \
      >> "$XTV_LOG_DIR/emulator.log" 2>&1 &
    adb_wait_boot 180 || die "el emulador no arranca; revisa $XTV_LOG_DIR/emulator.log"
  fi
fi

# Asegurar que X está delante. Tras cold boot, además, intentar el tap grabado
# hacia la pestaña de video.
if ! x_is_foreground; then
  info "trayendo X a primer plano"
  x_to_foreground || warn "no pude lanzar X (¿setup.sh completado?)"
  sleep 2
fi
if [[ "$COLD_BOOT" == 1 && -f "$XTV_STATE_JSON" ]]; then
  TAP=$(grep -o '"video_tab_tap": \[[0-9]*, [0-9]*\]' "$XTV_STATE_JSON" | grep -o '[0-9]*, [0-9]*' || true)
  if [[ -n "$TAP" ]]; then
    sleep 3 # dejar a la app asentarse tras el cold boot
    info "tap grabado hacia la pestaña de video ($TAP)"
    adb_ shell input tap "${TAP/,/ }"
  fi
fi

info "abriendo ventana (cierra la ventana para apagar todo)"
scrcpy "${SCRCPY_FLAGS[@]}" ${SCRCPY_AUDIO_FLAGS[@]+"${SCRCPY_AUDIO_FLAGS[@]}"} \
  2>> "$XTV_LOG_DIR/scrcpy.log" || true

info "apagando emulador"
adb_ emu kill 2>/dev/null || true

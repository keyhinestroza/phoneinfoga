#!/usr/bin/env bash
# exp3-timing.sh — ¿la cadena del doble clic cumple? Cronometra:
#   resume desde snapshot "golden" → boot_completed → X en foreground.
# Repite 3 veces, mide además un cold boot (el fallback), y deja anotado qué
# codec/ruta de audio usar en scrcpy.
#
# Requiere: setup.sh completado (snapshot golden existente).
# Salida: RESULT + results/exp3.json con los tiempos.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=../env.sh
source "$HERE/env.sh"
# shellcheck source=../lib.sh
source "$HERE/lib.sh"

[[ -x "$XTV_EMULATOR" ]] || die "corre primero emu/bootstrap.sh"
mkdir -p "$XTV_RESULTS_DIR" "$XTV_LOG_DIR"

echo "══════════════════════════════════════════════════════════════"
echo " EXP3 · tiempos de la cadena doble clic → feed"
echo "══════════════════════════════════════════════════════════════"

kill_emulator() {
  if emulator_running; then
    adb_ emu kill 2>/dev/null || true
    sleep 3
  fi
}

# Un ciclo de arranque medido. boot_cycle MODO(-snapshot|-cold) → ms al boot y ms a X delante
boot_cycle() {
  local mode="$1"
  local flags=()
  if [[ "$mode" == "snapshot" ]]; then
    flags=(-snapshot "$XTV_SNAPSHOT" -no-snapshot-save)
  else
    flags=(-no-snapshot-load -no-snapshot-save)
  fi
  kill_emulator
  stamp t0
  "$XTV_EMULATOR" -avd "$XTV_AVD_NAME" -no-window -no-boot-anim "${flags[@]}" \
    >> "$XTV_LOG_DIR/exp3-emulator.log" 2>&1 &
  if ! adb_wait_boot 240; then
    echo "-1 -1"
    return
  fi
  stamp t_boot
  if ! x_is_foreground; then
    x_to_foreground || true
  fi
  local waited=0
  while ! x_is_foreground && (( waited < 30 )); do
    sleep 1; waited=$((waited+1))
  done
  stamp t_fg
  echo "$(stamp_delta_ms t0 t_boot) $(stamp_delta_ms t0 t_fg)"
}

info "3 ciclos de resume desde '$XTV_SNAPSHOT'"
WARM_RESULTS=()
for i in 1 2 3; do
  read -r boot_ms fg_ms <<< "$(boot_cycle snapshot)"
  info "  ciclo $i: boot=${boot_ms}ms, X delante=${fg_ms}ms"
  WARM_RESULTS+=("[$boot_ms, $fg_ms]")
done

info "1 ciclo de cold boot (el fallback)"
read -r cold_boot_ms cold_fg_ms <<< "$(boot_cycle cold)"
info "  cold: boot=${cold_boot_ms}ms, X delante=${cold_fg_ms}ms"

kill_emulator

# ---------- prueba manual de scrcpy: codec y audio ----------
cat <<'EOF'

PRUEBA DE SCRCPY (manual, opcional pero recomendada):
  Arranca la cadena completa con cada combinación y anota fluidez y audio:
    XTV_AUDIO=scrcpy emu/launch.sh      # audio capturado dentro de Android
    XTV_AUDIO=host   emu/launch.sh      # audio del emulador por el host
  Y el codec (edita launch.sh o usa scrcpy directo):
    scrcpy --video-codec=h264   vs   scrcpy --video-codec=h265

EOF
AUDIO_CHOICE="untested"
if ask_yn "¿probaste las rutas de audio?"; then
  read -r -p "¿cuál funcionó mejor? [scrcpy/host] " AUDIO_CHOICE
fi

write_result exp3 "$(printf '  "warm_ms_boot_fg": [%s, %s, %s],\n  "cold_ms_boot_fg": [%s, %s],\n  "audio_choice": "%s"' \
  "${WARM_RESULTS[0]}" "${WARM_RESULTS[1]}" "${WARM_RESULTS[2]}" \
  "$cold_boot_ms" "$cold_fg_ms" "$AUDIO_CHOICE")"

echo
if [[ "${WARM_RESULTS[0]}" != "[-1, -1]" ]]; then
  pass "cadena medida. Objetivo de la investigación: 5-12 s de doble clic a video visible"
  echo "RESULT: PASS — revisa results/exp3.json y fija XTV_AUDIO en env.sh"
else
  fail "el resume desde snapshot no funcionó"
  echo "RESULT: FAIL — regraba el snapshot (setup.sh --refresh-snapshot) y reintenta"
fi

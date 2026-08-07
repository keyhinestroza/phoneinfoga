#!/usr/bin/env bash
# exp2-autoadvance.sh — decide el mecanismo de avance: Plan A/B/C.
#   Plan A: Auto-advance NATIVO de X (checkbox del reproductor inmersivo).
#   Plan B: companion APK AccessibilityService (companion/) leyendo rangeInfo.
#   Plan C: MediaSession / timeout (última línea).
#
# Sondas programáticas: uiautomator dump (¿el seekbar expone RangeInfo?) y
# dumpsys media_session (¿X publica posición/duración? — la investigación NO
# lo pudo confirmar; este es el momento empírico).
#
# Salida: RESULT + results/exp2.json → decide si companion/ se compila o no.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=../env.sh
source "$HERE/env.sh"
# shellcheck source=../lib.sh
source "$HERE/lib.sh"

[[ -x "$XTV_EMULATOR" ]] || die "corre primero emu/bootstrap.sh"
mkdir -p "$XTV_RESULTS_DIR" "$XTV_LOG_DIR"

echo "══════════════════════════════════════════════════════════════"
echo " EXP2 · mecanismo de avance: ¿Plan A (nativo), B (a11y) o C?"
echo "══════════════════════════════════════════════════════════════"

if ! emulator_running; then
  info "arrancando emulador con ventana"
  "$XTV_EMULATOR" -avd "$XTV_AVD_NAME" -no-boot-anim \
    >> "$XTV_LOG_DIR/exp2-emulator.log" 2>&1 &
  adb_wait_boot 180 || die "el emulador no arrancó"
fi
pkg="$(detect_x_package)" || die "X no está instalado (emu/setup.sh)"
x_to_foreground || true

# ---------- Plan A: Auto-advance nativo ----------
cat <<'EOF'

PLAN A (en la ventana del emulador):
  1. Toca un video del feed → reproductor inmersivo a pantalla completa.
  2. Menú de tres puntos (⋮) → ¿aparece "Auto-advance"/"Avance automático"?
  3. Actívalo, y deja un video corto reproduciéndose HASTA EL FINAL.
  4. ¿Saltó solo al siguiente video?

EOF
read -r -p "pulsa Enter cuando estés en el reproductor inmersivo con un video sonando... "
screenshot "exp2-immersive-player"

AUTOADVANCE_PRESENT=false
AUTOADVANCE_WORKS=false
if ask_yn "¿existe la opción Auto-advance en el menú?"; then
  AUTOADVANCE_PRESENT=true
  if ask_yn "¿avanzó SOLO al siguiente video al terminar?"; then
    AUTOADVANCE_WORKS=true
  fi
fi

# ---------- Plan B (sonda): ¿el seekbar expone RangeInfo? ----------
info "sonda RangeInfo: vuelve al reproductor inmersivo y toca la pantalla para que se vean los controles"
read -r -p "Enter con los controles visibles... "
UIDUMP="$XTV_RESULTS_DIR/exp2-uidump.xml"
adb_ shell uiautomator dump /sdcard/xtv-uidump.xml >/dev/null 2>&1 || true
adb_ pull /sdcard/xtv-uidump.xml "$UIDUMP" >/dev/null 2>&1 || true

RANGEINFO_NODES=0
SEEKBAR_NODES=0
if [[ -s "$UIDUMP" ]]; then
  # uiautomator no exporta rangeInfo directamente, pero sí la clase SeekBar y
  # atributos de progreso: es el proxy observable del RangeInfo del a11y tree.
  SEEKBAR_NODES=$(grep -o 'SeekBar' "$UIDUMP" | wc -l | tr -d ' ')
  RANGEINFO_NODES=$(grep -oE 'ProgressBar|SeekBar|Slider' "$UIDUMP" | wc -l | tr -d ' ')
  info "nodos tipo barra de progreso en el dump: $RANGEINFO_NODES (SeekBar: $SEEKBAR_NODES)"
else
  warn "no pude obtener el uiautomator dump"
fi

# ---------- Plan C (sonda): ¿X publica MediaSession? ----------
MEDIASESSION_FILE="$XTV_RESULTS_DIR/exp2-media-session.log"
adb_ shell dumpsys media_session > "$MEDIASESSION_FILE" 2>/dev/null || true
MEDIASESSION_PRESENT=false
if grep -q "$pkg" "$MEDIASESSION_FILE" 2>/dev/null; then
  MEDIASESSION_PRESENT=true
  info "¡X SÍ publica MediaSession! extracto:"
  grep -A4 "$pkg" "$MEDIASESSION_FILE" | head -8
else
  info "X no publica MediaSession visible (esperado según la investigación)"
fi

write_result exp2 "$(printf '  "package": "%s",\n  "autoadvance_present": %s,\n  "autoadvance_works": %s,\n  "progressbar_nodes": %s,\n  "seekbar_nodes": %s,\n  "media_session_present": %s' \
  "$pkg" "$AUTOADVANCE_PRESENT" "$AUTOADVANCE_WORKS" "$RANGEINFO_NODES" "$SEEKBAR_NODES" "$MEDIASESSION_PRESENT")"

echo
if [[ "$AUTOADVANCE_WORKS" == true ]]; then
  pass "PLAN A confirmado: Auto-advance nativo funciona — no hace falta el companion"
  echo "RESULT: PASS — Plan A (nativo). Siguiente: setup.sh (si falta) y exp3-timing.sh"
elif [[ "$RANGEINFO_NODES" -gt 0 ]]; then
  warn "sin Auto-advance nativo, pero hay barras de progreso en el árbol de UI"
  echo "RESULT: INCONCLUSIVE — Plan B viable: compila e instala companion/ (ver companion/README.md)"
else
  fail "ni Auto-advance ni barras de progreso visibles"
  echo "RESULT: FAIL — quedan Plan C (media_session: $MEDIASESSION_PRESENT, timeout) o el plan B webview/"
fi

#!/usr/bin/env bash
# exp1-login.sh — EL GATE EXISTENCIAL de la vía emulada.
# Pregunta: ¿el login de la app de X sobrevive a Google Play Integrity dentro
# del AVD? (desde fines de 2025 X exige atestación al iniciar sesión:
# "LoginError.AttestationDenied" sin GMS; en emuladores con Play es lotería).
#
# Salida: RESULT: PASS|FAIL|INCONCLUSIVE y JSON en results/exp1.json.
# Si FALLA incluso con passkey → la vía emulada muere: usa el plan B (webview/)
# o un emulador comercial (docs/alternatives.md).
#
# Uso: exp1-login.sh [--try-atd]   (--try-atd repite en la imagen ATD ligera)
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=../env.sh
source "$HERE/env.sh"
# shellcheck source=../lib.sh
source "$HERE/lib.sh"

TRY_ATD=0
for arg in "$@"; do
  case "$arg" in
    --try-atd) TRY_ATD=1 ;;
    *) die "argumento desconocido: $arg" ;;
  esac
done

[[ -x "$XTV_EMULATOR" ]] || die "corre primero emu/bootstrap.sh"
mkdir -p "$XTV_RESULTS_DIR" "$XTV_LOG_DIR"

echo "══════════════════════════════════════════════════════════════"
echo " EXP1 · ¿el login de X sobrevive a Play Integrity en el AVD?"
echo "══════════════════════════════════════════════════════════════"

# ---------- emulador arriba (con ventana: hay que interactuar) ----------
if ! emulator_running; then
  info "arrancando emulador con ventana"
  "$XTV_EMULATOR" -avd "$XTV_AVD_NAME" -no-boot-anim \
    >> "$XTV_LOG_DIR/exp1-emulator.log" 2>&1 &
  adb_wait_boot 180 || die "el emulador no arrancó"
fi

# ---------- X instalado ----------
if ! pkg="$(detect_x_package)"; then
  warn "X no está instalado en el AVD."
  echo "Instálalo primero con emu/setup.sh (pasos 'instalación del APK') y reintenta."
  exit 1
fi
info "package: $pkg"

# ---------- sonda de logcat ----------
adb_ logcat -c || true
LOGCAT_FILE="$XTV_RESULTS_DIR/exp1-logcat.log"
( adb_ logcat | grep -iE 'Attestation|Integrity|LoginError|DroidGuard|SafetyNet' \
    > "$LOGCAT_FILE" 2>/dev/null ) &
LOGCAT_PID=$!
trap 'kill "$LOGCAT_PID" 2>/dev/null || true' EXIT

x_to_foreground || true
screenshot "exp1-before-login"

cat <<'EOF'

PROTOCOLO (en la ventana del emulador):
  1. Cierra sesión si hubiera una, y prueba el login DIRECTO con usuario y
     contraseña. NO uses "Continuar con Google/Apple".
  2. Si falla con error de atestación o similar:
     · en el navegador del Mac: x.com → Configuración → Seguridad → Passkeys
       → crea una passkey
     · en la app: "Iniciar sesión con passkey"
  3. Observa esta terminal: la sonda de logcat reportará menciones de
     Attestation/Integrity en tiempo real (archivo exp1-logcat.log).

EOF
read -r -p "pulsa Enter cuando hayas terminado (con éxito o sin él)... "
kill "$LOGCAT_PID" 2>/dev/null || true
screenshot "exp1-after-login"

# ---------- veredicto ----------
LOGIN_OK=false
NEEDED_PASSKEY=false
if ask_yn "¿quedaste con la sesión iniciada en la app?"; then
  LOGIN_OK=true
  if ask_yn "¿necesitaste el workaround de passkey?"; then
    NEEDED_PASSKEY=true
  fi
fi

ATTESTATION_HITS=0
if [[ -s "$LOGCAT_FILE" ]]; then
  ATTESTATION_HITS=$(wc -l < "$LOGCAT_FILE" | tr -d ' ')
fi

# ---------- opcional: imagen ATD ----------
ATD_TESTED=false
ATD_LOGIN_OK=false
if [[ "$TRY_ATD" == 1 && "$LOGIN_OK" == true ]]; then
  warn "modo --try-atd: esto crea un segundo AVD con la imagen ATD (más ligera, GMS sin Play Store)"
  if ask_yn "¿continuar? (descarga adicional ~2 GB)"; then
    ATD_TESTED=true
    "$XTV_SDKMANAGER" "$XTV_SYSIMG_ATD"
    "$XTV_AVDMANAGER" create avd -n "${XTV_AVD_NAME}-atd" -k "$XTV_SYSIMG_ATD" \
      --device "$XTV_DEVICE_PROFILE" || true
    adb_ emu kill 2>/dev/null || true
    sleep 2
    "$XTV_EMULATOR" -avd "${XTV_AVD_NAME}-atd" -no-boot-anim \
      >> "$XTV_LOG_DIR/exp1-atd.log" 2>&1 &
    adb_wait_boot 180 || warn "el AVD ATD no arrancó"
    echo "repite la instalación del APK y el login en este AVD ATD"
    read -r -p "Enter cuando termines... "
    if ask_yn "¿login OK también en ATD?"; then
      ATD_LOGIN_OK=true
    fi
  fi
fi

write_result exp1 "$(printf '  "login_ok": %s,\n  "needed_passkey": %s,\n  "attestation_log_lines": %s,\n  "image_used": "%s",\n  "atd_tested": %s,\n  "atd_login_ok": %s' \
  "$LOGIN_OK" "$NEEDED_PASSKEY" "$ATTESTATION_HITS" "$XTV_SYSIMG" "$ATD_TESTED" "$ATD_LOGIN_OK")"

echo
if [[ "$LOGIN_OK" == true ]]; then
  pass "la vía emulada VIVE. Siguiente: exp2-autoadvance.sh"
  echo "RESULT: PASS — login OK (passkey: $NEEDED_PASSKEY)"
else
  fail "login bloqueado: la vía emulada muere aquí"
  echo "Opciones: (a) plan B webview/ (npm start), (b) emulador comercial con"
  echo "Play certificado — docs/alternatives.md (MuMuPlayer Pro / BlueStacks Air)."
  echo "RESULT: FAIL — login bloqueado (líneas de atestación: $ATTESTATION_HITS, ver exp1-logcat.log)"
fi

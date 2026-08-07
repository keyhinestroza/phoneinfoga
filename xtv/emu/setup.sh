#!/usr/bin/env bash
# setup.sh — asistente de configuración de una sola vez. Es interactivo por
# diseño: el login y la activación de Auto-advance son pasos humanos; el
# script orquesta y verifica, no automatiza lo inautomatizable.
#
# Flujo: arranca el emulador con ventana → instala el APK de X → login guiado
# (con sonda de logcat para errores de atestación) → activar Auto-advance →
# grabar coordenadas de la pestaña de video → snapshot "golden" con la app
# abierta en el feed (el corazón del arranque rápido).
#
# Uso:
#   setup.sh                    setup completo
#   setup.sh --refresh-snapshot solo regrabar el snapshot (tras actualizar X)
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=env.sh
source "$HERE/env.sh"
# shellcheck source=lib.sh
source "$HERE/lib.sh"

REFRESH_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --refresh-snapshot) REFRESH_ONLY=1 ;;
    *) die "argumento desconocido: $arg" ;;
  esac
done

[[ -x "$XTV_EMULATOR" ]] || die "no hay emulador en $XTV_EMULATOR — corre primero emu/bootstrap.sh"
mkdir -p "$XTV_LOG_DIR"

# ---------- arranque con ventana ----------
if emulator_running; then
  info "emulador ya corriendo"
else
  info "arrancando emulador (con ventana, primera vez sin snapshot)"
  "$XTV_EMULATOR" -avd "$XTV_AVD_NAME" -no-boot-anim -no-snapshot-load \
    >> "$XTV_LOG_DIR/emulator-setup.log" 2>&1 &
  info "esperando boot (hasta 180 s)"
  adb_wait_boot 180 || die "el emulador no arrancó; revisa $XTV_LOG_DIR/emulator-setup.log"
fi
pass "emulador arriba"

save_snapshot() {
  info "deja la app de X abierta EN EL FEED DE VIDEO y no toques nada"
  read -r -p "pulsa Enter para grabar el snapshot '$XTV_SNAPSHOT'... "
  adb_ emu avd snapshot save "$XTV_SNAPSHOT"
  pass "snapshot '$XTV_SNAPSHOT' guardado"
  if ask_yn "¿apagar el emulador ahora (recomendado)?"; then
    adb_ emu kill || true
  fi
}

if [[ "$REFRESH_ONLY" == 1 ]]; then
  detect_x_package >/dev/null || die "X no está instalado; corre el setup completo"
  save_snapshot
  exit 0
fi

# ---------- instalación del APK ----------
if pkg="$(detect_x_package)"; then
  info "X ya instalado ($pkg)"
else
  cat <<'EOF'

Descarga manual del APK (automatizarla violaría los TOS de APKMirror):
  1. En el Mac, abre https://www.apkmirror.com/apk/x-corp/twitter/
  2. Elige la última versión estable → variante BUNDLE arm64-v8a (.apkm)
  3. Guarda el archivo y pega aquí su ruta.

EOF
  read -r -p "ruta del .apkm (o .apk): " APK_PATH
  APK_PATH="${APK_PATH/#\~/$HOME}"
  [[ -f "$APK_PATH" ]] || die "no existe: $APK_PATH"

  case "$APK_PATH" in
    *.apkm|*.apks|*.zip)
      TMP_DIR="$(mktemp -d)"
      trap 'rm -rf "$TMP_DIR"' EXIT
      info "extrayendo bundle"
      unzip -q -o "$APK_PATH" -d "$TMP_DIR"
      # base + splits relevantes para el AVD (arm64, xhdpi, es/en).
      # Sin mapfile: el bash 3.2 del sistema de macOS no lo tiene.
      SPLITS=()
      while IFS= read -r f; do SPLITS+=("$f"); done < <(find "$TMP_DIR" -name '*.apk' \
        | grep -E 'base\.apk|arm64|xhdpi|\.es\.|\.en\.|config\.es|config\.en' || true)
      if [[ ${#SPLITS[@]} -eq 0 ]]; then
        while IFS= read -r f; do SPLITS+=("$f"); done < <(find "$TMP_DIR" -name '*.apk')
      fi
      info "instalando ${#SPLITS[@]} APKs (install-multiple)"
      adb_ install-multiple -r "${SPLITS[@]}"
      ;;
    *.apk)
      adb_ install -r "$APK_PATH"
      ;;
    *) die "extensión no reconocida (espera .apkm/.apks/.apk)" ;;
  esac
  pkg="$(detect_x_package)" || die "instalado pero no detecto el package de X"
  pass "X instalado: $pkg"
fi

# ---------- login guiado con sonda de atestación ----------
info "arrancando sonda de logcat (errores de atestación) en segundo plano"
adb_ logcat -c || true
LOGCAT_FILE="$XTV_LOG_DIR/login-logcat.log"
( adb_ logcat | grep -iE 'Attestation|Integrity|LoginError|DroidGuard' \
    > "$LOGCAT_FILE" 2>/dev/null ) &
LOGCAT_PID=$!
trap 'kill "$LOGCAT_PID" 2>/dev/null || true' EXIT

x_to_foreground || true
cat <<'EOF'

LOGIN (en la ventana del emulador):
  1. Inicia sesión con usuario y contraseña de X.
  2. Si aparece un error de atestación / "no se pudo iniciar sesión":
     workaround → en tu navegador del Mac entra a x.com → Configuración →
     Seguridad → crea una PASSKEY, y en la app usa "iniciar sesión con passkey".
  3. NO uses "Continuar con Google/Apple".

EOF
read -r -p "pulsa Enter cuando hayas terminado el login... "
kill "$LOGCAT_PID" 2>/dev/null || true
if [[ -s "$LOGCAT_FILE" ]]; then
  warn "la sonda capturó menciones de atestación (revisa $LOGCAT_FILE):"
  head -5 "$LOGCAT_FILE"
else
  info "sonda limpia: sin errores de atestación visibles"
fi
ask_yn "¿quedaste con la sesión iniciada?" || die "sin login no hay vía emulada. Corre emu/experiments/exp1-login.sh para diagnosticar, o usa el plan B (webview/)"

# ---------- Auto-advance ----------
cat <<'EOF'

AUTO-ADVANCE (el corazón del avance automático):
  1. En la app, toca cualquier video del feed → se abre el reproductor
     inmersivo a pantalla completa.
  2. Menú de tres puntos (⋮) del reproductor.
  3. Busca "Auto-advance" / "Avance automático" y actívalo si no lo está.

EOF
AUTOADVANCE=false
if ask_yn "¿encontraste y activaste Auto-advance?"; then
  AUTOADVANCE=true
else
  warn "sin Auto-advance nativo hará falta el companion (companion/README.md); sigue con el setup"
fi

# ---------- coordenadas de la pestaña de video (fallback de cold boot) ----------
cat <<'EOF'

PESTAÑA DE VIDEO: si tu app muestra el botón de video (▶) en la barra
inferior, el launcher lo usará como fallback tras un cold boot.
Mira la ventana del emulador y estima las coordenadas del botón.
EOF
adb_ shell wm size || true
read -r -p "coordenadas X,Y del botón de video (Enter para omitir): " COORDS
TAP_X=""; TAP_Y=""
if [[ "$COORDS" =~ ^([0-9]+)[,[:space:]]+([0-9]+)$ ]]; then
  TAP_X="${BASH_REMATCH[1]}"; TAP_Y="${BASH_REMATCH[2]}"
  info "probando tap en $TAP_X,$TAP_Y"
  adb_ shell input tap "$TAP_X" "$TAP_Y"
  ask_yn "¿te llevó al feed de video?" || { TAP_X=""; TAP_Y=""; warn "coordenadas descartadas"; }
fi

# ---------- estado ----------
mkdir -p "$XTV_HOME"
{
  printf '{\n'
  printf '  "package": "%s",\n' "$pkg"
  printf '  "autoadvance_native": %s,\n' "$AUTOADVANCE"
  if [[ -n "$TAP_X" ]]; then
    printf '  "video_tab_tap": [%s, %s],\n' "$TAP_X" "$TAP_Y"
  else
    printf '  "video_tab_tap": null,\n'
  fi
  printf '  "setup_date": "%s"\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf '}\n'
} > "$XTV_STATE_JSON"
info "estado guardado en $XTV_STATE_JSON"

# ---------- snapshot golden ----------
info "último paso: navega en la app hasta el FEED DE VIDEO (o el timeline donde quieras arrancar cada día)"
save_snapshot

pass "setup completo. Prueba el arranque: emu/launch.sh — y luego genera la app: emu/make-app.sh"

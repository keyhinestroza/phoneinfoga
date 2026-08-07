#!/usr/bin/env bash
# bootstrap.sh — deja el Mac listo para la vía emulada, sin redistribuir nada
# (la licencia del Android SDK prohíbe redistribuir el emulador y las
# imágenes; patrón bootstrapper de google/android-emulator-container-scripts).
#
# Uso:
#   bootstrap.sh                 instalación real (macOS Apple Silicon)
#   bootstrap.sh --dry-run       imprime lo que haría (ejecutable en Linux/CI)
#   bootstrap.sh --accept-licenses  acepta licencias sin prompt (bajo tu
#                                   responsabilidad; por defecto es interactivo)
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=env.sh
source "$HERE/env.sh"
# shellcheck source=lib.sh
source "$HERE/lib.sh"

ACCEPT_LICENSES=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) XTV_DRYRUN=1 ;;
    --accept-licenses) ACCEPT_LICENSES=1 ;;
    *) die "argumento desconocido: $arg" ;;
  esac
done

# ---------- preflight (solo en ejecución real) ----------
if [[ "$XTV_DRYRUN" != 1 ]]; then
  [[ "$(uname -s)" == "Darwin" ]] || die "esto corre en macOS (usa --dry-run en otros SO)"
  [[ "$(uname -m)" == "arm64" ]] || die "se requiere Apple Silicon (imágenes arm64)"
  require_cmd java "instálalo: brew install temurin (lo necesita sdkmanager)"
  require_cmd scrcpy "instálalo: brew install scrcpy (presenta la ventana del emulador)"
  require_cmd curl "curl viene con macOS; revisa tu PATH"
  require_cmd unzip "unzip viene con macOS; revisa tu PATH"
  avail_gb=$(df -g "$HOME" | awk 'NR==2 {print $4}')
  if [[ -n "$avail_gb" && "$avail_gb" -lt 12 ]]; then
    die "se necesitan ~12 GB libres (hay ${avail_gb} GB). Libera espacio y reintenta."
  fi
fi

mkdir -p "$XTV_HOME" "$XTV_LOG_DIR"

# ---------- 1. cmdline-tools ----------
if [[ -x "$XTV_SDKMANAGER" && "$XTV_DRYRUN" != 1 ]]; then
  info "cmdline-tools ya presentes en $XTV_SDK"
else
  info "descargando cmdline-tools"
  run mkdir -p "$XTV_SDK/cmdline-tools"
  run curl -fL -o "$XTV_HOME/cmdline-tools.zip" "$XTV_CMDLINE_TOOLS_URL"
  run unzip -q -o "$XTV_HOME/cmdline-tools.zip" -d "$XTV_SDK/cmdline-tools"
  # el zip extrae a 'cmdline-tools/'; sdkmanager espera vivir en '.../latest'
  run mv "$XTV_SDK/cmdline-tools/cmdline-tools" "$XTV_SDK/cmdline-tools/latest"
  run rm -f "$XTV_HOME/cmdline-tools.zip"
fi

# ---------- 2. licencias ----------
if [[ "$ACCEPT_LICENSES" == 1 ]]; then
  run bash -c "yes | '$XTV_SDKMANAGER' --licenses"
else
  info "acepta las licencias de Google (interactivo; requisito legal)"
  run "$XTV_SDKMANAGER" --licenses
fi

# ---------- 3. paquetes ----------
info "instalando platform-tools + emulator + imagen del sistema (~3-5 GB)"
run "$XTV_SDKMANAGER" "platform-tools" "emulator" "$XTV_SYSIMG"

# ---------- 4. AVD ----------
if [[ "$XTV_DRYRUN" != 1 ]] && "$XTV_AVDMANAGER" list avd 2>/dev/null | grep -q "Name: $XTV_AVD_NAME$"; then
  info "el AVD '$XTV_AVD_NAME' ya existe; no se recrea (bórralo con: avdmanager delete avd -n $XTV_AVD_NAME)"
else
  run "$XTV_AVDMANAGER" create avd -n "$XTV_AVD_NAME" -k "$XTV_SYSIMG" --device "$XTV_DEVICE_PROFILE"
fi

# ---------- 5. config.ini óptimo ----------
AVD_CONFIG="$HOME/.android/avd/$XTV_AVD_NAME.avd/config.ini"
info "aplicando avd-config.ini sobre $AVD_CONFIG"
if [[ "$XTV_DRYRUN" == 1 ]]; then
  while IFS= read -r line; do
    [[ "$line" =~ ^#.*$ || -z "$line" ]] && continue
    echo "DRYRUN: set-config $line"
  done < "$HERE/avd-config.ini"
else
  [[ -f "$AVD_CONFIG" ]] || die "no existe $AVD_CONFIG (¿falló create avd?)"
  while IFS= read -r line; do
    [[ "$line" =~ ^#.*$ || -z "$line" ]] && continue
    key="${line%%=*}"
    # reemplaza la clave si existe; si no, la añade
    if grep -q "^${key}=" "$AVD_CONFIG"; then
      sed -i '' "s|^${key}=.*|${line}|" "$AVD_CONFIG"
    else
      echo "$line" >> "$AVD_CONFIG"
    fi
  done < "$HERE/avd-config.ini"
fi

pass "bootstrap completo. Siguiente paso: emu/experiments/exp1-login.sh (el gate de la vía emulada) o directamente emu/setup.sh"

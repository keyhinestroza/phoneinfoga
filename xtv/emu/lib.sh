# shellcheck shell=bash
# lib.sh — helpers compartidos por bootstrap/setup/launch/experimentos.
# Requiere que env.sh se haya cargado antes.

C_GREEN=$'\033[32m'
C_RED=$'\033[31m'
C_YELLOW=$'\033[33m'
C_BLUE=$'\033[34m'
C_RESET=$'\033[0m'

info() { echo "${C_BLUE}[xtv]${C_RESET} $*"; }
pass() { echo "${C_GREEN}[PASS]${C_RESET} $*"; }
warn() { echo "${C_YELLOW}[WARN]${C_RESET} $*"; }
fail() { echo "${C_RED}[FAIL]${C_RESET} $*" >&2; }
die()  { fail "$@"; exit 1; }

# Ejecuta o imprime según XTV_DRYRUN. El prefijo "DRYRUN:" es un contrato:
# test/smoke/bootstrap-dry.test.sh hace asserts sobre él.
run() {
  if [[ "$XTV_DRYRUN" == 1 ]]; then
    echo "DRYRUN: $*"
  else
    "$@"
  fi
}

require_cmd() {
  local cmd="$1" hint="$2"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    die "falta '$cmd'. $hint"
  fi
}

adb_() { "$XTV_ADB" -s "$XTV_ADB_SERIAL" "$@"; }

# Espera boot completo del emulador (sys.boot_completed + fin de bootanim).
adb_wait_boot() {
  local timeout="${1:-120}" start now
  start=$(date +%s)
  "$XTV_ADB" -s "$XTV_ADB_SERIAL" wait-for-device || return 1
  while true; do
    if [[ "$(adb_ shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == "1" ]]; then
      return 0
    fi
    now=$(date +%s)
    if (( now - start > timeout )); then
      return 1
    fi
    sleep 1
  done
}

# Devuelve el package de X instalado (la app fue renombrada; probar ambos).
detect_x_package() {
  local pkg
  for pkg in "${XTV_X_PACKAGES[@]}"; do
    if adb_ shell pm list packages 2>/dev/null | tr -d '\r' | grep -q "^package:$pkg$"; then
      echo "$pkg"
      return 0
    fi
  done
  return 1
}

# Lleva X a primer plano resolviendo el launcher real con monkey (robusto
# frente a renombres de activities tras la reescritura de jul-2026).
x_to_foreground() {
  local pkg
  pkg="$(detect_x_package)" || return 1
  adb_ shell monkey -p "$pkg" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
}

# ¿X está en primer plano?
x_is_foreground() {
  local pkg
  pkg="$(detect_x_package)" || return 1
  adb_ shell dumpsys window 2>/dev/null | tr -d '\r' | grep -E "mCurrentFocus|mFocusedApp" | grep -q "$pkg"
}

emulator_running() {
  "$XTV_ADB" devices 2>/dev/null | grep -q "^$XTV_ADB_SERIAL[[:space:]]"
}

# Cronómetro con milisegundos. Portable a macOS: sin declare -A (bash 3.2 del
# sistema no lo tiene) y sin date +%N (el date de BSD no lo soporta).
now_ms() {
  perl -MTime::HiRes=time -e 'printf("%d\n", time()*1000)'
}
stamp() { # stamp NOMBRE
  eval "XTV_STAMP_$1=\$(now_ms)"
}
stamp_delta_ms() { # stamp_delta_ms DESDE HASTA
  local from to
  eval "from=\$XTV_STAMP_$1"
  eval "to=\$XTV_STAMP_$2"
  echo $(( to - from ))
}

# Escribe un JSON de resultado de experimento. write_result exp1 '"clave": valor, ...'
write_result() {
  local name="$1" body="$2"
  mkdir -p "$XTV_RESULTS_DIR"
  printf '{\n  "experiment": "%s",\n  "date": "%s",\n%s\n}\n' \
    "$name" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$body" \
    > "$XTV_RESULTS_DIR/$name.json"
  info "resultado guardado en $XTV_RESULTS_DIR/$name.json"
}

# Pregunta sí/no. ask_yn "pregunta" → 0 sí, 1 no.
ask_yn() {
  local answer
  while true; do
    read -r -p "$1 [s/n] " answer
    case "$answer" in
      [sS]|[sS][iI]) return 0 ;;
      [nN]|[nN][oO]) return 1 ;;
      *) echo "responde s o n" ;;
    esac
  done
}

screenshot() { # screenshot NOMBRE → guarda PNG en results/
  mkdir -p "$XTV_RESULTS_DIR"
  adb_ exec-out screencap -p > "$XTV_RESULTS_DIR/$1.png" 2>/dev/null && \
    info "captura: $XTV_RESULTS_DIR/$1.png"
}

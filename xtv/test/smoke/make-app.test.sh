#!/usr/bin/env bash
# make-app.test.sh — genera XTV.app en un directorio temporal (make-app.sh
# solo escribe archivos: funciona también en Linux) y valida la estructura
# del bundle: plist parseable, ejecutable con +x, rutas correctas.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAKE_APP="$HERE/../../emu/make-app.sh"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
OUT_APP="$TMP/XTV.app"

XTV_HOME="$TMP/.xtv" bash "$MAKE_APP" --out "$OUT_APP" >/dev/null

failures=0
check() {
  local desc="$1"; shift
  if "$@"; then
    echo "[PASS] $desc"
  else
    echo "[FAIL] $desc" >&2
    failures=$((failures + 1))
  fi
}

check "estructura Contents/MacOS" test -d "$OUT_APP/Contents/MacOS"
check "estructura Contents/Resources" test -d "$OUT_APP/Contents/Resources"
check "Info.plist existe" test -f "$OUT_APP/Contents/Info.plist"
check "ejecutable xtv existe" test -f "$OUT_APP/Contents/MacOS/xtv"
check "ejecutable con bit +x" test -x "$OUT_APP/Contents/MacOS/xtv"

# plist parseable y con las claves correctas
check "plist válido y CFBundleExecutable=xtv" python3 - "$OUT_APP/Contents/Info.plist" <<'EOF'
import plistlib, sys
with open(sys.argv[1], 'rb') as f:
    p = plistlib.load(f)
assert p['CFBundleExecutable'] == 'xtv', p
assert p['CFBundleIdentifier'] == 'dev.xtv.launcher', p
assert p['CFBundlePackageType'] == 'APPL', p
assert '@@VERSION@@' not in p['CFBundleVersion'], p
EOF

# el ejecutable debe invocar launch.sh con ruta absoluta y loggear a ~/.xtv
check "el ejecutable invoca launch.sh" grep -q 'launch.sh' "$OUT_APP/Contents/MacOS/xtv"
check "el ejecutable usa exec" grep -q '^exec ' "$OUT_APP/Contents/MacOS/xtv"
check "el ejecutable loggea a ~/.xtv/logs" grep -q '.xtv/logs' "$OUT_APP/Contents/MacOS/xtv"
check "sintaxis bash del ejecutable" bash -n "$OUT_APP/Contents/MacOS/xtv"

if (( failures > 0 )); then
  echo "RESULT: FAIL ($failures asserts)" >&2
  exit 1
fi
echo "RESULT: PASS"

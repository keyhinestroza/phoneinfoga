#!/usr/bin/env bash
# make-app.sh — genera XTV.app: un bundle .app artesanal cuyo ejecutable es
# un bash que invoca emu/launch.sh. Sin Platypus, sin Xcode, sin firma: al
# generarse LOCALMENTE en el Mac no lleva atributo de cuarentena y Gatekeeper
# no interviene. Doble clic → icono en el Dock → feed.
#
# Uso: make-app.sh [--out RUTA]   (default: ~/Applications/XTV.app)
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=env.sh
source "$HERE/env.sh"
# shellcheck source=lib.sh
source "$HERE/lib.sh"

OUT="$HOME/Applications/XTV.app"
VERSION="0.1.0"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --out) OUT="$2"; shift 2 ;;
    *) die "argumento desconocido: $1" ;;
  esac
done

LAUNCH_SH="$HERE/launch.sh"
[[ -f "$LAUNCH_SH" ]] || die "no encuentro launch.sh junto a este script"

info "generando bundle en $OUT"
rm -rf "$OUT"
mkdir -p "$OUT/Contents/MacOS" "$OUT/Contents/Resources"

sed "s/@@VERSION@@/$VERSION/g" "$HERE/app-template/Info.plist" \
  > "$OUT/Contents/Info.plist"

cat > "$OUT/Contents/MacOS/xtv" <<EOF
#!/usr/bin/env bash
# Ejecutable de XTV.app — generado por make-app.sh; la lógica vive en launch.sh
# Finder/LaunchServices arranca con PATH mínimo (sin Homebrew): reponerlo,
# o scrcpy no se encontraría nunca en el camino real del doble clic.
export PATH="/opt/homebrew/bin:/usr/local/bin:\$PATH"
mkdir -p "\$HOME/.xtv/logs"
exec "$LAUNCH_SH" >> "\$HOME/.xtv/logs/app.log" 2>&1
EOF
chmod +x "$OUT/Contents/MacOS/xtv"

if [[ -f "$HERE/app-template/xtv.icns" ]]; then
  cp "$HERE/app-template/xtv.icns" "$OUT/Contents/Resources/xtv.icns"
fi

pass "listo: $OUT (ábrelo con doble clic desde Finder)"

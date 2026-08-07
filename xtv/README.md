# xtv — videos de X/Twitter en modo lean-back para macOS

Abres la app, y si tienes la sesión iniciada, empiezan a correr los videos de
tu feed de X uno tras otro, con avance automático al terminar cada uno. Nada
más. Como ver la tele.

Hay **dos vías**, complementarias:

| | Vía emulada (`emu/`) — prioritaria | Vía webview (`webview/`) — plan B |
|---|---|---|
| Qué es | La app Android **oficial** de X corriendo en el Android Emulator, presentada como ventana limpia de macOS | x.com dentro de una app Electron con scripts inyectados |
| Feed | El feed inmersivo de video **real** de la app (estilo TikTok) con el **Auto-advance nativo** de X | El timeline web, con auto-avance construido por inyección |
| Arranque | 5-12 s (resume de snapshot) | ~1 s |
| Peso | 4-10 GB disco, 2.5-4 GB RAM | ~300 MB disco, RAM de un Chrome |
| Riesgo | El login de la app exige Google Play Integrity: **hay que validarlo primero** (`exp1`) | Muy bajo (es una sesión de navegador normal) |

La vía emulada da la máxima fidelidad (la app real, su algoritmo de video
vertical real, su auto-advance nativo); la webview da el arranque instantáneo
y es el paracaídas si X bloquea el login en emulador.

## Requisitos (vía emulada)

- Mac con Apple Silicon (M1 o superior)
- ~12 GB de disco libres
- `brew install temurin scrcpy`
- Una cuenta de X (recomendado: prueba primero con una cuenta secundaria)

## Quickstart

```bash
cd xtv

# ── vía emulada ──
emu/bootstrap.sh                    # descarga SDK + emulador + imagen (~3-5 GB, una vez)
emu/experiments/exp1-login.sh       # GATE: ¿el login sobrevive en el emulador?
emu/experiments/exp2-autoadvance.sh # ¿Auto-advance nativo disponible?
emu/setup.sh                        # login + Auto-advance + snapshot "golden"
emu/make-app.sh                     # genera ~/Applications/XTV.app
open ~/Applications/XTV.app         # doble clic → feed

# ── vía webview (plan B) ──
npm install
npm start                           # login manual la primera vez, y a ver videos
```

La guía completa paso a paso: [`docs/setup-mac.md`](docs/setup-mac.md).

## Mapa del repo

```
emu/        vía emulada: bootstrap, setup asistido, launcher, experimentos
companion/  APK AccessibilityService de reserva (solo si exp2 da negativo)
webview/    app Electron: main + scripts de inyección (selectors/core/autoplay)
test/       tests ejecutables sin Mac: unit (Node) + e2e (Chromium headless) + smoke
docs/       setup, experimentos, decisiones (ADRs), troubleshooting, alternativas
```

## Desarrollo

```bash
make lint       # eslint + bash -n (+ shellcheck si está instalado)
npm test        # unit + e2e (Chromium headless)
make dry-run    # smoke del bootstrap (sin tocar el sistema)
make test-app   # smoke del bundle XTV.app
```

## Advertencias honestas

- **ToS de X**: el auto-avance es automatización de UI y los clientes no
  oficiales están prohibidos por los términos de X. Uso estrictamente
  personal, solo lectura, con ritmo humano (un video completo por avance).
  La investigación no encontró reportes de baneos por este perfil de uso,
  pero el riesgo no es cero.
- **X manda**: tanto el login en emulador (Play Integrity) como el DOM de
  x.com son interruptores que X puede mover en cualquier momento. Este
  proyecto es un artefacto de mantenimiento, no un binario terminado.

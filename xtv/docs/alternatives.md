# Alternativas y caminos descartados

## Emuladores comerciales (si no quieres el bootstrap del AVD)

### MuMuPlayer Pro (NetEase) — la mejor opción llave en mano

- Exclusivo Apple Silicon, motor Android 12, Play Store integrada.
- Lo que lo hace apto para xtv: **ADB habilitable** (127.0.0.1:16384) y CLI
  propia `mumutool` con `open_app` (arrancar directo en X), toolbar
  ocultable (Alt+T), fullscreen.
- Contras: ~72 USD/año (trial de 7 días), y una alegación pública (feb-2026,
  gist con logs) de telemetría agresiva en macOS no descrita en su política
  de privacidad — no verificada independientemente; si lo usas, considera un
  firewall de salida (LuLu/Little Snitch).
- Adaptación: `launch.sh` cambiaría el arranque del AVD por
  `mumutool open_app` + `adb connect 127.0.0.1:16384`; el resto (scrcpy no
  hace falta: MuMu ya presenta ventana) se simplifica.

### BlueStacks Air — gratis, con matices

- Gratis (con anuncios; Prime 7.99 USD/mes los quita), nativo M1-M4,
  Play Store completa, y BlueStacks documenta oficialmente el flujo
  "instala X desde Play Store y haz login".
- Contras para xtv: ADB **no documentado** en Air para Mac (la automatización
  externa queda coja), launcher orientado a juegos, y sin arranque directo a
  una app documentado.
- Útil como **verificación rápida de exp1**: si el login de X funciona en
  BlueStacks Air, la vía emulada es viable en general.

### Genymotion / Google Play Games on PC

- Genymotion: herramienta de desarrollo; sin Play Store integrada (OpenGApps
  aparte), edición personal limitada. Mala base de consumo diario.
- Google Play Games on PC: solo Windows en 2026. Descartado para Mac.

## PlayCover (app iOS de X nativa en Apple Silicon) — DESCARTADO

Tres golpes simultáneos encontrados en la investigación:

1. **X abandonó el Mac**: la app nativa se discontinuó en agosto de 2024 y
   en diciembre de 2025 X bloqueó la instalación de su app de iPad en Mac
   (la Mac App Store la marca incompatible; las instalaciones previas
   sobreviven con la búsqueda rota).
2. **El IPA es radiactivo**: correr X bajo PlayCover exige un IPA descifrado
   (FairPlay), que solo existe en sitios de terceros — elusión de DRM
   (DMCA §1201), riesgo de malware, binarios viejos, y riesgo real de baneo
   (PlayCover mantiene una lista de apps bloqueadas porque los clientes
   pueden detectarse como app modificada/jailbreak).
3. **macOS 26 rompió la automatización**: el keymapping de PlayCover y el
   registro de CGEventTap fallan en Tahoe, y MediaRemote (la vía para leer
   "now playing") está restringido a procesos de Apple desde macOS 15.4.

## API de X — DESCARTADA (confirmado)

- Desde el 6-8 de febrero de 2026: pay-per-use (~$0.005 por post leído,
  $0.015 por post escrito); el plan Free fue descontinuado (vale único de
  $10 para migrados). Un feed de ~500 posts/día ≈ $75/mes solo en lecturas.
- **Sin endpoint del feed "Para ti"**: la API v2 solo expone el home timeline
  cronológico, timelines de usuario, menciones y búsqueda. Ni pagando se
  replica la experiencia.
- Vías no oficiales: guest tokens muertos (ene-2024), Nitter muerto
  (feb-2024), twscrape vivo pero roto cada 2-4 semanas y con riesgo real
  para la cuenta. yt-dlp sirve para descargar un video suelto, no como feed.

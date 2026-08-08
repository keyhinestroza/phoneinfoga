# Decisiones de diseño (ADRs)

Registro corto de cada decisión con su porqué. Contexto completo: la
investigación de agosto de 2026 (2 workflows, 10 agentes) resumida en el
plan del proyecto.

## 1. Vía emulada como camino principal, webview como plan B

El usuario priorizó explícitamente la vía emulada. La investigación la
respalda con matices: es la única que entrega la app real de X (feed de
video vertical real + Auto-advance nativo), a cambio de peso (4-10 GB,
2.5-4 GB RAM), arranque de 5-12 s y un riesgo existencial (login bajo Play
Integrity) que se valida con exp1 antes de invertir más. La webview queda
como paracaídas completo porque su costo marginal es bajo y es la única vía
100 % verificable sin un Mac.

## 2. AVD oficial, no emulador comercial

MuMuPlayer Pro es la mejor base llave en mano pero cuesta ~$72/año y arrastra
una alegación pública de telemetría; BlueStacks Air no documenta ADB en Mac.
El AVD es gratis, arm64 virtualizado (Hypervisor.framework, CPU casi nativa),
el único con snapshots/Quick Boot garantizados y scripting completo — las dos
palancas de esta arquitectura. Contras aceptados: bootstrap de 3-5 GB y más
ingeniería de empaquetado.

## 3. Imagen `google_apis_playstore`, no AOSP/ATD por defecto

X exige Play Integrity al login desde fines de 2025 (`AttestationDenied` sin
GMS). ATD (~40 % más ligera) solo se adopta si `exp1 --try-atd` demuestra que
el login sobrevive en ella.

## 4. Snapshot nombrado "golden", no Quick Boot por defecto

`-snapshot golden -no-snapshot-save`: cada arranque parte del estado bueno
conocido (app abierta en el feed, sesión válida), sin deriva ni corrupción
acumulada del quick-boot-on-exit. El feed se refresca solo al reconectar.
`setup.sh --refresh-snapshot` lo regraba tras actualizar la app.

## 5. Presentación con scrcpy binario, no ya-webadb embebido

`scrcpy --window-borderless --always-on-top` da la ventana limpia con una
dependencia de brew y cero código. La integración fina (decodificar el stream
en un canvas propio con @yume-chan/adb-scrcpy) queda documentada como
evolución si el prototipo gradúa. El WebRTC oficial del emulador solo está
soportado en Linux: descartado.

## 6. Bundle .app artesanal, no Platypus/osacompile/Swift

15 líneas de plist + un bash con `exec`. Generado localmente no lleva
cuarentena (Gatekeeper no interviene), da icono en Dock y doble clic limpio.
`.command` abre Terminal encima (UX inaceptable); osacompile complica logging
y dispara avisos de automatización; Swift+codesign es sobreingeniería para un
prototipo. Siguiente paso natural si gradúa: mini app Swift firmada.

## 7. Companion a11y: esqueleto completo, fuera del MVP

El Plan A (Auto-advance nativo) tiene probabilidad alta y cuesta cero código;
escribir el companion antes de exp2 sería especular. Pero si exp2 falla, el
esqueleto (patrón Laze: rangeInfo genérico, dispatchGesture aleatorizado)
ya está escrito y compilable — se pierde una tarde, no una semana.

## 8. Webview: Electron con BrowserWindow, no Tauri

- Twitter no carga en el tag `<webview>` desde Electron 9 (issue #25421):
  BrowserWindow obligatorio.
- Electron empaqueta su Chromium: inmune a regresiones del WebKit del
  sistema (caso real: beta de macOS 26.3 rompió WKUserScript en apps wry).
- DevTools completas para iterar selectores contra una SPA hostil.
- Persistencia de sesión explícita (`persist:x` + `flushStore()`), frente al
  historial de quirks de cookies de WKWebView (tauri#6330/#11518).
- El costo (~200 MB) es irrelevante para una app personal.

## 9. Sin preload con IPC: pausa vía executeJavaScript

El plan original incluía un preload con contextBridge; en la implementación
la pausa se inyecta con `executeJavaScript` desde el proceso principal
(atajo global `Cmd+Shift+Space`). Menos superficie: la página no recibe
NINGUNA API privilegiada (`contextIsolation: true`, `sandbox: true`, sin
preload).

## 10. Identidad por status-id, decisión en core.js puro

El feed de x.com es virtualizado (React desmonta nodos): toda la lógica usa
status-ids y re-busca nodos al momento. La máquina de decisión (`core.js`)
no toca el DOM: es testeable en Node y la parte con más casos borde
(ended/near-end/timeout, ads, jitter) queda cubierta por tests unitarios.

## 11. Clips de test generados con Chromium, no ffmpeg

El ffmpeg empaquetado de Playwright no trae lavfi. Los clips webm de las
fixtures se generan con canvas.captureStream + MediaRecorder en el propio
Chromium (`test/fixtures/gen-clips.mjs`) y quedan commiteados (~6 KB cada
uno) para que ni CI ni el Mac necesiten regenerarlos.

## 12. API de X: descartada de forma definitiva

Pay-per-use desde feb-2026 (~$0.005/post leído, Free descontinuado) y, lo
decisivo, sin ningún endpoint del feed algorítmico "Para ti". El scraping
no oficial rompe cada 2-4 semanas y arriesga la cuenta. No hay camino aquí.

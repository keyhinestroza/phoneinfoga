# Troubleshooting

## Login

**"AttestationDenied" / no puedo iniciar sesión en la app**
Es Play Integrity (X lo exige desde fines de 2025). En orden:
1. Confirma que usas la imagen `google_apis_playstore` (con Play Store), no
   AOSP/ATD: `grep image.sysdir ~/.android/avd/xtv.avd/config.ini`.
2. Workaround passkey: en el navegador del Mac, x.com → Configuración →
   Seguridad → Passkeys → crear; en la app, "Iniciar sesión con passkey".
3. Abre Play Store en el emulador, inicia sesión con una cuenta de Google y
   deja que se actualicen los servicios; reintenta el login de X.
4. Si nada funciona: la vía emulada no está disponible hoy para tu cuenta.
   Plan B: `npm start` (webview) o docs/alternatives.md.

**La app cerró la sesión y no puedo volver a entrar**
La atestación solo aplica al login, por eso la sesión persistente es oro.
Reintenta con passkey. Para minimizar el riesgo: no borres datos de la app,
no reinstales sin necesidad, y regraba el snapshot tras cualquier login
exitoso (`emu/setup.sh --refresh-snapshot`).

**El primer login pide captcha/verificación por email**
Normal ("unusual login": dispositivo nuevo). Resuélvelo a mano dentro de la
ventana. Evita VPN durante el primer login.

## Snapshot y arranque

**El resume del snapshot no funciona / arranca siempre en frío**
- Los snapshots se invalidan al actualizar emulador o imagen del sistema.
  Regraba: `emu/setup.sh --refresh-snapshot`.
- Verifica que existe: `~/.android/avd/xtv.avd/snapshots/golden/`.
- Mira `~/.xtv/logs/emulator.log` (busca "snapshot").

**Quedó un emulador zombi comiendo RAM**
`~/.xtv/sdk/platform-tools/adb -s emulator-5554 emu kill` (o `pkill -f qemu`).

**El arranque tarda mucho más de 12 s**
`exp3-timing.sh` te da los números reales. Comprueba que no hay otro AVD
corriendo, que el Mac no está en swap (Monitor de Actividad) y que el
snapshot es reciente.

## Video/ventana (scrcpy)

**No hay audio**
Cambia la ruta: `XTV_AUDIO=host emu/launch.sh` (o `scrcpy`). exp3 te deja
probar ambas. Si `scrcpy` falla capturando audio del emulador es un caso
conocido: usa `host`.

**La imagen va a tirones**
Prueba `scrcpy --video-codec=h265` (edítalo en launch.sh), baja la
resolución del AVD (ya es 720x1600) o sube `hw.ramSize` a 3072 en
`~/.android/avd/xtv.avd/config.ini`.

**La ventana no aparece pero el emulador corre**
scrcpy no encontró el device: `adb devices` debe listar `emulator-5554`.
Si usas varios AVDs cambia `XTV_ADB_SERIAL`.

## Actualizaciones de la app de X

Sin Play Store activa la app no se auto-actualiza (bien: estabilidad). Para
actualizar: baja el nuevo .apkm de APKMirror → `emu/setup.sh --reinstall`
(fuerza la reinstalación; `install -r` preserva datos y sesión) → verifica
Auto-advance (exp2) → regraba el snapshot (`--refresh-snapshot`). Si la nueva
versión rompe algo, reinstala la anterior (APKMirror guarda el histórico).

## Webview (plan B)

**No avanza al siguiente video**
X pudo cambiar su DOM. Abre DevTools (View → Toggle Developer Tools),
`window.__xtv.status()` te dice el estado; revisa si
`document.querySelectorAll('article[data-testid="tweet"]')` sigue
devolviendo resultados. Los selectores viven en un solo archivo:
`webview/inject/selectors.js`.

**Pantalla de login en cada arranque**
La sesión no persistió. Cierra la app con Cmd+Q (no matándola), que dispara
el `flushStore()`. Verifica que existe `~/Library/Application
Support/xtv/Partitions/x/`.

**El video no se reproduce solo**
El switch de autoplay debe estar activo — ya lo pone `main.js`
(`autoplay-policy`); si actualizaste Electron a mano, confirma que ese switch
sigue antes de `app.whenReady()`.

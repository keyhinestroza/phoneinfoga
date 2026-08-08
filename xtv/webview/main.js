/*
 * main.js — proceso principal de la app Electron (Plan B / paracaídas).
 *
 * Decisiones fijadas por la investigación:
 *  - BrowserWindow, JAMÁS el tag <webview> (roto con Twitter desde Electron 9,
 *    electron/electron#25421).
 *  - Partición 'persist:x': cookies/localStorage sobreviven reinicios; el
 *    login se hace UNA vez, manual, con usuario/contraseña o passkey.
 *    Nunca "Sign in with Google/Apple": bloqueado dentro de webviews.
 *  - User-agent de Chrome estable sin el token "Electron/x.y": con el UA por
 *    defecto x.com puede degradar o bloquear.
 *  - flushStore() en before-quit: sin esto la sesión puede perderse en
 *    cierres bruscos.
 *  - contextIsolation on, nodeIntegration off, sin preload: la página no
 *    recibe ninguna API privilegiada. La pausa se inyecta con
 *    executeJavaScript desde aquí.
 */
const { app, BrowserWindow, globalShortcut, session } = require('electron');
const fs = require('fs');
const path = require('path');

// Autoplay sin gesto del usuario: imprescindible para el avance automático.
// Debe fijarse antes de app.ready.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const PARTITION = 'persist:x';
// XTV_START_URL: override de desarrollo (p. ej. el fixture de test) para
// probar la inyección sin depender de x.com ni de una sesión.
const START_URL = process.env.XTV_START_URL || 'https://x.com/home';

// UA de Chrome estable (sin token Electron). Actualizar el número mayor de
// vez en cuando junto con la versión de Electron.
const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

const INJECT_DIR = path.join(__dirname, 'inject');

function readInject(name) {
  return fs.readFileSync(path.join(INJECT_DIR, name), 'utf8');
}

let win = null;

// Override de WebAuthn/passkey. X consulta isUVPAA() y, si cree que hay un
// autenticador de plataforma, dispara navigator.credentials.get(); dentro de
// Electron eso arranca la búsqueda FIDO por Bluetooth/dispositivo cercano que
// nunca resuelve y la pantalla "Clave de paso" se queda colgada. Declaramos
// que no hay passkey y hacemos que get()/create() rechacen de inmediato, así
// X ofrece contraseña/código. Se inyecta vía el debugger
// (Page.addScriptToEvaluateOnNewDocument) en vez de un <script>: corre en el
// mundo principal, antes que el código de la página, y la CSP de x.com —que
// bloquea los scripts inline— no puede impedirlo.
const WEBAUTHN_OVERRIDE = `(function () {
  try {
    if (navigator.credentials) {
      var reject = function () {
        return Promise.reject(new DOMException('WebAuthn deshabilitado en xtv', 'NotAllowedError'));
      };
      navigator.credentials.get = reject;
      navigator.credentials.create = reject;
    }
    if (window.PublicKeyCredential) {
      window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable = function () {
        return Promise.resolve(false);
      };
      window.PublicKeyCredential.isConditionalMediationAvailable = function () {
        return Promise.resolve(false);
      };
    }
  } catch (e) { /* no romper la página */ }
})();`;

// Se inyecta vía executeJavaScript (NO un <script> inline): executeJavaScript
// corre inyectado por el proceso de navegador, exento de la CSP de x.com que
// bloquea los scripts inline. La pantalla de passkey aparece tras varios
// pasos de login, así que aplicarlo en dom-ready y en cada navegación llega
// de sobra antes de que X llame a credentials.get().
function injectWebAuthnOverride(wc) {
  wc.executeJavaScript(WEBAUTHN_OVERRIDE).catch(() => {});
}

function injectJS(contents) {
  const files = ['selectors.js', 'core.js', 'autoplay.js'];
  if (process.env.XTV_DIAG) {
    files.push('diag.js');
  }
  const js = files.map(readInject).join('\n;\n');
  contents.executeJavaScript(js).catch((err) => {
    console.error('[xtv] fallo inyectando scripts:', err.message);
  });
}

function createWindow() {
  const ses = session.fromPartition(PARTITION);
  ses.setUserAgent(CHROME_UA);

  win = new BrowserWindow({
    // ≥1000px: x.com usa el layout de escritorio completo (con el sidebar
    // derecho) igual que en un navegador normal; por debajo colapsa a un
    // layout angosto que puede alterar el feed.
    width: 1100,
    height: 1000,
    title: 'XTV',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#000000',
    webPreferences: {
      partition: PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.setMenuBarVisibility(false);

  const wc = win.webContents;
  wc.setUserAgent(CHROME_UA);

  // En modo diagnóstico, reenviar la consola del renderer al stdout.
  if (process.env.XTV_SHOT) {
    wc.on('console-message', (_e, _level, message) => {
      console.log('[renderer]', message);
    });
  }

  // El override de passkey se aplica lo antes posible (dom-ready) y se re-aplica
  // en cada navegación, porque cada documento nuevo restablece navigator.
  wc.on('dom-ready', () => injectWebAuthnOverride(wc));
  wc.on('did-start-navigation', () => injectWebAuthnOverride(wc));
  wc.on('did-navigate', () => injectWebAuthnOverride(wc));

  // CSS solo en cargas completas (insertCSS ACUMULA hojas si se repite; en
  // navegación SPA el documento persiste y la hoja sigue aplicada). El JS sí
  // se re-inyecta en cada navegación: es idempotente (guard + reobserve).
  wc.on('did-finish-load', () => {
    injectWebAuthnOverride(wc);
    wc.insertCSS(readInject('hide-ui.css')).catch(() => {});
    injectJS(wc);
  });
  wc.on('did-navigate-in-page', () => {
    injectWebAuthnOverride(wc);
    injectJS(wc);
  });

  win.loadURL(START_URL);
  win.on('closed', () => {
    win = null;
  });
}

// Modo diagnóstico sin pantalla: XTV_SHOT=/ruta/prefijo hace capturas de la
// ventana a los 6, 12 y 20 s y sale. Útil para smoke-tests en entornos
// headless (xvfb) donde no se puede mirar la ventana.
function armShotMode(w) {
  const prefix = process.env.XTV_SHOT;
  if (!prefix) {
    return;
  }
  const delays = [6000, 12000, 20000];
  delays.forEach((ms, i) => {
    setTimeout(() => {
      w.webContents
        .capturePage()
        .then((img) => {
          fs.writeFileSync(`${prefix}-${i + 1}.png`, img.toPNG());
          console.log(`[xtv] captura ${i + 1} guardada`);
          if (i === delays.length - 1) {
            app.quit();
          }
        })
        .catch((err) => console.error('[xtv] captura falló:', err.message));
    }, ms);
  });
}

app.whenReady().then(() => {
  createWindow();
  armShotMode(win);

  // Cmd+Shift+Space: pausar/reanudar el auto-avance y el video actual.
  globalShortcut.register('CommandOrControl+Shift+Space', () => {
    if (!win) {
      return;
    }
    win.webContents
      .executeJavaScript(
        'window.__xtv && (window.__xtv.state.paused ? window.__xtv.resume() : window.__xtv.pause())'
      )
      .catch(() => {});
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Persistir cookies de forma explícita antes de salir. Con guard de
// reentrada y timeout de seguridad: la primera pasada intercepta el cierre y
// hace el flush; la segunda (via app.quit()) sigue el flujo normal, de modo
// que will-quit y el resto de handlers se ejecutan.
let cookiesFlushed = false;
app.on('before-quit', (event) => {
  if (cookiesFlushed) {
    return;
  }
  event.preventDefault();
  cookiesFlushed = true;
  const ses = session.fromPartition(PARTITION);
  const quit = () => app.quit();
  const safety = setTimeout(quit, 2000);
  ses.cookies
    .flushStore()
    .catch(() => {})
    .finally(() => {
      clearTimeout(safety);
      quit();
    });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  app.quit();
});

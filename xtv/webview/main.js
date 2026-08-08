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
const START_URL = 'https://x.com/home';

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

function injectJS(contents) {
  const js = [
    readInject('selectors.js'),
    readInject('core.js'),
    readInject('autoplay.js'),
  ].join('\n;\n');
  contents.executeJavaScript(js).catch((err) => {
    console.error('[xtv] fallo inyectando scripts:', err.message);
  });
}

function createWindow() {
  const ses = session.fromPartition(PARTITION);
  ses.setUserAgent(CHROME_UA);

  win = new BrowserWindow({
    width: 760,
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

  // CSS solo en cargas completas (insertCSS ACUMULA hojas si se repite; en
  // navegación SPA el documento persiste y la hoja sigue aplicada). El JS sí
  // se re-inyecta en cada navegación: es idempotente (guard + reobserve).
  wc.on('did-finish-load', () => {
    wc.insertCSS(readInject('hide-ui.css')).catch(() => {});
    injectJS(wc);
  });
  wc.on('did-navigate-in-page', () => injectJS(wc));

  win.loadURL(START_URL);
  win.on('closed', () => {
    win = null;
  });
}

app.whenReady().then(() => {
  createWindow();

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

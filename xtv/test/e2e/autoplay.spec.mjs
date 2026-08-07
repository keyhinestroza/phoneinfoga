/*
 * autoplay.spec.mjs — e2e de la lógica inyectada en Chromium headless real
 * (mismo motor que Electron), sobre el fixture que replica el contrato DOM
 * de x.com. Cubre: loop=false forzado, avance al terminar, salto de ads,
 * supervivencia a la virtualización (nodos desmontados/insertados),
 * fallback tecla 'j' y loop re-forzado hostil.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INJECT = path.join(HERE, '../../webview/inject');
const FIXTURE = 'file://' + path.join(HERE, '../fixtures/feed.html');

// Config acelerada para tests (la real usa jitter 500-2000ms)
const TEST_CONFIG = {
  jitterMinMs: 30,
  jitterMaxMs: 80,
  confirmMs: 400,
};

function chromiumPath() {
  if (process.env.XTV_CHROMIUM) {
    return process.env.XTV_CHROMIUM;
  }
  if (fs.existsSync('/opt/pw-browsers/chromium')) {
    return '/opt/pw-browsers/chromium';
  }
  return undefined;
}

let browser;

before(async () => {
  browser = await chromium.launch({
    executablePath: chromiumPath(),
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
  });
});

after(async () => {
  if (browser) {
    await browser.close();
  }
});

async function openFeed({ preInject } = {}) {
  const page = await browser.newPage({ viewport: { width: 800, height: 700 } });
  await page.goto(FIXTURE);
  await page.evaluate((cfg) => {
    window.__XTV_CONFIG = cfg;
  }, TEST_CONFIG);
  if (preInject) {
    await page.evaluate(preInject);
  }
  // misma vía de inyección que executeJavaScript de Electron
  for (const f of ['selectors.js', 'core.js', 'autoplay.js']) {
    await page.addScriptTag({
      content: fs.readFileSync(path.join(INJECT, f), 'utf8'),
    });
  }
  return page;
}

function waitForCurrentId(page, id, timeout = 15000) {
  return page.waitForFunction(
    (want) => window.__xtv && window.__xtv.state.currentId === want,
    id,
    { timeout }
  );
}

test('adopción: loop=false en el video activo y currentId inicial', async () => {
  const page = await openFeed();
  await waitForCurrentId(page, '1001', 5000);
  const loop = await page.evaluate(
    () => document.querySelector('video').loop
  );
  assert.equal(loop, false, 'video.loop debe quedar en false tras adoptarlo');
  await page.close();
});

test('avanza al terminar el clip y salta el promocionado (1001→1002→1004)', async () => {
  const page = await openFeed();
  await waitForCurrentId(page, '1001', 5000);
  await waitForCurrentId(page, '1002');
  // el 1003 es placementTracking: pickNext debe saltarlo
  await waitForCurrentId(page, '1004');
  const status = await page.evaluate(() => window.__xtv.status());
  assert.equal(status.currentId, '1004');
  await page.close();
});

test('sobrevive a la virtualización: nodos desmontados e insertados', async () => {
  const page = await openFeed();
  await waitForCurrentId(page, '1002');
  // Simular el virtualizador de React: desmonta lo ya visto e inserta un
  // article nuevo al final (como hace el timeline infinito).
  await page.evaluate(() => {
    const articles = document.querySelectorAll('article');
    articles[0].remove(); // 1001, ya visto
    const el = document.createElement('article');
    el.setAttribute('data-testid', 'tweet');
    el.innerHTML =
      '<a href="/userD/status/1005">post 1005</a>' +
      '<div data-testid="videoPlayer">' +
      '<video src="assets/clip1.webm" muted loop playsinline></video></div>';
    document.querySelector('[data-testid="primaryColumn"]').appendChild(el);
  });
  await waitForCurrentId(page, '1004');
  await waitForCurrentId(page, '1005');
  await page.close();
});

test('fallback tecla j cuando el scroll no surte efecto', async () => {
  const page = await openFeed({
    preInject: () => {
      // anular scrollIntoView simula un DOM donde el scroll no funciona
      Element.prototype.scrollIntoView = () => {};
      window.__jPresses = 0;
      document.addEventListener('keydown', (e) => {
        if (e.key === 'j') {
          window.__jPresses++;
        }
      });
    },
  });
  await waitForCurrentId(page, '1001', 5000);
  await page.waitForFunction(() => window.__jPresses > 0, undefined, {
    timeout: 15000,
  });
  const presses = await page.evaluate(() => window.__jPresses);
  assert.ok(presses > 0, 'debe despachar el atajo nativo j como fallback');
  await page.close();
});

test('loop re-forzado hostil: avanza igualmente por la vía near-end', async () => {
  const page = await openFeed({
    preInject: () => {
      // simular un player que re-activa loop constantemente (como hace X)
      setInterval(() => {
        const v = document.querySelector('video');
        if (v) {
          v.loop = true;
        }
      }, 60);
    },
  });
  await waitForCurrentId(page, '1001', 5000);
  await waitForCurrentId(page, '1002');
  await page.close();
});

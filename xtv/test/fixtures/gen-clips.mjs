/*
 * gen-clips.mjs — genera los clips webm de prueba SIN ffmpeg.
 *
 * El ffmpeg empaquetado de Playwright no trae lavfi, así que los clips se
 * generan con el propio Chromium: canvas animado + captureStream() +
 * MediaRecorder (VP8). Clips de ~1.2 s, 96x160 (vertical, como un video de
 * X), unos pocos KB cada uno. Se ejecuta una vez (`make fixtures`) y los
 * .webm quedan commiteados en assets/ para que ni el CI ni el Mac del
 * usuario necesiten regenerarlos.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(HERE, 'assets');

function chromiumPath() {
  if (process.env.XTV_CHROMIUM) {
    return process.env.XTV_CHROMIUM;
  }
  const pw = '/opt/pw-browsers/chromium';
  if (fs.existsSync(pw)) {
    return pw;
  }
  return undefined; // dejar que playwright-core resuelva su instalación local
}

const CLIPS = [
  { name: 'clip1.webm', hue: 0, seconds: 1.2 },
  { name: 'clip2.webm', hue: 90, seconds: 1.2 },
  { name: 'clip3.webm', hue: 180, seconds: 1.2 },
  { name: 'clip4.webm', hue: 270, seconds: 1.2 },
];

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({
    executablePath: chromiumPath(),
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage();
  await page.goto('about:blank');

  for (const clip of CLIPS) {
    const base64 = await page.evaluate(
      ({ hue, seconds }) =>
        new Promise((resolve, reject) => {
          const canvas = document.createElement('canvas');
          canvas.width = 96;
          canvas.height = 160;
          const ctx = canvas.getContext('2d');
          let frame = 0;
          const interval = setInterval(() => {
            ctx.fillStyle = `hsl(${(hue + frame * 7) % 360}, 80%, 50%)`;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#fff';
            ctx.font = '24px sans-serif';
            ctx.fillText(String(frame), 10, 40);
            frame++;
          }, 50);

          const stream = canvas.captureStream(20);
          const recorder = new MediaRecorder(stream, {
            mimeType: 'video/webm;codecs=vp8',
            videoBitsPerSecond: 60000,
          });
          const chunks = [];
          recorder.ondataavailable = (e) => chunks.push(e.data);
          recorder.onerror = (e) => reject(e.error || new Error('recorder'));
          recorder.onstop = () => {
            clearInterval(interval);
            const blob = new Blob(chunks, { type: 'video/webm' });
            const reader = new FileReader();
            reader.onload = () =>
              resolve(String(reader.result).split(',')[1]);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
          };
          recorder.start();
          setTimeout(() => recorder.stop(), seconds * 1000);
        }),
      clip
    );
    const file = path.join(OUT_DIR, clip.name);
    fs.writeFileSync(file, Buffer.from(base64, 'base64'));
    console.log(`${clip.name}: ${fs.statSync(file).size} bytes`);
  }

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

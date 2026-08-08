import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../../webview/inject/core.js');

const CFG = {
  endThresholdSec: 0.35,
  maxVideoMs: 600000,
  jitterMinMs: 500,
  jitterMaxMs: 2000,
  confirmMs: 1500,
};

test('shouldAdvance: dispara con ended', () => {
  const d = core.shouldAdvance(
    { endedFired: true, currentTime: 0, duration: 10, elapsedMs: 100 },
    CFG
  );
  assert.deepEqual(d, { advance: true, reason: 'ended' });
});

test('shouldAdvance: respaldo near-end cuando ended nunca llega (loop hostil)', () => {
  const d = core.shouldAdvance(
    { endedFired: false, currentTime: 9.7, duration: 10, elapsedMs: 9700 },
    CFG
  );
  assert.deepEqual(d, { advance: true, reason: 'near-end' });
});

test('shouldAdvance: no dispara a mitad de video', () => {
  const d = core.shouldAdvance(
    { endedFired: false, currentTime: 5, duration: 10, elapsedMs: 5000 },
    CFG
  );
  assert.equal(d.advance, false);
});

test('shouldAdvance: timeout duro para lives/duración desconocida (NaN)', () => {
  const d = core.shouldAdvance(
    { endedFired: false, currentTime: 500, duration: NaN, elapsedMs: 600001 },
    CFG
  );
  assert.deepEqual(d, { advance: true, reason: 'timeout' });
});

test('shouldAdvance: duración Infinity (live) no dispara near-end', () => {
  const d = core.shouldAdvance(
    { endedFired: false, currentTime: 100, duration: Infinity, elapsedMs: 1000 },
    CFG
  );
  assert.equal(d.advance, false);
});

test('pickNext: siguiente con video, saltando ads', () => {
  const cands = [
    { id: '1', hasVideo: true, isAd: false },
    { id: '2', hasVideo: false, isAd: false },
    { id: '3', hasVideo: true, isAd: true },
    { id: '4', hasVideo: true, isAd: false },
  ];
  assert.equal(core.pickNext(cands, '1').id, '4');
});

test('pickNext: currentId desmontado por la virtualización → primer candidato válido', () => {
  const cands = [
    { id: '7', hasVideo: true, isAd: false },
    { id: '8', hasVideo: true, isAd: false },
  ];
  // '1' ya no existe en la lista
  assert.equal(core.pickNext(cands, '1').id, '7');
});

test('pickNext: sin candidatos hacia delante → null', () => {
  const cands = [{ id: '1', hasVideo: true, isAd: false }];
  assert.equal(core.pickNext(cands, '1'), null);
});

test('pickNext: no repite el video actual', () => {
  const cands = [
    { id: '1', hasVideo: true, isAd: false },
    { id: '1', hasVideo: true, isAd: false },
  ];
  assert.equal(core.pickNext(cands, '1'), null);
});

test('jitter: dentro del rango, con reloj inyectado', () => {
  assert.equal(core.jitter(CFG, () => 0), 500);
  const top = core.jitter(CFG, () => 0.999999);
  assert.ok(top >= 1999 && top <= 2000);
  const mid = core.jitter(CFG, () => 0.5);
  assert.ok(mid >= 500 && mid <= 2000);
});

test('DEFAULTS: valores de la investigación', () => {
  assert.equal(core.DEFAULTS.endThresholdSec, 0.35);
  assert.equal(core.DEFAULTS.maxVideoMs, 600000);
});

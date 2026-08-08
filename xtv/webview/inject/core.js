/*
 * core.js — máquina de decisión PURA del auto-avance. Sin una sola referencia
 * al DOM: testeable en Node con node:test (test/unit/core.test.mjs).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.XTVCore = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DEFAULTS = {
    /* 'ended' puede no llegar si el player re-fuerza loop: el respaldo dispara
     * cuando quedan menos de endThresholdSec para el final. */
    endThresholdSec: 0.35,
    /* Escape para lives, ads infinitos o videos sin duración conocida. */
    maxVideoMs: 10 * 60 * 1000,
    /* Jitter humano antes de avanzar: evita un patrón perfectamente periódico. */
    jitterMinMs: 500,
    jitterMaxMs: 2000,
    /* Tras pedir el scroll, tiempo para confirmar que el siguiente video quedó
     * activo antes de recurrir al fallback (tecla 'j'). */
    confirmMs: 1500,
  };

  /*
   * ¿Toca avanzar? snapshot = {endedFired, currentTime, duration, elapsedMs}.
   * Devuelve {advance: bool, reason: 'ended'|'near-end'|'timeout'|null}.
   */
  function shouldAdvance(snapshot, cfg) {
    cfg = cfg || DEFAULTS;
    if (snapshot.endedFired) {
      return { advance: true, reason: 'ended' };
    }
    var d = snapshot.duration;
    if (
      typeof d === 'number' &&
      isFinite(d) &&
      d > 0 &&
      d - snapshot.currentTime <= cfg.endThresholdSec
    ) {
      return { advance: true, reason: 'near-end' };
    }
    if (snapshot.elapsedMs >= cfg.maxVideoMs) {
      return { advance: true, reason: 'timeout' };
    }
    return { advance: false, reason: null };
  }

  /*
   * Siguiente candidato reproducible. candidates = [{id, hasVideo, isAd}] en
   * orden de documento; currentId puede no estar ya en la lista (nodo
   * desmontado por la virtualización): en ese caso se toma el primer
   * candidato válido de la lista.
   */
  function pickNext(candidates, currentId) {
    var startAfter = -1;
    for (var i = 0; i < candidates.length; i++) {
      if (candidates[i].id === currentId) {
        startAfter = i;
        break;
      }
    }
    for (var j = startAfter + 1; j < candidates.length; j++) {
      var c = candidates[j];
      if (c.hasVideo && !c.isAd && c.id && c.id !== currentId) {
        return c;
      }
    }
    return null;
  }

  function jitter(cfg, rand) {
    cfg = cfg || DEFAULTS;
    rand = rand || Math.random;
    var span = cfg.jitterMaxMs - cfg.jitterMinMs;
    return Math.floor(cfg.jitterMinMs + rand() * span);
  }

  return {
    DEFAULTS: DEFAULTS,
    shouldAdvance: shouldAdvance,
    pickNext: pickNext,
    jitter: jitter,
  };
});

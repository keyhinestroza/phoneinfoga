/*
 * autoplay.js — cableado DOM del auto-avance. Requiere que selectors.js y
 * core.js estén ya inyectados (globales XTVSelectors / XTVCore).
 *
 * Principios (de la investigación):
 *  - video.loop = false SIEMPRE: los videos de X loopean por defecto y con
 *    loop activo 'ended' no dispara jamás. El player puede re-forzarlo, así
 *    que se re-desactiva en cada timeupdate.
 *  - Jamás guardar nodos como fuente de verdad: el feed es virtualizado
 *    (React desmonta articles fuera de viewport). La identidad es el
 *    status-id; los nodos se re-buscan al momento de usarlos.
 *  - Avance: scrollIntoView suave al siguiente article con video; si en
 *    confirmMs no se confirma el cambio, fallback con la tecla 'j' (atajo
 *    nativo de x.com para "siguiente post").
 */
(function () {
  'use strict';
  if (window.__xtv) {
    return; // idempotente: la re-inyección tras navegación SPA no duplica
  }

  var S = window.XTVSelectors;
  var C = window.XTVCore;
  var cfg = {};
  var k;
  for (k in C.DEFAULTS) {
    cfg[k] = C.DEFAULTS[k];
  }
  var override = window.__XTV_CONFIG || {};
  for (k in override) {
    cfg[k] = override[k];
  }

  var state = {
    paused: false,
    currentId: null,
    startedAt: 0,
    advancing: false,
  };

  /* ---- inventario ---- */

  function articles() {
    return S.queryAll(document, 'tweet');
  }

  function candidates() {
    return articles()
      .map(function (el) {
        return {
          id: S.statusIdOf(el),
          hasVideo: S.queryIn(el, 'video') !== null,
          isAd: S.isAd(el),
        };
      })
      .filter(function (c) {
        return c.id !== null;
      });
  }

  function articleById(id) {
    var list = articles();
    for (var i = 0; i < list.length; i++) {
      if (S.statusIdOf(list[i]) === id) {
        return list[i];
      }
    }
    return null;
  }

  function articleOf(video) {
    var el = video;
    while (el && el !== document.body) {
      if (el.tagName === 'ARTICLE') {
        return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  /* ---- adopción de videos ---- */

  var adopted = new WeakSet();

  function adopt(video) {
    if (adopted.has(video)) {
      return;
    }
    adopted.add(video);
    video.loop = false;
    video.addEventListener('ended', function () {
      onProgress(video, true);
    });
    video.addEventListener('timeupdate', function () {
      if (video.loop) {
        video.loop = false; // el player de X lo re-fuerza; nosotros también
      }
      onProgress(video, false);
    });
  }

  function sweep() {
    S.queryAll(document, 'video').forEach(adopt);
  }

  /* ---- video activo (por geometría, robusto ante desmontajes) ---- */

  function visibleRatio(el) {
    var r = el.getBoundingClientRect();
    var vh = window.innerHeight || document.documentElement.clientHeight;
    if (r.height === 0) {
      return 0;
    }
    var visible = Math.min(r.bottom, vh) - Math.max(r.top, 0);
    return Math.max(0, visible) / r.height;
  }

  function activeVideo() {
    var vids = S.queryAll(document, 'video');
    var best = null;
    var bestRatio = 0.4; // umbral: menos de 40% visible no cuenta como activo
    for (var i = 0; i < vids.length; i++) {
      var ratio = visibleRatio(vids[i]);
      if (ratio > bestRatio) {
        best = vids[i];
        bestRatio = ratio;
      }
    }
    return best;
  }

  function evaluate() {
    if (state.paused) {
      return;
    }
    sweep();
    var video = activeVideo();
    if (!video) {
      return;
    }
    var article = articleOf(video);
    if (!article) {
      return;
    }
    if (S.isAd(article)) {
      advance('ad'); // promocionado: no se reproduce, se salta
      return;
    }
    var id = S.statusIdOf(article);
    if (id && id !== state.currentId) {
      state.currentId = id;
      state.startedAt = Date.now();
      state.advancing = false;
    }
    // reproducir el activo, pausar el resto
    var vids = S.queryAll(document, 'video');
    for (var i = 0; i < vids.length; i++) {
      if (vids[i] === video) {
        if (vids[i].paused) {
          vids[i].play().catch(function () {});
        }
      } else if (!vids[i].paused) {
        vids[i].pause();
      }
    }
  }

  /* ---- decisión y avance ---- */

  function onProgress(video, endedFired) {
    if (state.paused || state.advancing) {
      return;
    }
    var article = articleOf(video);
    if (!article || S.statusIdOf(article) !== state.currentId) {
      return; // evento de un video que ya no es el activo
    }
    var decision = C.shouldAdvance(
      {
        endedFired: endedFired,
        currentTime: video.currentTime,
        duration: video.duration,
        elapsedMs: Date.now() - state.startedAt,
      },
      cfg
    );
    if (decision.advance) {
      advance(decision.reason);
    }
  }

  function advance(reason) {
    if (state.advancing) {
      return;
    }
    state.advancing = true;
    var delay = reason === 'ad' ? 0 : C.jitter(cfg);
    setTimeout(function () {
      var target = C.pickNext(candidates(), state.currentId);
      if (!target) {
        // no hay siguiente cargado: delegar en x.com (j = siguiente post),
        // que además fuerza la carga de más timeline
        pressJ();
        state.advancing = false;
        return;
      }
      var el = articleById(target.id);
      if (!el) {
        pressJ();
        state.advancing = false;
        return;
      }
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // confirmar que el objetivo quedó activo; si no, fallback 'j'
      setTimeout(function () {
        state.advancing = false;
        evaluate();
        if (state.currentId !== target.id) {
          pressJ();
        }
      }, cfg.confirmMs);
    }, delay);
  }

  function pressJ() {
    var ev = new KeyboardEvent('keydown', {
      key: 'j',
      code: 'KeyJ',
      keyCode: 74,
      which: 74,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(ev);
    if (document.body) {
      document.body.dispatchEvent(ev);
    }
  }

  /* ---- observers ---- */

  var pending = null;
  function scheduleEvaluate() {
    if (pending) {
      return;
    }
    pending = setTimeout(function () {
      pending = null;
      evaluate();
    }, 120);
  }

  var mo = new MutationObserver(scheduleEvaluate);
  function observe() {
    var timeline = S.queryIn(document, 'timeline') || document.body;
    mo.observe(timeline, { childList: true, subtree: true });
  }

  window.addEventListener('scroll', scheduleEvaluate, { passive: true });

  /* ---- API pública (preload / tests) ---- */

  window.__xtv = {
    state: state,
    config: cfg,
    pause: function () {
      state.paused = true;
      var v = activeVideo();
      if (v) {
        v.pause();
      }
    },
    resume: function () {
      state.paused = false;
      evaluate();
    },
    status: function () {
      return {
        paused: state.paused,
        currentId: state.currentId,
        advancing: state.advancing,
      };
    },
    _internals: {
      evaluate: evaluate,
      candidates: candidates,
      advance: advance,
      pressJ: pressJ,
    },
  };

  observe();
  evaluate();
})();

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
    // idempotente: la re-inyección tras navegación SPA no duplica, pero sí
    // re-ata el MutationObserver (React puede haber remontado el timeline y
    // el nodo observado quedar desconectado)
    if (window.__xtv._internals && window.__xtv._internals.reobserve) {
      window.__xtv._internals.reobserve();
    }
    return;
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
    hunting: false,
    huntCount: 0,
    lastAction: 'init',
  };

  // Tope de bajadas consecutivas sin encontrar video, para no scrollear al
  // infinito si la sección no tiene videos.
  var MAX_HUNT = 40;

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
    // normalizar contra el menor de (alto del elemento, viewport): un video
    // más alto que el viewport también debe poder ser "activo"
    return Math.max(0, visible) / Math.min(r.height, vh);
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
    if (state.paused || state.advancing) {
      return;
    }
    sweep();
    var video = activeVideo();
    if (!video) {
      // El feed "Para ti" es mayormente texto/fotos: si no hay video visible,
      // bajar hasta encontrar uno (convierte el timeline mixto en un feed de
      // video). Con tope para no scrollear al infinito.
      huntForVideo();
      return;
    }
    // encontrado: fin del modo caza
    state.hunting = false;
    state.huntCount = 0;
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
      state.lastAction = 'play ' + id;
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

  // Baja ~85% del viewport buscando el siguiente video; reprograma evaluate.
  function huntForVideo() {
    if (state.paused || state.advancing) {
      return;
    }
    if (state.huntCount >= MAX_HUNT) {
      state.lastAction = 'sin videos tras ' + MAX_HUNT + ' bajadas';
      return; // agotado: probablemente no hay más videos por ahora
    }
    state.hunting = true;
    state.huntCount++;
    state.lastAction = 'buscando video (' + state.huntCount + ')';
    var vh = window.innerHeight || document.documentElement.clientHeight;
    window.scrollBy({ top: Math.round(vh * 0.85), left: 0, behavior: 'smooth' });
    // tras el scroll, el MutationObserver/scroll disparan evaluate; añadimos un
    // reintento explícito por si no llega contenido nuevo
    setTimeout(scheduleEvaluate, 700);
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
    var fromId = state.currentId;
    var delay = reason === 'ad' ? 0 : C.jitter(cfg);
    setTimeout(function () {
      if (state.paused) {
        state.advancing = false;
        return;
      }
      if (state.currentId !== fromId) {
        // obsoleto: otro flujo ya cambió el video activo (y evaluate re-armó
        // advancing); este timeout ya no representa nada
        return;
      }
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
        if (state.paused) {
          return;
        }
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
    // re-atable: tras una navegación SPA el nodo observado puede haber sido
    // desmontado por React; disconnect + re-attach al timeline actual
    mo.disconnect();
    var timeline = S.queryIn(document, 'timeline') || document.body;
    mo.observe(timeline, { childList: true, subtree: true });
    scheduleEvaluate();
  }

  window.addEventListener('scroll', scheduleEvaluate, { passive: true });

  // Watchdog: onProgress solo corre con eventos del video; un video estancado
  // (sin timeupdate) jamás alcanzaría el escape maxVideoMs sin este tick.
  setInterval(function () {
    if (state.paused) {
      return;
    }
    var v = activeVideo();
    if (v) {
      onProgress(v, false);
    }
  }, 10000);

  // Tick de "asegurar reproducción": si no hay video activo, seguir cazando
  // (re-arma el tope para reintentar cuando el feed haya cargado más).
  setInterval(function () {
    if (state.paused || state.advancing) {
      return;
    }
    if (!activeVideo()) {
      if (state.huntCount >= MAX_HUNT) {
        state.huntCount = 0; // reintentar: pudo cargar más contenido
      }
      huntForVideo();
    }
  }, 3000);

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
      var arts = articles();
      var vids = S.queryAll(document, 'video');
      var active = activeVideo();
      return {
        paused: state.paused,
        currentId: state.currentId,
        advancing: state.advancing,
        hunting: state.hunting,
        huntCount: state.huntCount,
        lastAction: state.lastAction,
        articles: arts.length,
        videos: vids.length,
        activeVideo: !!active,
        activePlaying: active ? !active.paused : false,
      };
    },
    _internals: {
      evaluate: evaluate,
      candidates: candidates,
      advance: advance,
      pressJ: pressJ,
      reobserve: observe,
    },
  };

  observe();
  evaluate();
})();

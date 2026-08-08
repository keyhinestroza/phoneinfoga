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
    centeredId: null,
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

  /* ---- video activo (por el POST centrado, no por el tamaño del <video>) ----
   * En el feed de x.com el elemento <video> suele tener altura casi nula
   * hasta que se reproduce, así que medir su visibilidad no sirve. En su
   * lugar elegimos el ARTICLE (post) con video más centrado en el viewport. */

  // El "post" contenedor de un <video>: el article si existe, o el mejor
  // contenedor disponible.
  function videoOf(el) {
    return el.tagName === 'VIDEO' ? el : el.querySelector('video');
  }

  function postOf(el) {
    return (
      (el.closest &&
        (el.closest('article') || el.closest('[data-testid="cellInnerDiv"]'))) ||
      el
    );
  }

  // Unidades reproducibles: preferimos los CONTENEDORES del reproductor
  // (data-testid="videoPlayer"/videoComponent), que existen con póster y tienen
  // altura real antes de que haya un <video>. Fallback a <video> si no hay
  // contenedores.
  function videoUnits() {
    var players = S.queryAll(document, 'player');
    var els = players.length ? players : S.queryAll(document, 'video');
    return els.map(function (el) {
      return { container: el, post: postOf(el) };
    });
  }

  // Escanea las unidades y devuelve la más centrada. Con requireInView=true
  // solo considera las que intersecan el viewport.
  function scan(requireInView) {
    var vh = window.innerHeight || document.documentElement.clientHeight;
    var best = null;
    var bestDist = Infinity;
    videoUnits().forEach(function (u) {
      var r = u.container.getBoundingClientRect();
      if (r.height === 0) {
        return;
      }
      if (requireInView && (r.bottom <= 0 || r.top >= vh)) {
        return;
      }
      var center = (r.top + r.bottom) / 2;
      var dist = Math.abs(center - vh / 2);
      if (dist < bestDist) {
        bestDist = dist;
        best = {
          article: u.post,
          container: u.container,
          video: videoOf(u.container),
          dist: dist,
          vh: vh,
        };
      }
    });
    return best;
  }

  function centeredArticle() {
    return scan(true);
  }
  function nearestUnit() {
    return scan(false);
  }

  // Compatibilidad con onProgress/watchdog: el <video> del post centrado.
  function activeVideo() {
    var c = centeredArticle();
    return c ? c.video : null;
  }

  // Arranca la reproducción de un contenedor que aún no tiene <video> activo:
  // primero un botón de play si existe, si no un clic en el propio contenedor.
  function clickToPlay(container) {
    try {
      var btn = container.querySelector(
        '[data-testid="playButton"], [aria-label*="Play"], [aria-label*="Reproducir"]'
      );
      (btn || container).click();
    } catch (e) {
      void e;
    }
  }

  // Reproduce el <video> dado y pausa el resto.
  function playOnly(video) {
    var vids = S.queryAll(document, 'video');
    for (var i = 0; i < vids.length; i++) {
      if (vids[i] === video) {
        video.loop = false;
        if (video.paused) {
          video.play().catch(function () {});
        }
      } else if (!vids[i].paused) {
        vids[i].pause();
      }
    }
  }

  function evaluate() {
    if (state.paused || state.advancing) {
      return;
    }
    sweep();
    var c = centeredArticle();
    if (!c) {
      // Ningún reproductor DENTRO del viewport. Si hay alguno fuera de vista
      // (x.com scrollea en un contenedor interno, no la ventana), acercarlo con
      // scrollIntoView, que scrollea el contenedor correcto. Solo si no hay
      // ninguno, bajar a ciegas para cargar más contenido.
      var near = nearestUnit();
      if (near && near.container.scrollIntoView) {
        if (state.huntCount >= MAX_HUNT) {
          state.lastAction = 'no pude centrar tras ' + MAX_HUNT;
          return; // el tick de 3s re-arma y reintenta
        }
        state.hunting = true;
        state.huntCount++;
        state.lastAction = 'acercando video (' + state.huntCount + ')';
        near.container.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(scheduleEvaluate, 500);
      } else {
        huntForVideo();
      }
      return;
    }
    // encontrado: fin del modo caza
    state.hunting = false;
    state.huntCount = 0;
    var article = c.article;
    if (S.isAd(article)) {
      advance('ad'); // promocionado: no se reproduce, se salta
      return;
    }
    // si el reproductor no está bien centrado, centrarlo UNA vez y dejar asentar
    if (c.dist > c.vh * 0.3 && !c.container.getAttribute('data-xtv-centered')) {
      try {
        c.container.setAttribute('data-xtv-centered', '1');
      } catch (e) {
        void e;
      }
      c.container.scrollIntoView({ behavior: 'smooth', block: 'center' });
      state.lastAction = 'centrando post';
      setTimeout(scheduleEvaluate, 500);
      return;
    }
    var video = c.video;
    if (!video) {
      // aún no hay <video> (póster + botón de play): arrancar la reproducción.
      // x.com puede autoreproducir al centrar; si no, el clic lo dispara.
      clickToPlay(c.container);
      state.lastAction = 'iniciando reproducción';
      setTimeout(scheduleEvaluate, 700);
      return;
    }
    adopt(video);
    var id = idOfVideo(video);
    if (id && id !== state.currentId) {
      state.currentId = id;
      state.startedAt = Date.now();
      state.advancing = false;
      state.lastAction = 'play ' + (id.length > 16 ? id.slice(-12) : id);
    }
    playOnly(video);
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

  // Identidad unificada de un video (status-id del post o su src).
  function idOfVideo(video) {
    var a = video.closest ? video.closest('article') : null;
    return (a && S.statusIdOf(a)) || video.currentSrc || video.src || null;
  }

  function onProgress(video, endedFired) {
    if (state.paused || state.advancing) {
      return;
    }
    if (idOfVideo(video) !== state.currentId) {
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
      scheduleEvaluate(); // evaluate acerca/centra/arranca el próximo video
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
      var units = videoUnits();
      var vh = window.innerHeight || document.documentElement.clientHeight;
      var inView = 0;
      units.forEach(function (u) {
        var r = u.container.getBoundingClientRect();
        if (r.bottom > 0 && r.top < vh && r.height !== 0) {
          inView++;
        }
      });
      var active = activeVideo();
      var geo = '';
      if (units.length) {
        var r0 = units[0].container.getBoundingClientRect();
        geo = 'top' + Math.round(r0.top) + ' h' + Math.round(r0.height) + ' vh' + vh;
      }
      return {
        paused: state.paused,
        currentId: state.currentId,
        advancing: state.advancing,
        hunting: state.hunting,
        huntCount: state.huntCount,
        lastAction: state.lastAction,
        articles: arts.length,
        videos: vids.length,
        videoPosts: units.length,
        postsEnPantalla: inView,
        geo: geo,
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

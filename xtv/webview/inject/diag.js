/*
 * diag.js — panel de diagnóstico en pantalla. Muestra en vivo qué detecta el
 * motor de autoplay (nº de posts, nº de videos, video activo, estado de la
 * caza) para depurar por qué no se reproduce nada. Se inyecta solo cuando
 * main.js pasa XTV_DIAG. Todo el estilo se aplica por API DOM (el.style.*),
 * no por atributos inline en HTML, para no chocar con la CSP de x.com.
 *
 * Alternar con la tecla d (o Cmd/Ctrl+Shift+D).
 */
(function () {
  'use strict';
  if (window.__xtvDiag) {
    return;
  }
  window.__xtvDiag = true;

  var box = document.createElement('div');
  var s = box.style;
  s.position = 'fixed';
  s.top = '8px';
  s.left = '8px';
  s.zIndex = '2147483647';
  s.background = 'rgba(0,0,0,0.82)';
  s.color = '#0f0';
  s.font = '12px/1.5 ui-monospace, Menlo, monospace';
  s.padding = '8px 10px';
  s.borderRadius = '8px';
  s.border = '1px solid #0a0';
  s.maxWidth = '320px';
  s.whiteSpace = 'pre';
  s.pointerEvents = 'none';
  box.textContent = 'xtv diag…';

  function mount() {
    if (document.body && !box.parentNode) {
      document.body.appendChild(box);
    }
  }

  function tick() {
    mount();
    var st = window.__xtv && window.__xtv.status ? window.__xtv.status() : null;
    if (!st) {
      box.textContent = 'xtv: motor de autoplay no cargado';
      return;
    }
    var cid = st.currentId || '—';
    if (cid.length > 18) {
      cid = '…' + cid.slice(-16);
    }
    box.textContent =
      'XTV diag  (tecla d oculta)\n' +
      'posts en DOM : ' + st.articles + '\n' +
      'videos en DOM: ' + st.videos + '\n' +
      'posts c/video: ' + (st.videoPosts != null ? st.videoPosts : '?') + '\n' +
      'en pantalla  : ' + (st.postsEnPantalla != null ? st.postsEnPantalla : '?') + '\n' +
      'geo 1er post : ' + (st.geo || '—') + '\n' +
      'video activo : ' + (st.activeVideo ? 'sí' : 'no') +
      (st.activeVideo ? (st.activePlaying ? ' (reprod.)' : ' (pausado)') : '') + '\n' +
      'currentId    : ' + cid + '\n' +
      'cazando      : ' + (st.hunting ? 'sí #' + st.huntCount : 'no') + '\n' +
      'pausado      : ' + (st.paused ? 'sí' : 'no') + '\n' +
      'última acción: ' + st.lastAction;
  }

  setInterval(tick, 500);
  tick();

  document.addEventListener('keydown', function (e) {
    var toggle =
      (e.key === 'd' && !e.metaKey && !e.ctrlKey && !e.altKey &&
        !/^(input|textarea)$/i.test((e.target && e.target.tagName) || '')) ||
      ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'D' || e.key === 'd'));
    if (toggle) {
      s.display = s.display === 'none' ? 'block' : 'none';
    }
  });
})();

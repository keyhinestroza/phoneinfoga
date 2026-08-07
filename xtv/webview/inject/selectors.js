/*
 * selectors.js — ÚNICO módulo con conocimiento del DOM de x.com.
 *
 * Cada entrada es una cascada: se intenta cada selector en orden y gana el
 * primero que devuelva resultados. Si X cambia su DOM, este es el único
 * archivo que hay que tocar. Los data-testid llevan años estables
 * (videoPlayer/tweet); los fallbacks genéricos degradan en vez de romper.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.XTVSelectors = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var CASCADES = {
    tweet: ['article[data-testid="tweet"]', 'article'],
    video: [
      'div[data-testid="videoPlayer"] video',
      '[data-testid="videoComponent"] video',
      'video',
    ],
    ad: ['[data-testid="placementTracking"]'],
    statusLink: ['a[href*="/status/"]'],
    timeline: ['[data-testid="primaryColumn"]', 'main', 'body'],
  };

  function queryAll(rootEl, name) {
    var cascade = CASCADES[name];
    for (var i = 0; i < cascade.length; i++) {
      var found = rootEl.querySelectorAll(cascade[i]);
      if (found.length > 0) {
        return Array.prototype.slice.call(found);
      }
    }
    return [];
  }

  function queryIn(el, name) {
    var cascade = CASCADES[name];
    for (var i = 0; i < cascade.length; i++) {
      var found = el.querySelector(cascade[i]);
      if (found) {
        return found;
      }
    }
    return null;
  }

  function isAd(articleEl) {
    for (var i = 0; i < CASCADES.ad.length; i++) {
      if (articleEl.querySelector(CASCADES.ad[i])) {
        return true;
      }
    }
    return false;
  }

  /* Identidad estable de un tweet: el status-id de su URL. Jamás se usan
   * referencias a nodos como identidad — React virtualiza el timeline y
   * desmonta los articles fuera de viewport. */
  function statusIdOf(articleEl) {
    for (var i = 0; i < CASCADES.statusLink.length; i++) {
      var links = articleEl.querySelectorAll(CASCADES.statusLink[i]);
      for (var j = 0; j < links.length; j++) {
        var href = links[j].getAttribute('href') || '';
        var m = href.match(/\/status\/(\d+)/);
        if (m) {
          return m[1];
        }
      }
    }
    return null;
  }

  return {
    CASCADES: CASCADES,
    queryAll: queryAll,
    queryIn: queryIn,
    isAd: isAd,
    statusIdOf: statusIdOf,
  };
});

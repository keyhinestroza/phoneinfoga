/*
 * preload.js — se ejecuta antes que el JS de la página. Su único trabajo es
 * neutralizar WebAuthn/passkey ANTES de que x.com decida qué flujo de login
 * mostrar.
 *
 * Por qué: X consulta isUserVerifyingPlatformAuthenticatorAvailable() y, si
 * cree que hay un autenticador de plataforma (Touch ID / llavero), fuerza la
 * pantalla "Clave de paso" que llama a navigator.credentials.get(). Dentro de
 * Electron ese autenticador no existe y la llamada nunca resuelve: el spinner
 * se queda colgado para siempre, incluso tras login por contraseña o código.
 *
 * Al declarar que NO hay passkey (isUVPAA → false) y hacer que get()/create()
 * rechacen de inmediato con NotAllowedError (lo mismo que "el usuario canceló"),
 * X ofrece contraseña, código por email/SMS o app de autenticación, que sí
 * funcionan en el webview.
 *
 * Se inyecta en el mundo principal vía un <script>, porque el preload corre en
 * un mundo aislado (contextIsolation) y no puede tocar el navigator de la
 * página directamente.
 */
(function () {
  'use strict';
  var code =
    '(' +
    function () {
      try {
        if (navigator.credentials) {
          var reject = function () {
            return Promise.reject(
              new DOMException('WebAuthn deshabilitado en xtv', 'NotAllowedError')
            );
          };
          navigator.credentials.get = reject;
          navigator.credentials.create = reject;
        }
        if (window.PublicKeyCredential) {
          window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable =
            function () {
              return Promise.resolve(false);
            };
          window.PublicKeyCredential.isConditionalMediationAvailable = function () {
            return Promise.resolve(false);
          };
        }
      } catch {
        /* si algo cambia en el runtime, no romper la página */
      }
    }.toString() +
    ')();';

  var script = document.createElement('script');
  script.textContent = code;
  (document.head || document.documentElement).appendChild(script);
  script.remove();
})();

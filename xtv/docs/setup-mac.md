# Setup completo en el Mac — paso a paso

Guía para dejar funcionando la vía emulada de punta a punta. Tiempo estimado:
30-60 min la primera vez (dominado por la descarga de ~3-5 GB).

## 0. Prerrequisitos

```bash
# Homebrew (si no lo tienes): https://brew.sh
brew install temurin scrcpy
```

- Mac Apple Silicon (M1+). En Intel no funciona (imágenes arm64).
- ~12 GB libres en disco.
- Cuenta de X. **Recomendación**: haz la primera prueba con una cuenta
  secundaria hasta confirmar que el login no da problemas.

## 1. Bootstrap (una vez)

```bash
cd xtv
emu/bootstrap.sh
```

Qué hace: descarga las cmdline-tools de Google, te pide aceptar las
licencias (requisito legal: las imágenes no se pueden redistribuir, por eso
las descargas tú), instala `platform-tools` + `emulator` + la imagen
`android-35 google_apis_playstore arm64`, crea el AVD `xtv` y aplica la
configuración óptima (2 GB RAM, 720x1600, quick boot).

Si ya tienes Android Studio, reutiliza tu SDK automáticamente
(`ANDROID_SDK_ROOT`); si no, todo va a `~/.xtv/sdk`.

## 2. El APK de X

1. Abre <https://www.apkmirror.com/apk/x-corp/twitter/>
2. Última versión estable → variante **BUNDLE** con `arm64-v8a` (extensión
   `.apkm`).
3. Instálala sin comprometer aún el login (eso lo valida exp1):

```bash
emu/setup.sh --install-only    # te pide la ruta del .apkm y lo instala
```

## 3. Experimento 1 — el gate del login

```bash
emu/experiments/exp1-login.sh
```

Este es el momento de la verdad: desde finales de 2025 la app de X exige
atestación **Google Play Integrity** al iniciar sesión. En emuladores es una
lotería. El protocolo del script:

1. Login directo con usuario/contraseña (nunca "Continuar con Google/Apple").
2. Si falla: workaround de **passkey** — en el navegador del Mac crea una
   passkey en x.com (Configuración → Seguridad → Passkeys) y en la app usa
   "Iniciar sesión con passkey".
3. El script vigila logcat y deja el veredicto en
   `emu/experiments/results/exp1.json`.

- **PASS** → sigue al paso 4. La sesión persiste: no volverás a loguear.
- **FAIL** → la vía emulada muere aquí. Tienes el plan B (`npm start`, vía
  webview) ya construido, o un emulador comercial con Play certificado
  ([alternatives.md](alternatives.md)).

## 4. Experimento 2 — el mecanismo de avance

```bash
emu/experiments/exp2-autoadvance.sh
```

Comprueba si tu build de X trae el **Auto-advance nativo** del reproductor
inmersivo (menú ⋮ del player). Está activado por defecto pero su rollout es
gradual por cuenta/versión.

- `autoadvance_works: true` → **Plan A**: X avanza solo. Cero código extra.
- `false` pero hay barras de progreso en el árbol de UI → **Plan B**: compila
  el companion ([companion/README.md](../companion/README.md)).
- Nada de nada → Plan C (timeout) o vía webview.

## 5. Setup y snapshot golden

```bash
emu/setup.sh
```

Te guía por: instalación del APK (si falta) → login → activar Auto-advance →
grabar las coordenadas de la pestaña de video (fallback tras cold boot) →
y el paso clave: **grabar el snapshot "golden" con la app abierta en el feed
de video**. Ese snapshot es lo que hace posible "doble clic → video en
5-12 s".

Cuando actualices la app de X o quieras cambiar el punto de arranque:

```bash
emu/setup.sh --refresh-snapshot
```

## 6. Experimento 3 — tiempos y flags

```bash
emu/experiments/exp3-timing.sh
```

Mide 3 resumes desde el snapshot y un cold boot, y te deja probar las dos
rutas de audio (`XTV_AUDIO=scrcpy` vs `XTV_AUDIO=host`). Fija tu elección
exportando `XTV_AUDIO` o editando `emu/env.sh`.

## 7. La app de doble clic

```bash
emu/make-app.sh
open ~/Applications/XTV.app
```

Genera `XTV.app` (bundle artesanal, generado localmente: sin firma, sin
Gatekeeper). Doble clic → resume del snapshot → ventana sin bordes con el
feed. Cerrar la ventana apaga el emulador.

Uso diario: doble clic en XTV.app. Eso es todo.

## 8. Plan B — la vía webview

Independiente de todo lo anterior y lista en ~1 minuto:

```bash
npm install
npm start
```

Primera vez: login manual en la ventana (usuario/contraseña o passkey; nunca
SSO de Google/Apple). La sesión persiste. Los scripts inyectados ocultan la
UI de X y avanzan al terminar cada video (`Cmd+Shift+Space` pausa/reanuda).

## Problemas

→ [troubleshooting.md](troubleshooting.md)

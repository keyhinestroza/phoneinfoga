# companion — AccessibilityService de avance (Plan B de la vía emulada)

**Solo hace falta si `exp2-autoadvance.sh` reporta `autoadvance_works: false`.**
Si el Auto-advance nativo de X funciona (Plan A), ignora este directorio por
completo: cero código es mejor que este código.

## Qué hace

Un `AccessibilityService` que corre DENTRO del emulador, junto a la app de X:

1. Se suscribe a `TYPE_WINDOW_CONTENT_CHANGED` / `TYPE_VIEW_SCROLLED`
   filtrado a los packages de X (`com.twitter.android`, `com.x.android`).
2. Recorre el árbol de accesibilidad buscando **cualquier nodo con
   `rangeInfo`** (la barra de progreso del reproductor) — sin depender de
   view IDs, que cambian con cada release (patrón del proyecto
   [perkompus/Laze](https://github.com/perkompus/Laze)).
3. Cuando `current >= 95%` del máximo → dispara un swipe vertical con
   `dispatchGesture`, con path aleatorizado (±15 %) y duración 250-450 ms,
   más cooldown de 2 s e histéresis para no doblar el gesto.

Ventaja frente a `adb input swipe`: in-process (sin ~200 ms-1 s de overhead
por invocación), timing preciso, callback de resultado y aleatorización — y
100 % event-driven (consumo casi nulo).

## Compilar e instalar (en el Mac, con el SDK del bootstrap)

```bash
cd companion
# usa el JDK de brew (temurin) y el SDK de ~/.xtv/sdk
ANDROID_HOME=~/.xtv/sdk ./gradlew assembleDebug   # requiere gradle wrapper o brew install gradle
adb -s emulator-5554 install -r app/build/outputs/apk/debug/app-debug.apk
```

Activarlo (el emulador permite otorgar el permiso por adb, sin UI):

```bash
adb -s emulator-5554 shell settings put secure enabled_accessibility_services \
  dev.xtv.companion/dev.xtv.companion.AdvanceService
adb -s emulator-5554 shell settings put secure accessibility_enabled 1
```

Tras esto, regraba el snapshot (`emu/setup.sh --refresh-snapshot`) para que
el servicio quede activo en cada arranque.

## Estado del código

Esqueleto compilable con la lógica completa escrita, sin pulir: no está en el
camino crítico del MVP. `ProgressTracker` es lógica pura (testeable con JUnit
sin emulador). Antes de usarlo en serio: verificar con los datos de
`exp2-uidump.xml` que el reproductor de X expone efectivamente el seekbar en
el árbol de accesibilidad cuando el overlay de controles se auto-oculta —
ese es el riesgo abierto que la investigación no pudo confirmar.

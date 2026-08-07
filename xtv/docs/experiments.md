# Los 3 experimentos de validación

La vía emulada tiene tres incógnitas que solo se resuelven empíricamente en
un Mac real. Cada experimento es un script interactivo que imprime
`RESULT: PASS|FAIL|INCONCLUSIVE` y guarda un JSON en
`emu/experiments/results/` (pégalo en una sesión futura de Claude para
continuar el trabajo con datos reales).

Orden: **exp1 → exp2 → setup.sh → exp3**.

## exp1-login.sh — ¿el login sobrevive Play Integrity? (GATE)

**Por qué existe**: desde fines de 2025 la app Android de X exige atestación
Google Play Integrity al iniciar sesión (`LoginError.AttestationDenied` en
entornos sin GMS; en emuladores con Play Store el veredicto de integridad
suele quedar vacío y X decide en servidor). Es un interruptor ajeno: hay que
probarlo, no suponerlo.

**Interpretación del JSON**:

| Campo | Significado |
|---|---|
| `login_ok: true` | La vía emulada vive. La sesión persiste (la atestación solo aplica al login). |
| `needed_passkey: true` | El login directo falló pero el workaround de passkey funcionó — documenta esto: si algún día la app cierra la sesión, repite el workaround. |
| `login_ok: false` | La vía emulada muere. Plan B webview (ya construido) o emulador comercial (alternatives.md). |
| `attestation_log_lines > 0` | Hubo menciones de atestación en logcat — revisa `exp1-logcat.log` incluso si el login pasó. |
| `atd_login_ok: true` | La imagen ATD (~40% más eficiente) también sirve: puedes recrear el AVD con `XTV_SYSIMG="$XTV_SYSIMG_ATD"`. |

## exp2-autoadvance.sh — ¿Plan A, B o C?

**Por qué existe**: el Auto-advance nativo de X (reproductor inmersivo,
menú ⋮) convierte el problema más difícil del proyecto en un checkbox — pero
su rollout es gradual por cuenta/versión y hay que verificarlo en el APK
exacto instalado. Si no está, el plan B necesita que el seekbar del player
exponga `RangeInfo` en el árbol de accesibilidad (no confirmado públicamente
para X: esta sonda es la primera verificación).

**Árbol de decisión**:

```
autoadvance_works=true ──────────► PLAN A: nada que construir. Fin.
   │ false
   ▼
progressbar_nodes > 0 ───────────► PLAN B: compilar companion/ (README).
   │ 0                              Verificar además que el nodo persiste
   ▼                                cuando el overlay de controles se oculta.
media_session_present=true ──────► PLAN C-1: detector por MediaSession
   │ false                          (position/duration vía dumpsys; no
   ▼                                implementado — abrir issue con el JSON).
PLAN C-2: timeout por video ─────► último recurso, o pivotar a webview/.
```

## exp3-timing.sh — ¿la cadena del doble clic cumple?

**Por qué existe**: la promesa de la arquitectura es "doble clic → video en
5-12 s" vía resume del snapshot golden. Este experimento la mide de verdad
(3 resumes + 1 cold boot) y deja elegidos el codec y la ruta de audio de
scrcpy.

**Interpretación**:

- `warm_ms_boot_fg`: pares `[ms hasta boot, ms hasta X delante]` por ciclo.
  Contra el objetivo: boot 2-6 s documentado por Google; +2-5 s hasta video.
- `cold_ms_boot_fg`: el fallback. 30-90 s es lo esperado; es el precio de un
  snapshot invalidado (p. ej. tras actualizar el emulador).
- `audio_choice`: fija `XTV_AUDIO` en `emu/env.sh`.
- Si el resume falla sistemáticamente: `emu/setup.sh --refresh-snapshot` y
  revisa [troubleshooting.md](troubleshooting.md).

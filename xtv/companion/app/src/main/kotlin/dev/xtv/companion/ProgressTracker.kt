package dev.xtv.companion

/**
 * Lógica pura de decisión de avance (sin dependencias de Android: testeable
 * con JUnit en el host). Patrón del proyecto Laze:
 *  - dispara cuando current >= [threshold] del máximo,
 *  - cooldown de [cooldownMs] contra dobles swipes,
 *  - histéresis: un mismo "episodio" de fin de video solo dispara una vez;
 *    se re-arma cuando el progreso vuelve a caer (nuevo video o seek atrás).
 */
class ProgressTracker(
    private val threshold: Double = 0.95,
    private val cooldownMs: Long = 2_000,
) {
    private var lastFiredAt: Long = 0
    private var armed: Boolean = true

    /**
     * @param current posición actual reportada por rangeInfo
     * @param max valor máximo reportado por rangeInfo
     * @param nowMs reloj inyectado (System.currentTimeMillis en producción)
     * @return true si toca disparar el swipe de avance
     */
    fun onProgress(current: Float, max: Float, nowMs: Long): Boolean {
        if (max <= 0f) return false
        val ratio = current / max

        // El progreso cayó: video nuevo (o seek atrás) → re-armar.
        if (ratio < REARM_RATIO) {
            armed = true
            return false
        }

        if (!armed) return false
        if (ratio < threshold) return false
        if (nowMs - lastFiredAt < cooldownMs) return false

        armed = false
        lastFiredAt = nowMs
        return true
    }

    companion object {
        /** Por debajo de este ratio se considera que empezó otro video. */
        const val REARM_RATIO = 0.5
    }
}

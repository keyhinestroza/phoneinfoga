package dev.xtv.companion

import android.accessibilityservice.GestureDescription
import android.graphics.Path
import kotlin.random.Random

/**
 * Swipes verticales aleatorizados (patrón Laze): path con jitter de ±15% y
 * duración 250-450 ms, para no producir un gesto idéntico y periódico
 * (señal de bot).
 */
object GestureFactory {

    fun verticalSwipe(screenWidth: Int, screenHeight: Int): GestureDescription {
        val jitterX = { base: Float -> base + base * (Random.nextFloat() * 0.3f - 0.15f) }
        val jitterY = { base: Float -> base + base * (Random.nextFloat() * 0.3f - 0.15f) }

        val startX = jitterX(screenWidth * 0.5f).coerceIn(1f, screenWidth - 1f)
        val startY = jitterY(screenHeight * 0.72f).coerceIn(1f, screenHeight - 1f)
        val endX = jitterX(screenWidth * 0.5f).coerceIn(1f, screenWidth - 1f)
        val endY = jitterY(screenHeight * 0.28f).coerceIn(1f, screenHeight - 1f)

        val path = Path().apply {
            moveTo(startX, startY)
            lineTo(endX, endY)
        }
        val durationMs = (250 + Random.nextInt(201)).toLong() // 250-450 ms

        return GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, durationMs))
            .build()
    }
}

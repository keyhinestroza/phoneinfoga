package dev.xtv.companion

import android.accessibilityservice.AccessibilityService
import android.util.DisplayMetrics
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

/**
 * AccessibilityService que detecta el fin del video en el reproductor de X y
 * dispara el swipe de avance. Patrón Laze: NO se buscan view IDs (frágiles,
 * cambian con cada release de X) sino cualquier nodo del árbol que exponga
 * rangeInfo — la barra de progreso del reproductor, sea cual sea su id.
 *
 * Los eventos y packages filtrados viven en res/xml/accessibility_config.xml.
 */
class AdvanceService : AccessibilityService() {

    private val tracker = ProgressTracker()

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        val root = rootInActiveWindow ?: return
        try {
            val range = findRangeNode(root) ?: return
            val info = range.rangeInfo ?: return
            val fire = tracker.onProgress(
                current = info.current,
                max = info.max,
                nowMs = System.currentTimeMillis(),
            )
            if (fire) {
                swipeNext()
            }
        } finally {
            @Suppress("DEPRECATION")
            root.recycle()
        }
    }

    /** DFS con tope de profundidad buscando el primer nodo con rangeInfo. */
    private fun findRangeNode(
        node: AccessibilityNodeInfo,
        depth: Int = 0,
    ): AccessibilityNodeInfo? {
        if (depth > MAX_DEPTH) return null
        if (node.rangeInfo != null) return node
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            val found = findRangeNode(child, depth + 1)
            if (found != null) return found
        }
        return null
    }

    private fun swipeNext() {
        val metrics: DisplayMetrics = resources.displayMetrics
        val gesture = GestureFactory.verticalSwipe(
            screenWidth = metrics.widthPixels,
            screenHeight = metrics.heightPixels,
        )
        val ok = dispatchGesture(gesture, null, null)
        Log.i(TAG, "swipe de avance despachado: $ok")
    }

    override fun onInterrupt() = Unit

    companion object {
        private const val TAG = "XtvAdvance"
        private const val MAX_DEPTH = 24
    }
}

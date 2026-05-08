import { useEffect } from 'react'

const HOLD_MS = 500
const MOVE_TOLERANCE_PX = 8

// Long-press tooltip handler for touch devices. The desktop pattern (hover →
// show) is gated to (hover: hover) in tooltip.css; this hook fills the gap on
// touch by toggling `data-tooltip-show` on the element after a 500ms hold.
//
// We chose long-press over plain tap because tooltips sit on action elements
// (search form, slider labels, style cards) — opening on tap would race with
// the action's own click handler and stick a hint over an element the user
// just dismissed. Long-press is the iOS/Android system pattern for "show me
// more about this," so it's a known affordance.
//
// Outside-tap (anything that isn't a `[data-tooltip]` host) clears whatever
// is open. Movement past 8px aborts the hold so a scroll gesture that starts
// on a tooltip host doesn't sprout a popup.
export default function useTapTooltip() {
  useEffect(() => {
    if (!window.matchMedia('(hover: none)').matches) return

    let openEl = null
    let holdTimer = null
    let startX = 0
    let startY = 0

    const clearHold = () => {
      if (holdTimer) {
        clearTimeout(holdTimer)
        holdTimer = null
      }
    }

    const closeOpen = () => {
      if (openEl) {
        openEl.removeAttribute('data-tooltip-show')
        openEl = null
      }
    }

    const onPointerDown = (e) => {
      const host = e.target instanceof Element ? e.target.closest('[data-tooltip]') : null
      if (!host) {
        // Tap outside any tooltip host — dismiss the open one (if any).
        closeOpen()
        return
      }
      startX = e.clientX
      startY = e.clientY
      clearHold()
      holdTimer = setTimeout(() => {
        holdTimer = null
        // Different host than what's already open — swap. Same host — no-op.
        if (openEl !== host) {
          closeOpen()
          host.setAttribute('data-tooltip-show', '')
          openEl = host
        }
      }, HOLD_MS)
    }

    const onPointerMove = (e) => {
      if (!holdTimer) return
      if (
        Math.abs(e.clientX - startX) > MOVE_TOLERANCE_PX ||
        Math.abs(e.clientY - startY) > MOVE_TOLERANCE_PX
      ) {
        clearHold()
      }
    }

    const onPointerUp = () => {
      clearHold()
    }

    document.addEventListener('pointerdown', onPointerDown, { passive: true })
    document.addEventListener('pointermove', onPointerMove, { passive: true })
    document.addEventListener('pointerup', onPointerUp, { passive: true })
    document.addEventListener('pointercancel', onPointerUp, { passive: true })

    return () => {
      clearHold()
      closeOpen()
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerup', onPointerUp)
      document.removeEventListener('pointercancel', onPointerUp)
    }
  }, [])
}

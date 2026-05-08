import { useEffect, useRef, useState } from 'react'
import Nav from './Nav'
import Compass from './Compass'
import StylePicker from './StylePicker'
import QualityPanel from './QualityPanel'
import './MobileShell.css'

const VELOCITY_CLOSE_THRESHOLD = 0.6 // px/ms — flick speed that closes regardless of distance
const DISTANCE_CLOSE_FRACTION = 0.35 // fraction of sheet height that closes on slow drag

function BottomSheet({ open, onClose, children }) {
  const sheetRef = useRef(null)
  // dragRef holds live pointer state. We avoid useState here because the
  // pointermove handler runs at input-event rate; reading the ref is cheaper
  // than re-deriving from state and the rendered translate is driven by the
  // separate `dragY` setter below.
  const dragRef = useRef(null)
  const [dragY, setDragY] = useState(0)
  const [dragging, setDragging] = useState(false)

  // Reset transient drag state when `open` flips to false from outside (e.g.
  // backdrop tap mid-drag), otherwise a partially-dragged sheet would re-open
  // mid-translate next time. Using the React "store-previous-prop" pattern so
  // the reset happens during render — putting it in an effect would trigger
  // the cascading-render lint and require an extra commit cycle.
  const [prevOpen, setPrevOpen] = useState(open)
  if (prevOpen !== open) {
    setPrevOpen(open)
    if (!open) {
      setDragY(0)
      setDragging(false)
      // dragRef intentionally left alone here — touching it during render
      // trips react-hooks/refs. If a drag is in flight when the sheet closes
      // externally, pointerup will clear dragRef as it normally does; with
      // dragY=0 already set, no stale inline transform is applied either way.
    }
  }

  // Block page scroll behind an open sheet. iOS Safari ignores
  // `overflow: hidden` on body for scroll-chain behaviour, but for the canvas
  // beneath there's no scroll to chain anyway — we just need to prevent
  // background pull-to-refresh from firing if the user starts a drag from the
  // backdrop.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  const onHandlePointerDown = (e) => {
    // setPointerCapture routes subsequent move/up events to the handle even if
    // the finger drifts off it onto the sheet content. Without this the gesture
    // would silently stall at the edge.
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = {
      pointerId: e.pointerId,
      startY: e.clientY,
      startTime: performance.now(),
    }
    setDragging(true)
  }

  const onHandlePointerMove = (e) => {
    const s = dragRef.current
    if (!s || s.pointerId !== e.pointerId) return
    // Clamp to non-negative — pulling up would lift the sheet off the bottom
    // edge with no destination to snap to.
    setDragY(Math.max(0, e.clientY - s.startY))
  }

  const onHandlePointerUp = (e) => {
    const s = dragRef.current
    if (!s || s.pointerId !== e.pointerId) return
    const delta = e.clientY - s.startY
    const dt = Math.max(performance.now() - s.startTime, 1)
    const velocity = delta / dt
    dragRef.current = null

    const sheetH = sheetRef.current?.offsetHeight ?? 400
    const shouldClose = delta > sheetH * DISTANCE_CLOSE_FRACTION || velocity > VELOCITY_CLOSE_THRESHOLD

    // Order matters: clear `dragging` before `dragY` so the next render
    // restores the CSS transition before the transform value changes,
    // letting the snap-back actually animate instead of jumping.
    setDragging(false)
    setDragY(0)
    if (shouldClose) onClose()
  }

  return (
    <>
      <div
        className={`ms-backdrop${open ? ' ms-backdrop-open' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={sheetRef}
        className={`ms-sheet${open ? ' ms-sheet-open' : ''}`}
        style={{
          transform: open && dragY > 0 ? `translateY(${dragY}px)` : undefined,
          transition: dragging ? 'none' : undefined,
        }}
        role="dialog"
        aria-modal={open}
        aria-hidden={!open}
      >
        <div
          className="ms-handle"
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
          onPointerCancel={onHandlePointerUp}
        >
          <div className="ms-handle-bar" />
        </div>
        <div className="ms-sheet-content">{children}</div>
      </div>
    </>
  )
}

export default function MobileShell() {
  const [sheetOpen, setSheetOpen] = useState(false)

  return (
    <>
      <div className="ms-topbar">
        <Nav />
        <Compass />
        <button
          type="button"
          className="ms-hamburger"
          onClick={() => setSheetOpen(true)}
          aria-label="Open settings"
        >
          <span />
          <span />
          <span />
        </button>
      </div>

      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)}>
        <StylePicker />
        <QualityPanel />
      </BottomSheet>
    </>
  )
}

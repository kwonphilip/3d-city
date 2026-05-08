import { useSyncExternalStore } from 'react'

const mq = {
  coarse: window.matchMedia('(pointer: coarse)'),
  noHover: window.matchMedia('(hover: none)'),
  narrow: window.matchMedia('(max-width: 768px)'),
}

function snapshot() {
  return mq.coarse.matches || mq.noHover.matches || mq.narrow.matches
}

function subscribe(cb) {
  mq.coarse.addEventListener('change', cb)
  mq.noHover.addEventListener('change', cb)
  mq.narrow.addEventListener('change', cb)
  return () => {
    mq.coarse.removeEventListener('change', cb)
    mq.noHover.removeEventListener('change', cb)
    mq.narrow.removeEventListener('change', cb)
  }
}

export default function useIsMobile() {
  return useSyncExternalStore(subscribe, snapshot, () => false)
}

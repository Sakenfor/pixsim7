import { useEffect, useRef } from 'react'

/**
 * setInterval that pauses while the tab/window is hidden.
 * Fires `fn` immediately on resume so UI isn't stale.
 */
export function usePollWhenVisible(fn: () => void, intervalMs: number, enabled = true) {
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    if (!enabled) return
    let timer: ReturnType<typeof setInterval> | null = null

    const start = () => {
      if (timer != null) return
      timer = setInterval(() => fnRef.current(), intervalMs)
    }
    const stop = () => {
      if (timer != null) {
        clearInterval(timer)
        timer = null
      }
    }
    const onVisibility = () => {
      if (document.hidden) {
        stop()
      } else {
        fnRef.current()
        start()
      }
    }

    if (!document.hidden) start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      stop()
    }
  }, [intervalMs, enabled])
}

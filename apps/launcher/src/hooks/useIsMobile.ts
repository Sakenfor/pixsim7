import { useEffect, useState } from 'react'

/**
 * True when the viewport is narrow enough that the desktop dock layout
 * (three side-by-side flexlayout columns) becomes unusable — phones and
 * small tablets. Used to swap in the single-column MobileLayout.
 */
export function useIsMobile(maxWidth = 768): boolean {
  const query = `(max-width: ${maxWidth}px)`
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  )

  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = () => setIsMobile(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return isMobile
}

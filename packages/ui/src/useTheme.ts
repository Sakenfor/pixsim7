import { useEffect, useState } from 'react'

const storageKey = 'pixsim7:theme'

export type Theme = 'light' | 'dark'

// Get initial theme synchronously to avoid flash
function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light'

  const saved = localStorage.getItem(storageKey) as Theme | null
  if (saved === 'dark' || saved === 'light') return saved

  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
  return prefersDark ? 'dark' : 'light'
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    const initial = getInitialTheme()
    // Apply immediately on first render
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', initial === 'dark')
    }
    return initial
  })

  useEffect(() => {
    // Ensure theme is applied (in case of SSR or hydration mismatch)
    const saved = (localStorage.getItem(storageKey) as Theme | null) || undefined
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    const next: Theme = saved ?? (prefersDark ? 'dark' : 'light')
    if (next !== theme) {
      apply(next)
    }
  }, [])

  function apply(next: Theme) {
    setTheme(next)
    const root = document.documentElement
    root.classList.toggle('dark', next === 'dark')
    localStorage.setItem(storageKey, next)
  }

  function toggle() {
    apply(theme === 'dark' ? 'light' : 'dark')
  }

  return { theme, setTheme: apply, toggle }
}

import { useEffect, useState } from 'react'

const storageKey = 'pixsim7:theme'

export type Theme = 'light' | 'dark'

export function useTheme() {
  const [theme, setTheme] = useState<Theme>('light')

  useEffect(() => {
    const saved = (localStorage.getItem(storageKey) as Theme | null) || undefined
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    const next: Theme = saved ?? (prefersDark ? 'dark' : 'light')
    apply(next)
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

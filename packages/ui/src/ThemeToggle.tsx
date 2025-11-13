import * as React from 'react'
import { Button } from './Button'
import { useTheme } from './useTheme'

export function ThemeToggle() {
  const { theme, toggle } = useTheme()
  return (
    <Button variant="secondary" size="sm" onClick={toggle} title="Toggle theme">
      {theme === 'dark' ? '🌙 Dark' : '☀️ Light'}
    </Button>
  )
}

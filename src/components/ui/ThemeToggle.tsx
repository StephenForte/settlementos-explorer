import { useState } from 'react'
import { applyThemeChoice, readThemeChoice, type ThemeChoice } from './theme'

const CHOICES: { id: ThemeChoice; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
]

export function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>(() => readThemeChoice())

  function select(next: ThemeChoice) {
    applyThemeChoice(next)
    setChoice(next)
  }

  return (
    <div className="theme-toggle" role="group" aria-label="Theme">
      {CHOICES.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={choice === option.id}
          onClick={() => select(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export const THEME_STORAGE_KEY = 'sos-explorer-theme'

export type ThemeChoice = 'system' | 'light' | 'dark'

export function readThemeChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // Storage can throw in private mode. System theme still works.
  }
  return 'system'
}

/** Apply a choice immediately. Storage failure must not revert the paint. */
export function applyThemeChoice(choice: ThemeChoice): void {
  const root = document.documentElement
  if (choice === 'light' || choice === 'dark') {
    root.setAttribute('data-theme', choice)
  } else {
    root.removeAttribute('data-theme')
  }
  try {
    if (choice === 'light' || choice === 'dark') {
      localStorage.setItem(THEME_STORAGE_KEY, choice)
    } else {
      localStorage.removeItem(THEME_STORAGE_KEY)
    }
  } catch {
    // The attribute is already set for this view.
  }
}

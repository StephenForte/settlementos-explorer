import { describe, expect, it } from 'vitest'
import { corsOriginDelegate, isAllowedCorsOrigin } from './cors.ts'

describe('CORS allowlist', () => {
  it('allows Claude, ChatGPT, Cursor, and localhost origins', () => {
    expect(isAllowedCorsOrigin('https://claude.ai')).toBe(true)
    expect(isAllowedCorsOrigin('https://chatgpt.com')).toBe(true)
    expect(isAllowedCorsOrigin('https://chat.openai.com')).toBe(true)
    expect(isAllowedCorsOrigin('https://www.cursor.com')).toBe(true)
    expect(isAllowedCorsOrigin('http://localhost:5173')).toBe(true)
    expect(isAllowedCorsOrigin('https://evil.example')).toBe(false)
  })

  it('allows requests without Origin (non-browser)', () => {
    let allowed: boolean | undefined
    corsOriginDelegate(undefined, (_err, value) => {
      allowed = value
    })
    expect(allowed).toBe(true)
  })
})

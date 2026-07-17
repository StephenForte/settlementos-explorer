import { describe, expect, it } from 'vitest'
import {
  bearerMatches,
  MCP_API_KEY_MIN_LENGTH,
  resolveMcpAuth,
  resolveMcpPublicUrl,
} from './auth.ts'

describe('resolveMcpAuth', () => {
  it('disables MCP when API key is missing or too short', () => {
    expect(resolveMcpAuth({ apiKey: '' }).configured).toBe(false)
    expect(
      resolveMcpAuth({
        apiKey: 'short',
        warn: () => {},
      }).configured,
    ).toBe(false)
  })

  it('enables bearer when key is long enough', () => {
    const key = 'a'.repeat(MCP_API_KEY_MIN_LENGTH)
    const auth = resolveMcpAuth({ apiKey: key, warn: () => {} })
    expect(auth.configured).toBe(true)
    expect(auth.oauthConfigured).toBe(false)
  })

  it('enables OAuth only with client credentials + https/localhost public URL', () => {
    const key = 'a'.repeat(MCP_API_KEY_MIN_LENGTH)
    const oauth = {
      apiKey: key,
      oauthClientId: '11111111-1111-4111-8111-111111111111',
      oauthClientSecret: 'oauth-client-secret-16+',
      warn: () => {},
    }
    expect(
      resolveMcpAuth({ ...oauth, publicUrl: 'http://example.com' })
        .oauthConfigured,
    ).toBe(false)
    expect(
      resolveMcpAuth({ ...oauth, publicUrl: 'https://example.com' })
        .oauthConfigured,
    ).toBe(true)
    expect(
      resolveMcpAuth({ ...oauth, publicUrl: 'http://127.0.0.1:3000' })
        .oauthConfigured,
    ).toBe(true)
  })
})

describe('bearerMatches', () => {
  const key = 'test-mcp-api-key-32chars!!'

  it('accepts matching bearer tokens case-insensitively on scheme', () => {
    expect(bearerMatches(`Bearer ${key}`, key)).toBe(true)
    expect(bearerMatches(`bearer ${key}`, key)).toBe(true)
    expect(bearerMatches(`Bearer wrong-key-value!!`, key)).toBe(false)
    expect(bearerMatches(undefined, key)).toBe(false)
  })
})

describe('resolveMcpPublicUrl', () => {
  it('prefers MCP_PUBLIC_URL over RENDER_EXTERNAL_URL', () => {
    expect(
      resolveMcpPublicUrl({
        MCP_PUBLIC_URL: 'https://a.example/',
        RENDER_EXTERNAL_URL: 'https://b.example',
      }),
    ).toBe('https://a.example')
    expect(
      resolveMcpPublicUrl({
        RENDER_EXTERNAL_URL: 'https://b.example/',
      }),
    ).toBe('https://b.example')
  })
})

import { describe, expect, it, vi } from 'vitest'
import {
  AUTH_CODE_TTL_MS,
  CLAUDE_MCP_REDIRECT_URI,
  createMcpOAuthProvider,
  createStaticClientsStore,
  isAllowedDcrRedirectUri,
} from './oauth-provider.ts'

describe('DCR redirect allowlist', () => {
  it('allows Claude / Cursor HTTPS callbacks only', () => {
    expect(isAllowedDcrRedirectUri(CLAUDE_MCP_REDIRECT_URI)).toBe(true)
    expect(isAllowedDcrRedirectUri('http://localhost/callback')).toBe(false)
    expect(isAllowedDcrRedirectUri('https://evil.example/callback')).toBe(false)
  })
})

describe('createStaticClientsStore', () => {
  it('omits registerClient when DCR is disabled', () => {
    const store = createStaticClientsStore({
      clientId: 'static-id',
      clientSecret: 'static-secret-16+',
      allowDynamicRegistration: false,
    })
    expect(store.registerClient).toBeUndefined()
  })

  it('rejects non-allowlisted redirect URIs when DCR is enabled', async () => {
    const store = createStaticClientsStore({
      clientId: 'static-id',
      clientSecret: 'static-secret-16+',
      allowDynamicRegistration: true,
    })
    await expect(
      store.registerClient!({
        redirect_uris: ['http://localhost/callback'],
        grant_types: ['authorization_code'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
      }),
    ).rejects.toThrow(/not allowed/i)
  })

  it('never overwrites the static client id during DCR', async () => {
    const store = createStaticClientsStore({
      clientId: 'static-id',
      clientSecret: 'static-secret-16+',
      allowDynamicRegistration: true,
    })
    const registered = await store.registerClient!({
      redirect_uris: [CLAUDE_MCP_REDIRECT_URI],
      grant_types: ['authorization_code'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      client_id: 'static-id',
    } as never)
    expect(registered.client_id).not.toBe('static-id')
    const staticClient = await store.getClient('static-id')
    expect(staticClient?.client_secret).toBe('static-secret-16+')
  })
})

describe('authorization code TTL', () => {
  it('rejects expired authorization codes', async () => {
    let now = 1_000_000
    const provider = createMcpOAuthProvider({
      clientId: 'static-id',
      clientSecret: 'static-secret-16+',
      now: () => now,
    })
    const client = (await provider.clientsStore.getClient('static-id'))!
    const res = {
      redirect: vi.fn(),
    }
    await provider.authorize(
      client,
      {
        redirectUri: CLAUDE_MCP_REDIRECT_URI,
        codeChallenge: 'challenge',
        state: 's',
        scopes: ['mcp:tools'],
      },
      res as never,
    )
    const location = (res.redirect as ReturnType<typeof vi.fn>).mock
      .calls[0]![1] as string
    const code = new URL(location).searchParams.get('code')!
    now += AUTH_CODE_TTL_MS + 1
    await expect(
      provider.challengeForAuthorizationCode(client, code),
    ).rejects.toThrow(/expired/i)
  })
})

import { describe, expect, it, vi } from 'vitest'
import {
  AUTH_CODE_TTL_MS,
  CHATGPT_REDIRECT_CACHE_MAX_ENTRIES,
  CHATGPT_REDIRECT_CACHE_TTL_MS,
  CHATGPT_REDIRECT_URI_MAX_LENGTH,
  MCP_OAUTH_FIXED_REDIRECT_URIS,
  CHATGPT_MCP_REDIRECT_URIS,
  CLAUDE_MCP_REDIRECT_URI,
  createMcpOAuthProvider,
  createStaticClientsStore,
  isAllowedDcrRedirectUri,
  isChatGptConnectorOauthRedirectUri,
} from './oauth-provider.ts'

describe('DCR redirect allowlist', () => {
  it('allows Claude / Cursor / ChatGPT HTTPS callbacks only', () => {
    expect(isAllowedDcrRedirectUri(CLAUDE_MCP_REDIRECT_URI)).toBe(true)
    expect(isAllowedDcrRedirectUri(CHATGPT_MCP_REDIRECT_URIS[0]!)).toBe(true)
    expect(
      isAllowedDcrRedirectUri(
        'https://chatgpt.com/connector/oauth/cb_abc123',
      ),
    ).toBe(true)
    expect(isAllowedDcrRedirectUri('http://localhost/callback')).toBe(false)
    expect(isAllowedDcrRedirectUri('https://evil.example/callback')).toBe(false)
  })
})

describe('ChatGPT connector redirect URIs', () => {
  it('accepts per-connector callbacks and rejects lookalikes', () => {
    expect(
      isChatGptConnectorOauthRedirectUri(
        'https://chatgpt.com/connector/oauth/cb_abc123',
      ),
    ).toBe(true)
    expect(
      isChatGptConnectorOauthRedirectUri(CHATGPT_MCP_REDIRECT_URIS[0]!),
    ).toBe(false)
    expect(
      isChatGptConnectorOauthRedirectUri('https://chatgpt.com/evil'),
    ).toBe(false)
  })

  it('bounds callback storage and expires entries, including refreshed callbacks', async () => {
    let now = 1000
    const store = createStaticClientsStore({
      clientId: 'static-id',
      clientSecret: 'static-secret-16+',
      now: () => now,
    })
    const uri = (i: number) => `https://chatgpt.com/connector/oauth/cb_${i}`
    const redirects = async () =>
      (await store.getClient('static-id'))!.redirect_uris
    for (let i = 0; i <= CHATGPT_REDIRECT_CACHE_MAX_ENTRIES; i++) {
      store.rememberAllowedRedirectUri?.('static-id', uri(i))
    }
    expect(await redirects()).toHaveLength(
      MCP_OAUTH_FIXED_REDIRECT_URIS.length + CHATGPT_REDIRECT_CACHE_MAX_ENTRIES,
    )
    expect(await redirects()).not.toContain(uri(0))
    expect(await redirects()).toContain(uri(CHATGPT_REDIRECT_CACHE_MAX_ENTRIES))
    now += CHATGPT_REDIRECT_CACHE_TTL_MS - 1
    store.rememberAllowedRedirectUri?.('static-id', uri(1))
    now += 1
    expect(await redirects()).toEqual([...MCP_OAUTH_FIXED_REDIRECT_URIS, uri(1)])
    now += CHATGPT_REDIRECT_CACHE_TTL_MS
    expect(await redirects()).toEqual(MCP_OAUTH_FIXED_REDIRECT_URIS)
    // Expiration is also applied on insertion, without a preceding lookup.
    store.rememberAllowedRedirectUri?.('static-id', uri(2))
    now += CHATGPT_REDIRECT_CACHE_TTL_MS
    store.rememberAllowedRedirectUri?.('static-id', uri(3))
    expect(await redirects()).toEqual([...MCP_OAUTH_FIXED_REDIRECT_URIS, uri(3)])
  })

  it('does not cache callbacks for another client, disallowed hosts, or oversized URIs', async () => {
    const store = createStaticClientsStore({
      clientId: 'static-id',
      clientSecret: 'static-secret-16+',
    })
    store.rememberAllowedRedirectUri?.(
      'unknown-client',
      'https://chatgpt.com/connector/oauth/cb_1',
    )
    store.rememberAllowedRedirectUri?.(
      'static-id',
      'https://evil.example/connector/oauth/cb_1',
    )
    store.rememberAllowedRedirectUri?.(
      'static-id',
      `https://chatgpt.com/connector/oauth/${'a'.repeat(CHATGPT_REDIRECT_URI_MAX_LENGTH)}`,
    )
    expect((await store.getClient('static-id'))!.redirect_uris).toEqual(
      MCP_OAUTH_FIXED_REDIRECT_URIS,
    )
  })

  it('remembers per-connector callbacks on the static client', async () => {
    const store = createStaticClientsStore({
      clientId: 'static-id',
      clientSecret: 'static-secret-16+',
    })
    const connectorUri =
      'https://chatgpt.com/connector/oauth/cb_test_connector_1'
    store.rememberAllowedRedirectUri?.('static-id', connectorUri)
    const client = await store.getClient('static-id')
    expect(client?.redirect_uris).toContain(connectorUri)
    expect(client?.redirect_uris).toContain(CHATGPT_MCP_REDIRECT_URIS[0])
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

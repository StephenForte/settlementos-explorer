import crypto from 'node:crypto'
import net from 'node:net'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from '../app.ts'

const MCP_KEY = 'test-mcp-api-key-32chars!!'
const OAUTH_CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const OAUTH_CLIENT_SECRET = 'oauth-client-secret-16+'

const servers: import('node:http').Server[] = []

afterEach(async () => {
  while (servers.length) {
    const server = servers.pop()
    if (!server) continue
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()))
    })
  }
})

async function listen(
  app: ReturnType<typeof createApp>,
  port?: number,
): Promise<{ baseUrl: string; port: number }> {
  const server = app.listen(port ?? 0, '127.0.0.1')
  servers.push(server)
  await new Promise<void>((resolve) => server.once('listening', () => resolve()))
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Expected TCP address')
  }
  return { baseUrl: `http://127.0.0.1:${address.port}`, port: address.port }
}

async function reservePort(): Promise<number> {
  const probe = net.createServer()
  await new Promise<void>((resolve) => {
    probe.listen(0, '127.0.0.1', () => resolve())
  })
  const address = probe.address()
  if (!address || typeof address === 'string') {
    throw new Error('Expected TCP address')
  }
  const { port } = address
  await new Promise<void>((resolve, reject) => {
    probe.close((err) => (err ? reject(err) : resolve()))
  })
  return port
}

async function requestJson(
  app: ReturnType<typeof createApp>,
  pathName: string,
  opts: {
    method?: string
    body?: unknown
    headers?: Record<string, string>
  } = {},
) {
  const { baseUrl } = await listen(app)
  const headers: Record<string, string> = { ...(opts.headers || {}) }
  const init: RequestInit = { method: opts.method || 'GET', headers }
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(opts.body)
  }
  const res = await fetch(`${baseUrl}${pathName}`, init)
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    body = null
  }
  return { status: res.status, body, headers: res.headers }
}

function parseToolJson(result: unknown) {
  const content = (result as { content?: Array<{ type: string; text?: string }> })
    .content
  const text = content?.find((c) => c.type === 'text')?.text
  if (!text) throw new Error('Missing tool text content')
  return JSON.parse(text) as Record<string, unknown>
}

describe('/api/health + /mcp gate', () => {
  it('returns 503 when MCP_API_KEY is unset', async () => {
    const app = createApp({ mcpApiKey: '', warn: () => {} })
    const { status, body } = await requestJson(app, '/mcp', {
      method: 'POST',
      body: { jsonrpc: '2.0', method: 'initialize', id: 1, params: {} },
    })
    expect(status).toBe(503)
    expect(String((body as { error?: string }).error)).toMatch(
      /MCP is not configured/i,
    )
  })

  it('returns 401 without a valid bearer token', async () => {
    const app = createApp({ mcpApiKey: MCP_KEY, warn: () => {} })
    const { status, body } = await requestJson(app, '/mcp', {
      method: 'POST',
      body: { jsonrpc: '2.0', method: 'initialize', id: 1, params: {} },
    })
    expect(status).toBe(401)
    const err =
      (body as { error?: string; error_description?: string }).error ||
      (body as { error_description?: string }).error_description ||
      ''
    expect(String(err)).toMatch(/Bearer|invalid_token|Authorization/i)
  })

  it('reports mcpConfigured on health', async () => {
    const off = createApp({ mcpApiKey: '', warn: () => {} })
    const offHealth = await requestJson(off, '/api/health')
    expect((offHealth.body as { mcpConfigured: boolean }).mcpConfigured).toBe(
      false,
    )

    const on = createApp({ mcpApiKey: MCP_KEY, warn: () => {} })
    const onHealth = await requestJson(on, '/api/health')
    expect((onHealth.body as { mcpConfigured: boolean }).mcpConfigured).toBe(
      true,
    )
    expect(
      (onHealth.body as { mcpOauthConfigured: boolean }).mcpOauthConfigured,
    ).toBe(false)
  })
})

describe('/mcp OAuth', () => {
  function makePkce() {
    const verifier = crypto.randomBytes(32).toString('base64url')
    const challenge = crypto
      .createHash('sha256')
      .update(verifier)
      .digest('base64url')
    return { verifier, challenge }
  }

  it('advertises metadata and completes static client code+PKCE exchange', async () => {
    const port = await reservePort()
    const publicUrl = `http://127.0.0.1:${port}`
    const app = createApp({
      mcpApiKey: MCP_KEY,
      mcpOauthClientId: OAUTH_CLIENT_ID,
      mcpOauthClientSecret: OAUTH_CLIENT_SECRET,
      mcpPublicUrl: publicUrl,
      warn: () => {},
    })
    const { baseUrl } = await listen(app, port)

    const health = (await fetch(`${baseUrl}/api/health`).then((r) =>
      r.json(),
    )) as {
      mcpConfigured: boolean
      mcpOauthConfigured: boolean
      mcpOauthDcrEnabled: boolean
    }
    expect(health.mcpConfigured).toBe(true)
    expect(health.mcpOauthConfigured).toBe(true)
    expect(health.mcpOauthDcrEnabled).toBe(false)

    const asMeta = (await fetch(
      `${baseUrl}/.well-known/oauth-authorization-server`,
    ).then((r) => r.json())) as {
      issuer: string
      authorization_endpoint: string
      token_endpoint: string
      registration_endpoint?: string
    }
    expect(asMeta.issuer).toBe(`${baseUrl}/`)
    expect(asMeta.authorization_endpoint).toBeTruthy()
    expect(asMeta.token_endpoint).toBeTruthy()
    expect(asMeta.registration_endpoint).toBeUndefined()

    const pathAs = (await fetch(
      `${baseUrl}/.well-known/oauth-authorization-server/mcp`,
    ).then((r) => r.json())) as { issuer: string }
    expect(pathAs.issuer).toBe(`${baseUrl}/`)
    expect(pathAs.issuer.endsWith('/mcp')).toBe(false)

    const rootPrm = await fetch(
      `${baseUrl}/.well-known/oauth-protected-resource`,
    )
    expect(rootPrm.status).toBe(200)

    const dcrDisabled = await fetch(`${baseUrl}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        client_name: 'claude-dcr-test',
      }),
    })
    expect(dcrDisabled.status).toBeGreaterThanOrEqual(400)

    const prm = (await fetch(
      `${baseUrl}/.well-known/oauth-protected-resource/mcp`,
    ).then((r) => r.json())) as {
      resource: string
      authorization_servers: string[]
    }
    expect(prm.resource).toBe(`${baseUrl}/mcp`)
    expect(prm.authorization_servers).toEqual([`${baseUrl}/`])

    const unauth = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'initialize',
        id: 1,
        params: {},
      }),
    })
    expect(unauth.status).toBe(401)
    expect(unauth.headers.get('www-authenticate') || '').toMatch(
      /resource_metadata=/,
    )

    const staticPkce = makePkce()
    const redirectUri = 'https://claude.ai/api/mcp/auth_callback'
    const authUrl = new URL('/authorize', baseUrl)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('client_id', OAUTH_CLIENT_ID)
    authUrl.searchParams.set('redirect_uri', redirectUri)
    authUrl.searchParams.set('code_challenge', staticPkce.challenge)
    authUrl.searchParams.set('code_challenge_method', 'S256')
    authUrl.searchParams.set('state', 'test-state')
    authUrl.searchParams.set('resource', `${baseUrl}/mcp`)

    const authRes = await fetch(authUrl, { redirect: 'manual' })
    expect(authRes.status).toBe(302)
    const location = authRes.headers.get('location')
    expect(location).toBeTruthy()
    const redirected = new URL(location!)
    expect(redirected.origin + redirected.pathname).toBe(redirectUri)
    expect(redirected.searchParams.get('state')).toBe('test-state')
    const code = redirected.searchParams.get('code')
    expect(code).toBeTruthy()

    const tokenRes = await fetch(`${baseUrl}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code!,
        code_verifier: staticPkce.verifier,
        redirect_uri: redirectUri,
        client_id: OAUTH_CLIENT_ID,
        client_secret: OAUTH_CLIENT_SECRET,
        resource: `${baseUrl}/mcp`,
      }),
    })
    expect(tokenRes.status).toBe(200)
    const tokens = (await tokenRes.json()) as {
      access_token: string
      token_type: string
    }
    expect(tokens.access_token).toBeTruthy()
    expect(tokens.token_type.toLowerCase()).toBe('bearer')

    const transport = new StreamableHTTPClientTransport(
      new URL(`${baseUrl}/mcp`),
      {
        requestInit: {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        },
      },
    )
    const client = new Client({ name: 'oauth-test', version: '1.0.0' })
    await client.connect(transport)
    try {
      const listed = parseToolJson(
        await client.callTool({ name: 'list_addresses', arguments: {} }),
      )
      expect(Array.isArray(listed.addresses)).toBe(true)
      expect((listed.addresses as unknown[]).length).toBeGreaterThan(0)
    } finally {
      await client.close()
    }
  })

  it('supports allowlisted DCR when MCP_OAUTH_ALLOW_DCR is enabled', async () => {
    const port = await reservePort()
    const publicUrl = `http://127.0.0.1:${port}`
    const app = createApp({
      mcpApiKey: MCP_KEY,
      mcpOauthClientId: OAUTH_CLIENT_ID,
      mcpOauthClientSecret: OAUTH_CLIENT_SECRET,
      mcpPublicUrl: publicUrl,
      mcpOauthAllowDcr: true,
      warn: () => {},
    })
    const { baseUrl } = await listen(app, port)

    const asMeta = (await fetch(
      `${baseUrl}/.well-known/oauth-authorization-server`,
    ).then((r) => r.json())) as { registration_endpoint?: string }
    expect(asMeta.registration_endpoint).toBe(`${baseUrl}/register`)

    const dcr = await fetch(`${baseUrl}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        client_name: 'claude-dcr-test',
      }),
    })
    expect(dcr.status).toBe(201)
    const registered = (await dcr.json()) as { client_id: string }
    expect(registered.client_id).toBeTruthy()

    const rejected = await fetch(`${baseUrl}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        redirect_uris: ['http://localhost/callback'],
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        client_name: 'evil-localhost-dcr',
      }),
    })
    expect(rejected.status).toBeGreaterThanOrEqual(400)

    const dcrPkce = makePkce()
    const dcrRedirect = 'https://claude.ai/api/mcp/auth_callback'
    const dcrAuthUrl = new URL('/authorize', baseUrl)
    dcrAuthUrl.searchParams.set('response_type', 'code')
    dcrAuthUrl.searchParams.set('client_id', registered.client_id)
    dcrAuthUrl.searchParams.set('redirect_uri', dcrRedirect)
    dcrAuthUrl.searchParams.set('code_challenge', dcrPkce.challenge)
    dcrAuthUrl.searchParams.set('code_challenge_method', 'S256')
    dcrAuthUrl.searchParams.set('state', 'dcr-state')
    dcrAuthUrl.searchParams.set('resource', `${baseUrl}/mcp`)
    const dcrAuthRes = await fetch(dcrAuthUrl, { redirect: 'manual' })
    expect(dcrAuthRes.status).toBe(302)
    const dcrLocation = dcrAuthRes.headers.get('location')
    expect(dcrLocation).toBeTruthy()
    const dcrCode = new URL(dcrLocation!).searchParams.get('code')
    expect(dcrCode).toBeTruthy()

    const dcrTokenRes = await fetch(`${baseUrl}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: dcrCode!,
        code_verifier: dcrPkce.verifier,
        redirect_uri: dcrRedirect,
        client_id: registered.client_id,
        resource: `${baseUrl}/mcp`,
      }),
    })
    expect(dcrTokenRes.status).toBe(200)
    const dcrTokens = (await dcrTokenRes.json()) as { access_token: string }
    expect(dcrTokens.access_token).toBeTruthy()
  })

  it('accepts ChatGPT platform + per-connector redirect URIs', async () => {
    const port = await reservePort()
    const publicUrl = `http://127.0.0.1:${port}`
    const app = createApp({
      mcpApiKey: MCP_KEY,
      mcpOauthClientId: OAUTH_CLIENT_ID,
      mcpOauthClientSecret: OAUTH_CLIENT_SECRET,
      mcpPublicUrl: publicUrl,
      warn: () => {},
    })
    const { baseUrl } = await listen(app, port)

    async function authorize(redirectUri: string) {
      const { challenge } = makePkce()
      const authUrl = new URL('/authorize', baseUrl)
      authUrl.searchParams.set('response_type', 'code')
      authUrl.searchParams.set('client_id', OAUTH_CLIENT_ID)
      authUrl.searchParams.set('redirect_uri', redirectUri)
      authUrl.searchParams.set('code_challenge', challenge)
      authUrl.searchParams.set('code_challenge_method', 'S256')
      authUrl.searchParams.set('state', 'chatgpt-state')
      authUrl.searchParams.set('resource', `${baseUrl}/mcp`)
      return fetch(authUrl, { redirect: 'manual' })
    }

    const platformUri =
      'https://chatgpt.com/connector_platform_oauth_redirect'
    const platformRes = await authorize(platformUri)
    expect(platformRes.status).toBe(302)
    const platformLoc = platformRes.headers.get('location')
    expect(platformLoc).toBeTruthy()
    expect(
      new URL(platformLoc!).origin + new URL(platformLoc!).pathname,
    ).toBe(platformUri)

    const connectorUri =
      'https://chatgpt.com/connector/oauth/cb_test_connector_1'
    const connectorRes = await authorize(connectorUri)
    expect(connectorRes.status).toBe(302)
    const connectorLoc = connectorRes.headers.get('location')
    expect(connectorLoc).toBeTruthy()
    expect(
      new URL(connectorLoc!).origin + new URL(connectorLoc!).pathname,
    ).toBe(connectorUri)

    const rejected = await authorize('https://evil.example/callback')
    expect(rejected.status).toBe(400)
  })
})

describe('/mcp tools', () => {
  it('lists tools and address-book data with bearer auth', async () => {
    const app = createApp({ mcpApiKey: MCP_KEY, warn: () => {} })
    const { baseUrl } = await listen(app)
    const transport = new StreamableHTTPClientTransport(
      new URL(`${baseUrl}/mcp`),
      {
        requestInit: {
          headers: { Authorization: `Bearer ${MCP_KEY}` },
        },
      },
    )
    const client = new Client({ name: 'tool-test', version: '1.0.0' })
    await client.connect(transport)
    try {
      const tools = await client.listTools()
      const names = tools.tools.map((t) => t.name).sort()
      expect(names).toEqual([
        'get_balances',
        'get_entity',
        'get_transfers',
        'list_addresses',
        'list_networks',
        'summarize_explorer',
      ])

      const summary = parseToolJson(
        await client.callTool({ name: 'summarize_explorer', arguments: {} }),
      )
      expect(summary.totalAddresses).toBeGreaterThan(0)

      const resources = await client.listResources()
      expect(
        resources.resources.some((r) => r.uri === 'explorer://address-book'),
      ).toBe(true)
    } finally {
      await client.close()
    }
  })
})

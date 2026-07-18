/**
 * In-memory OAuth 2.1 provider for Claude/Cursor MCP connectors.
 * Pre-registers a confidential client (MCP_OAUTH_CLIENT_ID / SECRET).
 * Dynamic Client Registration is off by default; when enabled, only
 * allowlisted HTTPS redirect URIs are accepted (no open localhost DCR).
 * Authorize auto-approves (static client_secret / PKCE gate the token).
 */

import { randomUUID } from 'node:crypto'
import type {
  OAuthClientInformationFull,
  OAuthTokenRevocationRequest,
} from '@modelcontextprotocol/sdk/shared/auth.js'
import type {
  AuthorizationParams,
  OAuthServerProvider,
} from '@modelcontextprotocol/sdk/server/auth/provider.js'
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js'
import type { Response } from 'express'

/** Claude.ai / Desktop / Cowork / mobile callback (fixed by Anthropic). */
export const CLAUDE_MCP_REDIRECT_URI =
  'https://claude.ai/api/mcp/auth_callback'

/** Alternate Claude host some surfaces use. */
export const CLAUDE_COM_MCP_REDIRECT_URI =
  'https://claude.com/api/mcp/auth_callback'

/** Claude Code loopback templates (port-agnostic match in SDK). */
export const CLAUDE_CODE_REDIRECT_URIS = [
  'http://localhost/callback',
  'http://127.0.0.1/callback',
]

/** Cursor desktop / web OAuth callbacks. */
export const CURSOR_MCP_REDIRECT_URIS = [
  'cursor://anysphere.cursor-mcp/oauth/callback',
  'http://localhost:8787/callback',
  'https://www.cursor.com/agents/mcp/oauth/callback',
]

/** Redirect URIs allowed for Dynamic Client Registration (HTTPS / cursor only). */
export const DCR_REDIRECT_URI_ALLOWLIST = [
  CLAUDE_MCP_REDIRECT_URI,
  CLAUDE_COM_MCP_REDIRECT_URI,
  'https://www.cursor.com/agents/mcp/oauth/callback',
] as const

export const MCP_OAUTH_SCOPES = ['mcp:tools']

const ACCESS_TTL_SEC = 3600
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000
/** Authorization codes are single-use and short-lived. */
export const AUTH_CODE_TTL_MS = 5 * 60 * 1000

export function isAllowedDcrRedirectUri(uri: string): boolean {
  return (DCR_REDIRECT_URI_ALLOWLIST as readonly string[]).includes(uri)
}

export function createStaticClientsStore(opts: {
  clientId: string
  clientSecret: string
  allowDynamicRegistration?: boolean
}): OAuthRegisteredClientsStore {
  const clients = new Map<string, OAuthClientInformationFull>()
  const allowDynamicRegistration = opts.allowDynamicRegistration === true

  const staticClient: OAuthClientInformationFull = {
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_secret_expires_at: 0,
    redirect_uris: [
      CLAUDE_MCP_REDIRECT_URI,
      CLAUDE_COM_MCP_REDIRECT_URI,
      ...CLAUDE_CODE_REDIRECT_URIS,
      ...CURSOR_MCP_REDIRECT_URIS,
    ],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'client_secret_post',
    client_name: 'SettlementOS Explorer MCP',
  }
  clients.set(staticClient.client_id, staticClient)

  const store: OAuthRegisteredClientsStore = {
    async getClient(clientId: string) {
      const client = clients.get(clientId)
      return client ? { ...client } : undefined
    },
  }

  if (allowDynamicRegistration) {
    store.registerClient = async (client) => {
      const redirectUris = client.redirect_uris ?? []
      if (redirectUris.length === 0) {
        throw new Error('At least one redirect_uri is required')
      }
      for (const uri of redirectUris) {
        if (!isAllowedDcrRedirectUri(uri)) {
          throw new Error(
            `redirect_uri not allowed for dynamic registration: ${uri}`,
          )
        }
      }
      // Always mint a new id — never accept a caller-supplied client_id
      // (prevents overwriting the static confidential client).
      const full: OAuthClientInformationFull = {
        ...client,
        client_id: randomUUID(),
        client_id_issued_at: Math.floor(Date.now() / 1000),
      }
      clients.set(full.client_id, full)
      return { ...full }
    }
  }

  return store
}

type TokenRecord = {
  token: string
  clientId: string
  scopes: string[]
  expiresAt: number
  resource?: URL
  type: 'access' | 'refresh'
  accessToken?: string
}

type CodeRecord = {
  client: OAuthClientInformationFull
  params: AuthorizationParams
  expiresAt: number
}

export function createMcpOAuthProvider(opts: {
  clientId: string
  clientSecret: string
  validateResource?: (resource?: URL) => boolean
  allowDynamicRegistration?: boolean
  /** Injectable clock for tests. */
  now?: () => number
}): OAuthServerProvider {
  const now = opts.now ?? Date.now
  const clientsStore = createStaticClientsStore(opts)
  const codes = new Map<string, CodeRecord>()
  const tokens = new Map<string, TokenRecord>()

  function purgeExpiredCodes() {
    const t = now()
    for (const [code, record] of codes) {
      if (record.expiresAt < t) codes.delete(code)
    }
  }

  return {
    get clientsStore() {
      return clientsStore
    },

    async authorize(client, params, res: Response) {
      purgeExpiredCodes()
      const code = randomUUID()
      codes.set(code, {
        client,
        params,
        expiresAt: now() + AUTH_CODE_TTL_MS,
      })

      const searchParams = new URLSearchParams({ code })
      if (params.state !== undefined) {
        searchParams.set('state', params.state)
      }
      const targetUrl = new URL(params.redirectUri)
      targetUrl.search = searchParams.toString()
      // Claude.ai rejects 307; OAuth 2.1 expects 302/303.
      res.redirect(302, targetUrl.toString())
    },

    async challengeForAuthorizationCode(client, authorizationCode) {
      const codeData = codes.get(authorizationCode)
      if (!codeData) {
        throw new Error('Invalid authorization code')
      }
      if (codeData.expiresAt < now()) {
        codes.delete(authorizationCode)
        throw new Error('Authorization code expired')
      }
      if (codeData.client.client_id !== client.client_id) {
        throw new Error('Authorization code was not issued to this client')
      }
      return codeData.params.codeChallenge
    },

    async exchangeAuthorizationCode(
      client,
      authorizationCode,
      _codeVerifier,
      _redirectUri,
      resource,
    ) {
      const codeData = codes.get(authorizationCode)
      if (!codeData) {
        throw new Error('Invalid authorization code')
      }
      if (codeData.expiresAt < now()) {
        codes.delete(authorizationCode)
        throw new Error('Authorization code expired')
      }
      if (codeData.client.client_id !== client.client_id) {
        throw new Error('Authorization code was not issued to this client')
      }
      const resourceToCheck = resource || codeData.params.resource
      if (opts.validateResource && !opts.validateResource(resourceToCheck)) {
        throw new Error(`Invalid resource: ${resourceToCheck}`)
      }

      codes.delete(authorizationCode)

      const scopes = codeData.params.scopes?.length
        ? codeData.params.scopes
        : MCP_OAUTH_SCOPES
      const accessToken = randomUUID()
      const refreshToken = randomUUID()
      const expiresAtMs = now() + ACCESS_TTL_SEC * 1000
      const resourceUrl = resourceToCheck

      tokens.set(accessToken, {
        token: accessToken,
        clientId: client.client_id,
        scopes,
        expiresAt: expiresAtMs,
        resource: resourceUrl,
        type: 'access',
      })
      tokens.set(refreshToken, {
        token: refreshToken,
        clientId: client.client_id,
        scopes,
        expiresAt: now() + REFRESH_TTL_MS,
        resource: resourceUrl,
        type: 'refresh',
        accessToken,
      })

      return {
        access_token: accessToken,
        token_type: 'bearer',
        expires_in: ACCESS_TTL_SEC,
        refresh_token: refreshToken,
        scope: scopes.join(' '),
      }
    },

    async exchangeRefreshToken(client, refreshToken, scopes, resource) {
      const existing = tokens.get(refreshToken)
      if (
        !existing ||
        existing.type !== 'refresh' ||
        existing.expiresAt < now() ||
        existing.clientId !== client.client_id
      ) {
        throw new Error('Invalid refresh token')
      }

      if (existing.accessToken) {
        tokens.delete(existing.accessToken)
      }

      const nextScopes = scopes?.length ? scopes : existing.scopes
      const resourceUrl = resource || existing.resource
      if (opts.validateResource && !opts.validateResource(resourceUrl)) {
        throw new Error(`Invalid resource: ${resourceUrl}`)
      }

      const accessToken = randomUUID()
      const expiresAtMs = now() + ACCESS_TTL_SEC * 1000
      tokens.set(accessToken, {
        token: accessToken,
        clientId: client.client_id,
        scopes: nextScopes,
        expiresAt: expiresAtMs,
        resource: resourceUrl,
        type: 'access',
      })
      existing.accessToken = accessToken
      tokens.set(refreshToken, existing)

      return {
        access_token: accessToken,
        token_type: 'bearer',
        expires_in: ACCESS_TTL_SEC,
        refresh_token: refreshToken,
        scope: nextScopes.join(' '),
      }
    },

    async verifyAccessToken(token) {
      const tokenData = tokens.get(token)
      if (
        !tokenData ||
        tokenData.type !== 'access' ||
        !tokenData.expiresAt ||
        tokenData.expiresAt < now()
      ) {
        throw new Error('Invalid or expired token')
      }
      return {
        token,
        clientId: tokenData.clientId,
        scopes: tokenData.scopes,
        expiresAt: Math.floor(tokenData.expiresAt / 1000),
        resource: tokenData.resource,
      }
    },

    async revokeToken(
      client,
      request: OAuthTokenRevocationRequest,
    ): Promise<void> {
      const token = request.token
      const data = tokens.get(token)
      if (!data || data.clientId !== client.client_id) return
      tokens.delete(token)
      if (data.type === 'refresh' && data.accessToken) {
        tokens.delete(data.accessToken)
      }
    },
  }
}

/**
 * In-memory OAuth 2.1 provider for Claude/Cursor MCP connectors.
 * Pre-registers a confidential client (MCP_OAUTH_CLIENT_ID / SECRET) and
 * supports Dynamic Client Registration (Claude's preferred path).
 * Auto-approves authorize (PKCE + client_secret / public client gate the token).
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

export const MCP_OAUTH_SCOPES = ['mcp:tools']

const ACCESS_TTL_SEC = 3600
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000

export function createStaticClientsStore(opts: {
  clientId: string
  clientSecret: string
}): OAuthRegisteredClientsStore {
  const clients = new Map<string, OAuthClientInformationFull>()

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

  return {
    async getClient(clientId: string) {
      const client = clients.get(clientId)
      return client ? { ...client } : undefined
    },
    async registerClient(client) {
      const full = client as OAuthClientInformationFull
      if (!full.client_id) {
        throw new Error('client_id required for registration')
      }
      clients.set(full.client_id, full)
      return { ...full }
    },
  }
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

export function createMcpOAuthProvider(opts: {
  clientId: string
  clientSecret: string
  validateResource?: (resource?: URL) => boolean
}): OAuthServerProvider {
  const clientsStore = createStaticClientsStore(opts)
  const codes = new Map<
    string,
    { client: OAuthClientInformationFull; params: AuthorizationParams }
  >()
  const tokens = new Map<string, TokenRecord>()

  return {
    get clientsStore() {
      return clientsStore
    },

    async authorize(client, params, res: Response) {
      const code = randomUUID()
      codes.set(code, { client, params })

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
      const expiresAtMs = Date.now() + ACCESS_TTL_SEC * 1000
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
        expiresAt: Date.now() + REFRESH_TTL_MS,
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
        existing.expiresAt < Date.now() ||
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
      const expiresAtMs = Date.now() + ACCESS_TTL_SEC * 1000
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
        tokenData.expiresAt < Date.now()
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

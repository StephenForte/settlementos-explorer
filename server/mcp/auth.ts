/**
 * MCP bearer + OAuth auth helpers.
 */

import type { OAuthServerProvider } from '@modelcontextprotocol/sdk/server/auth/provider.js'
import type { NextFunction, Request, Response } from 'express'
import { timingSafeEqualString } from './crypto.js'
import { createMcpOAuthProvider } from './oauth-provider.js'

export const MCP_API_KEY_MIN_LENGTH = 16
export const MCP_OAUTH_SECRET_MIN_LENGTH = 16

export type McpAuthConfig = {
  configured: boolean
  oauthConfigured: boolean
  /** Open Dynamic Client Registration (off by default). */
  oauthAllowDcr: boolean
  apiKey: string
  oauthClientId: string
  oauthClientSecret: string
  publicUrl: string
  reason: string | null
  oauthReason: string | null
}

function parseTruthyEnv(value: string | undefined): boolean {
  if (!value) return false
  const normalized = value.trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes'
}

export function resolveMcpAuth(
  opts: {
    apiKey?: string
    oauthClientId?: string
    oauthClientSecret?: string
    publicUrl?: string
    oauthAllowDcr?: boolean | string
    warn?: (message: string) => void
  } = {},
): McpAuthConfig {
  const warn = opts.warn || ((message) => console.warn(message))
  const apiKey = typeof opts.apiKey === 'string' ? opts.apiKey.trim() : ''
  const oauthClientId =
    typeof opts.oauthClientId === 'string' ? opts.oauthClientId.trim() : ''
  const oauthClientSecret =
    typeof opts.oauthClientSecret === 'string'
      ? opts.oauthClientSecret.trim()
      : ''
  const publicUrl =
    typeof opts.publicUrl === 'string'
      ? normalizeMcpPublicUrl(opts.publicUrl)
      : ''
  const oauthAllowDcr =
    typeof opts.oauthAllowDcr === 'boolean'
      ? opts.oauthAllowDcr
      : parseTruthyEnv(
          typeof opts.oauthAllowDcr === 'string'
            ? opts.oauthAllowDcr
            : undefined,
        )

  if (!apiKey) {
    return {
      configured: false,
      oauthConfigured: false,
      oauthAllowDcr: false,
      apiKey: '',
      oauthClientId: '',
      oauthClientSecret: '',
      publicUrl: '',
      reason: 'MCP_API_KEY not set',
      oauthReason: null,
    }
  }

  if (apiKey.length < MCP_API_KEY_MIN_LENGTH) {
    warn(
      `Warning: MCP_API_KEY must be at least ${MCP_API_KEY_MIN_LENGTH} characters — MCP stays disabled.`,
    )
    return {
      configured: false,
      oauthConfigured: false,
      oauthAllowDcr: false,
      apiKey: '',
      oauthClientId: '',
      oauthClientSecret: '',
      publicUrl: '',
      reason: `MCP_API_KEY shorter than ${MCP_API_KEY_MIN_LENGTH} characters`,
      oauthReason: null,
    }
  }

  let oauthConfigured = false
  let oauthReason: string | null = null

  if (oauthClientId || oauthClientSecret) {
    if (!oauthClientId || !oauthClientSecret) {
      oauthReason =
        'Set both MCP_OAUTH_CLIENT_ID and MCP_OAUTH_CLIENT_SECRET to enable OAuth'
      warn(`Warning: ${oauthReason} — Claude/Cursor OAuth stays disabled.`)
    } else if (oauthClientSecret.length < MCP_OAUTH_SECRET_MIN_LENGTH) {
      oauthReason = `MCP_OAUTH_CLIENT_SECRET shorter than ${MCP_OAUTH_SECRET_MIN_LENGTH} characters`
      warn(`Warning: ${oauthReason} — Claude/Cursor OAuth stays disabled.`)
    } else if (!publicUrl) {
      oauthReason =
        'MCP_PUBLIC_URL (or RENDER_EXTERNAL_URL) required for OAuth discovery metadata'
      warn(`Warning: ${oauthReason} — Claude/Cursor OAuth stays disabled.`)
    } else {
      try {
        const parsed = new URL(publicUrl)
        if (
          parsed.protocol !== 'https:' &&
          parsed.hostname !== 'localhost' &&
          parsed.hostname !== '127.0.0.1'
        ) {
          oauthReason = 'MCP_PUBLIC_URL must be https (or localhost for tests)'
          warn(`Warning: ${oauthReason} — Claude/Cursor OAuth stays disabled.`)
        } else {
          oauthConfigured = true
        }
      } catch {
        oauthReason = 'MCP_PUBLIC_URL is not a valid URL'
        warn(`Warning: ${oauthReason} — Claude/Cursor OAuth stays disabled.`)
      }
    }
  } else {
    oauthReason = 'MCP_OAUTH_CLIENT_ID / MCP_OAUTH_CLIENT_SECRET not set'
  }

  return {
    configured: true,
    oauthConfigured,
    oauthAllowDcr: oauthConfigured ? oauthAllowDcr : false,
    apiKey,
    oauthClientId: oauthConfigured ? oauthClientId : '',
    oauthClientSecret: oauthConfigured ? oauthClientSecret : '',
    publicUrl: oauthConfigured ? publicUrl : publicUrl || '',
    reason: null,
    oauthReason,
  }
}

/**
 * Origin only — strip trailing slash and a mistaken `/mcp` path.
 * Claude connectors use `…/mcp` as the resource URL; the OAuth issuer must not.
 */
export function normalizeMcpPublicUrl(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  try {
    const parsed = new URL(trimmed)
    if (parsed.pathname === '/mcp' || parsed.pathname === '/mcp/') {
      parsed.pathname = '/'
    }
    // Drop any other path/query/hash so issuer stays a pure origin.
    return parsed.origin
  } catch {
    return trimmed.replace(/\/$/, '').replace(/\/mcp$/i, '')
  }
}

export function resolveMcpPublicUrl(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): string {
  const fromEnv =
    (typeof env.MCP_PUBLIC_URL === 'string' && env.MCP_PUBLIC_URL.trim()) ||
    (typeof env.RENDER_EXTERNAL_URL === 'string' &&
      env.RENDER_EXTERNAL_URL.trim()) ||
    ''
  return normalizeMcpPublicUrl(fromEnv)
}

export function bearerMatches(
  authorizationHeader: string | undefined,
  expectedKey: string,
): boolean {
  if (typeof authorizationHeader !== 'string' || !expectedKey) {
    return false
  }
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim())
  if (!match) return false
  return timingSafeEqualString(match[1].trim(), expectedKey)
}

export function extractBearerToken(
  authorizationHeader: string | undefined,
): string | null {
  if (typeof authorizationHeader !== 'string') return null
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim())
  return match ? match[1].trim() : null
}

export function createMcpTokenVerifier(opts: {
  apiKey: string
  oauthProvider?: OAuthServerProvider | null
}) {
  return {
    async verifyAccessToken(token: string) {
      if (opts.apiKey && timingSafeEqualString(token, opts.apiKey)) {
        return {
          token,
          clientId: 'mcp-api-key',
          scopes: ['mcp:tools'],
          expiresAt: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
        }
      }
      if (opts.oauthProvider) {
        return opts.oauthProvider.verifyAccessToken(token)
      }
      throw new Error('Invalid or expired token')
    },
  }
}

export function buildMcpOAuthProvider(
  auth: Pick<
    McpAuthConfig,
    | 'oauthConfigured'
    | 'oauthAllowDcr'
    | 'oauthClientId'
    | 'oauthClientSecret'
    | 'publicUrl'
  >,
): OAuthServerProvider | null {
  if (!auth.oauthConfigured) return null
  const mcpResource = new URL('/mcp', `${auth.publicUrl}/`)
  return createMcpOAuthProvider({
    clientId: auth.oauthClientId,
    clientSecret: auth.oauthClientSecret,
    allowDynamicRegistration: auth.oauthAllowDcr,
    validateResource: (resource) => {
      if (!resource) return true
      return (
        resource.href.replace(/\/$/, '') === mcpResource.href.replace(/\/$/, '')
      )
    },
  })
}

export function requireMcpAuth(auth: Pick<McpAuthConfig, 'configured' | 'apiKey'>) {
  return function mcpAuthMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    if (!auth.configured) {
      return res.status(503).json({
        error:
          'MCP is not configured. Set MCP_API_KEY (16+ characters) on the server.',
      })
    }
    if (!bearerMatches(req.get('authorization') || '', auth.apiKey)) {
      return res.status(401).json({ error: 'Valid Bearer MCP_API_KEY required.' })
    }
    return next()
  }
}

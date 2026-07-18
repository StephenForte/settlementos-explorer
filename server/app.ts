/**
 * Express app: static SPA + health + Streamable HTTP MCP.
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import cors from 'cors'
import express, { type Express } from 'express'
import {
  MCP_API_KEY_MIN_LENGTH,
  resolveMcpAuth,
  resolveMcpPublicUrl,
  type McpAuthConfig,
} from './mcp/auth.ts'
import { corsOriginDelegate } from './mcp/cors.ts'
import { mountMcpRoutes } from './mcp/http.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

export type CreateAppDeps = {
  mcpApiKey?: string
  mcpOauthClientId?: string
  mcpOauthClientSecret?: string
  mcpPublicUrl?: string
  mcpOauthAllowDcr?: boolean | string
  staticDir?: string
  warn?: (message: string) => void
}

export type AppWithAuth = Express & {
  locals: Express['locals'] & {
    mcpAuth: McpAuthConfig
  }
}

export function createApp(deps: CreateAppDeps = {}): AppWithAuth {
  const warn = deps.warn || ((message) => console.warn(message))
  const mcpAuth = resolveMcpAuth({
    apiKey:
      deps.mcpApiKey !== undefined
        ? deps.mcpApiKey
        : process.env.MCP_API_KEY || '',
    oauthClientId:
      deps.mcpOauthClientId !== undefined
        ? deps.mcpOauthClientId
        : process.env.MCP_OAUTH_CLIENT_ID || '',
    oauthClientSecret:
      deps.mcpOauthClientSecret !== undefined
        ? deps.mcpOauthClientSecret
        : process.env.MCP_OAUTH_CLIENT_SECRET || '',
    publicUrl:
      deps.mcpPublicUrl !== undefined
        ? deps.mcpPublicUrl
        : resolveMcpPublicUrl(),
    oauthAllowDcr:
      deps.mcpOauthAllowDcr !== undefined
        ? deps.mcpOauthAllowDcr
        : process.env.MCP_OAUTH_ALLOW_DCR,
    warn,
  })

  const app = express() as AppWithAuth
  app.set('trust proxy', 1)
  app.locals.mcpAuth = mcpAuth

  // Claude / Cursor browser OAuth helpers may probe cross-origin; keep allowlisted.
  app.use(
    cors({
      origin: corsOriginDelegate,
      exposedHeaders: ['WWW-Authenticate', 'Mcp-Session-Id'],
    }),
  )

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
    res.setHeader('X-Frame-Options', 'DENY')
    next()
  })

  const defaultJson = express.json({ limit: '32kb' })
  app.use((req, res, next) => {
    if (req.method === 'POST' && req.path === '/mcp') {
      return next()
    }
    return defaultJson(req, res, next)
  })

  mountMcpRoutes(app, { mcpAuth })

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'settlementos-explorer',
      mcpConfigured: mcpAuth.configured,
      mcpOauthConfigured: mcpAuth.oauthConfigured,
      mcpOauthDcrEnabled: mcpAuth.oauthAllowDcr,
      etherscanKeyConfigured: Boolean(
        process.env.VITE_ETHERSCAN_API_KEY?.trim() ||
          process.env.ETHERSCAN_API_KEY?.trim(),
      ),
    })
  })

  const staticDir = deps.staticDir ?? path.join(repoRoot, 'dist')
  app.use(
    express.static(staticDir, {
      index: false,
      maxAge: '1h',
      setHeaders(res, filePath) {
        if (filePath.endsWith('index.html')) {
          res.setHeader('Cache-Control', 'no-cache')
        } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader(
            'Cache-Control',
            'public, max-age=31536000, immutable',
          )
        }
        res.setHeader('X-Content-Type-Options', 'nosniff')
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
      },
    }),
  )

  app.get(/.*/, (req, res, next) => {
    if (
      req.path.startsWith('/mcp') ||
      req.path.startsWith('/api/') ||
      req.path.startsWith('/.well-known/') ||
      req.path === '/authorize' ||
      req.path === '/token' ||
      req.path === '/register' ||
      req.path === '/revoke'
    ) {
      return next()
    }
    res.sendFile(path.join(staticDir, 'index.html'), (err) => {
      if (err) next(err)
    })
  })

  return app
}

export function logMcpBootStatus(warn = console.warn): void {
  const mcpBootAuth = resolveMcpAuth({
    apiKey: process.env.MCP_API_KEY || '',
    oauthClientId: process.env.MCP_OAUTH_CLIENT_ID || '',
    oauthClientSecret: process.env.MCP_OAUTH_CLIENT_SECRET || '',
    publicUrl: resolveMcpPublicUrl(),
    warn: () => {},
  })
  if (!mcpBootAuth.configured) {
    if (!process.env.MCP_API_KEY) {
      warn(
        'Warning: MCP_API_KEY not set — remote MCP at /mcp stays disabled (503).',
      )
    } else {
      warn(
        `Warning: MCP_API_KEY must be at least ${MCP_API_KEY_MIN_LENGTH} characters — MCP stays disabled.`,
      )
    }
  } else {
    console.log('MCP: /mcp enabled (Bearer MCP_API_KEY)')
    if (mcpBootAuth.oauthConfigured) {
      console.log(
        `MCP OAuth: enabled (issuer ${mcpBootAuth.publicUrl}${
          mcpBootAuth.oauthAllowDcr ? ', DCR on' : ', static clients only'
        })`,
      )
    } else if (mcpBootAuth.oauthReason) {
      warn(
        `Warning: ${mcpBootAuth.oauthReason} — OAuth connector stays disabled (Bearer still works).`,
      )
    }
  }
}

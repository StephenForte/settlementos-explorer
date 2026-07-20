/**
 * Mount Streamable HTTP MCP routes (+ optional OAuth AS) on the Express app.
 */

import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js'
import type { OAuthServerProvider } from '@modelcontextprotocol/sdk/server/auth/provider.js'
import {
  createOAuthMetadata,
  getOAuthProtectedResourceMetadataUrl,
  mcpAuthRouter,
} from '@modelcontextprotocol/sdk/server/auth/router.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import express, {
  type Express,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express'
import {
  buildMcpOAuthProvider,
  createMcpTokenVerifier,
  requireMcpAuth,
  type McpAuthConfig,
} from './auth.ts'
import { MCP_OAUTH_SCOPES } from './oauth-provider.ts'
import { createRateLimiter } from './rate-limit.ts'
import { createExplorerMcpServer } from './server.ts'

export function mountMcpRoutes(
  app: Express,
  opts: {
    mcpAuth: McpAuthConfig
    oauthProvider?: OAuthServerProvider | null
  },
) {
  const { mcpAuth } = opts
  const mcpJson = express.json({ limit: '256kb' })
  const oauthProvider =
    opts.oauthProvider !== undefined
      ? opts.oauthProvider
      : buildMcpOAuthProvider(mcpAuth)
  const oauthRateLimit = createRateLimiter({
    windowMs: 60_000,
    max: 60,
  })

  let auth: RequestHandler

  if (!mcpAuth.configured) {
    auth = requireMcpAuth(mcpAuth)
  } else if (mcpAuth.oauthConfigured && oauthProvider && mcpAuth.publicUrl) {
    // Issuer = origin only. Resource = …/mcp (Claude connector URL).
    const issuerUrl = new URL(mcpAuth.publicUrl)
    const mcpServerUrl = new URL('/mcp', `${mcpAuth.publicUrl}/`)
    const oauthMetadata = createOAuthMetadata({
      provider: oauthProvider,
      issuerUrl,
      baseUrl: issuerUrl,
      scopesSupported: MCP_OAUTH_SCOPES,
    })

    app.use(['/authorize', '/token', '/register', '/revoke'], oauthRateLimit)

    // ChatGPT may send a per-app callback
    // (https://chatgpt.com/connector/oauth/{id}). The SDK requires exact
    // registration — remember allowed ChatGPT callbacks before /authorize runs.
    app.use('/authorize', (req, _res, next) => {
      const store = oauthProvider.clientsStore as {
        rememberAllowedRedirectUri?: (uri: string | undefined) => void
      }
      if (typeof store.rememberAllowedRedirectUri === 'function') {
        const redirectUri =
          typeof req.query.redirect_uri === 'string'
            ? req.query.redirect_uri
            : undefined
        store.rememberAllowedRedirectUri(redirectUri)
      }
      next()
    })

    app.use(
      mcpAuthRouter({
        provider: oauthProvider,
        issuerUrl,
        baseUrl: issuerUrl,
        resourceServerUrl: mcpServerUrl,
        scopesSupported: MCP_OAUTH_SCOPES,
        resourceName: 'SettlementOS Explorer',
      }),
    )

    // Claude often probes path-based AS discovery from the `/mcp` resource URL.
    const serveAsMetadata: RequestHandler = (_req, res) => {
      res.status(200).json(oauthMetadata)
    }
    app.get('/.well-known/oauth-authorization-server/mcp', serveAsMetadata)
    app.get('/mcp/.well-known/oauth-authorization-server', serveAsMetadata)
    app.get('/mcp/.well-known/openid-configuration', serveAsMetadata)
    app.get('/.well-known/openid-configuration', serveAsMetadata)

    const protectedResourceMetadata = {
      resource: mcpServerUrl.href,
      authorization_servers: [oauthMetadata.issuer],
      scopes_supported: MCP_OAUTH_SCOPES,
      resource_name: 'SettlementOS Explorer',
    }
    const servePrm: RequestHandler = (_req, res) => {
      res.status(200).json(protectedResourceMetadata)
    }
    // Root PRM (some clients omit the /mcp path suffix).
    app.get('/.well-known/oauth-protected-resource', servePrm)
    app.get('/mcp/.well-known/oauth-protected-resource', servePrm)

    const verifier = createMcpTokenVerifier({
      apiKey: mcpAuth.apiKey,
      oauthProvider,
    })
    const bearer = requireBearerAuth({
      verifier,
      requiredScopes: [],
      resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpServerUrl),
    })

    auth = (req: Request, res: Response, next: NextFunction) => {
      if (!mcpAuth.configured) {
        return res.status(503).json({
          error:
            'MCP is not configured. Set MCP_API_KEY (16+ characters) on the server.',
        })
      }
      return bearer(req, res, next)
    }
  } else {
    auth = requireMcpAuth(mcpAuth)
  }

  async function handleMcpPost(req: Request, res: Response) {
    const server = createExplorerMcpServer()
    let transport: StreamableHTTPServerTransport | undefined
    try {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      })
      await server.connect(transport)
      await transport.handleRequest(req, res, req.body)
    } catch (err) {
      console.error('MCP request error:', err)
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        })
      }
    } finally {
      if (transport) {
        void transport.close()
      }
      void server.close()
    }
  }

  const mcpRateLimit = createRateLimiter({
    windowMs: 60_000,
    max: 120,
  })

  app.post('/mcp', mcpRateLimit, auth, mcpJson, (req, res) => {
    void handleMcpPost(req, res)
  })

  app.get('/mcp', auth, (_req, res) => {
    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed.' },
      id: null,
    })
  })

  app.delete('/mcp', auth, (_req, res) => {
    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed.' },
      id: null,
    })
  })
}

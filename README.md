# SettlementOS Explorer

Independent, third-party view of SettlementOS on-chain activity on **Base Sepolia** and **Polygon Amoy**.

This app reads **only public chain data** (public RPCs + explorer APIs). It labels addresses from a bundled address book and deep-links every claim to Basescan / Amoy Polygonscan.

Optional **remote MCP** (Node/Express) lets Claude / Cursor query the same public data via Streamable HTTP + Bearer or OAuth.

## What this repo does **not** contain

- **No private keys**
- **No SettlementOS API keys or database access**
- **No wallet connection or write operations**

Address book values are public on-chain addresses copied from SettlementOS `chain/deployments.<network>.json` (addresses only — never keys).

## Quick start

```bash
npm install
npm run dev
```

Optional: copy `.env.example` to `.env` and set `VITE_ETHERSCAN_API_KEY` for higher Etherscan V2 rate limits. The app works without a key (free tier + `eth_getLogs` fallback).

### Full stack (SPA + MCP server)

```bash
npm run build
npm start
```

Or during development, run Vite and the Node server separately:

```bash
npm run dev          # SPA on Vite default port
npm run dev:server   # Express + MCP on PORT (default 3000)
```

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Local Vite dev server (SPA only) |
| `npm run dev:server` | Express + MCP with watch |
| `npm start` | Serve `dist/` + MCP (production-style) |
| `npm run build` | Production static bundle in `dist/` |
| `npm run typecheck` | `tsc --noEmit` (app + server) |
| `npm run lint` | oxlint |
| `npm test` | vitest |
| `npm run test:coverage` | vitest with V8 coverage report |
| `npm run preview` | Preview the production SPA build |

## Remote MCP

When `MCP_API_KEY` is set (≥16 chars), the Node server exposes Streamable HTTP MCP at `/mcp` that reuses the same address book + chain-read helpers as the SPA (read-only).

### Tools

| Tool | Purpose |
| --- | --- |
| `list_networks` | Supported networks |
| `list_addresses` | Address book (optional network/role/label filters) |
| `get_balances` | Native + known token balances |
| `get_transfers` | Activity timeline for an address |
| `get_entity` | Cross-network entity wallets (+ optional balances) |
| `summarize_explorer` | Aggregates by network/role |

Resources: `explorer://networks`, `explorer://address-book`, `explorer://address-book/{networkId}`.  
Prompts: `inspect_address`, `compare_entities`.

### Cursor (Bearer)

1. Set `MCP_API_KEY` (16+ chars).
2. Point the MCP connector at `https://<service>/mcp`.
3. Header: `Authorization: Bearer <MCP_API_KEY>`
4. Health: `mcpConfigured: true`

Example `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "settlementos-explorer": {
      "url": "https://<your-host>/mcp",
      "headers": {
        "Authorization": "Bearer ${env:MCP_API_KEY}"
      }
    }
  }
}
```

### Claude.ai / Cursor OAuth

1. Set `MCP_API_KEY`, `MCP_OAUTH_CLIENT_ID`, `MCP_OAUTH_CLIENT_SECRET` (≥16), and `MCP_PUBLIC_URL` (origin only, no `/mcp`).
2. Health should show `mcpConfigured: true` and `mcpOauthConfigured: true`.
3. **Claude.ai (important):** Add custom connector → URL `https://<service>/mcp` → open **Advanced** and paste the **same** `MCP_OAUTH_CLIENT_ID` / `MCP_OAUTH_CLIENT_SECRET` from Render. Do **not** leave Advanced empty — Claude’s automatic DCR path is unreliable for custom connectors; static credentials match the MQ9 setup that works.
4. Click **Connect** — browser should briefly hit `/authorize` and redirect back to Claude.
5. Cursor: Bearer `MCP_API_KEY`, or OAuth with the same static client credentials.

OAuth discovery: `/.well-known/oauth-authorization-server` (includes `/register`), `/.well-known/oauth-protected-resource/mcp`, `/authorize`, `/token`.

## Deploy

Preferred host: **Render** via the Blueprint in `render.yaml` (Node web service — serves the SPA and MCP).

### Render (recommended)

1. In [Render](https://dashboard.render.com): **New → Blueprint**
2. Connect `StephenForte/settlementos-explorer` (branch `main`)
3. Apply the Blueprint — creates a Node web service
4. When prompted, set:
   - optional `VITE_ETHERSCAN_API_KEY`
   - optional `MCP_API_KEY` (enables `/mcp`)
   - optional `MCP_OAUTH_*` + `MCP_PUBLIC_URL` for Claude/Cursor OAuth
5. After deploy, open the `*.onrender.com` URL and check `/api/health`

SPA deep links are served by Express fallback to `index.html`. Auto-deploys on every push to `main`.

Static-only hosts (Vercel `vercel.json`, etc.) still work for the SPA alone — they do **not** serve MCP. Use the Node service for MCP.

CI (GitHub Actions) runs typecheck, lint, tests, and build on every push/PR.

## Updating the address book

After a SettlementOS testnet redeploy:

1. Open SettlementOS `chain/deployments.base-sepolia.json` and `deployments.polygon-amoy.json`.
2. Copy **public addresses only** into `src/config/address-book.ts`.
3. Never copy private keys into this repository.
4. Redeploy this site.

Contract addresses change on redeploy; entity/operator wallets are typically reused.

## Stack

Vite · React · TypeScript · viem · React Flow · Express · MCP SDK · vitest

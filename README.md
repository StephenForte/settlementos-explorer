# SettlementOS Explorer

Independent, third-party view of SettlementOS on-chain activity on **Base Sepolia**, **ForteL2 Sepolia**, and **Polygon Amoy**.

This app reads **only public chain data** (public RPCs + explorer APIs where available). It labels addresses from a bundled address book and deep-links claims to Basescan / Amoy Polygonscan. ForteL2 has no public block explorer yet — tx hashes are shown raw and history comes from RPC logs.

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

ForteL2 defaults to `http://127.0.0.1:9545` (Mac sequencer). Override with `VITE_FORTEL2_SEPOLIA_RPC_URL`, and optionally set `VITE_FORTEL2_SEPOLIA_READ_RPC_URL` to the Render replica for reads.

ForteL2 reads therefore work **on the ForteL2 host** and read `unavailable` elsewhere (D4). Pointing a deployed site at a public replica later is just `VITE_FORTEL2_SEPOLIA_READ_RPC_URL` — no code change, since `clients.ts` already prefers `readRpcUrl` for reads. Three prerequisites that are easy to miss, all in **D32**:

- **`VITE_*` is inlined at build time** — set it on Render and **rebuild**; a restart re-serves the old bundle with the old URL compiled in.
- **The replica must send CORS headers** for the site's origin (op-geth `--http.corsdomain`, `--http.vhosts`). Without them every browser call fails while `curl` from the same box succeeds.
- **The replica should terminate TLS** — a plain `http://` endpoint is mixed content that an HTTPS site's browser blocks. Loopback (`http://127.0.0.1`) is exempt in most browsers; plain-`http` local dev is unaffected.

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

### Claude.ai / ChatGPT / Cursor OAuth

1. Set `MCP_API_KEY`, `MCP_OAUTH_CLIENT_ID`, `MCP_OAUTH_CLIENT_SECRET` (≥16), and `MCP_PUBLIC_URL` (origin only, no `/mcp`).
2. Health should show `mcpConfigured: true` and `mcpOauthConfigured: true` (`mcpOauthDcrEnabled` is `false` by default).
3. **Claude.ai (important):** Add custom connector → URL `https://<service>/mcp` → open **Advanced** and paste the **same** `MCP_OAUTH_CLIENT_ID` / `MCP_OAUTH_CLIENT_SECRET` from Render. Do **not** leave Advanced empty — use static credentials (recommended).
4. Click **Connect** — browser should briefly hit `/authorize` and redirect back to Claude.
5. Cursor: Bearer `MCP_API_KEY`, or OAuth with the same static client credentials.

#### ChatGPT (Developer mode OAuth)

ChatGPT uses Streamable HTTP + OAuth (not a Bearer header field like Cursor).

1. Same env as Claude (`MCP_API_KEY`, `MCP_OAUTH_CLIENT_ID`, `MCP_OAUTH_CLIENT_SECRET`, `MCP_PUBLIC_URL`).
2. In ChatGPT (Plus/Pro/Business/Enterprise/Edu, web):
   - **Settings → Security and login → Developer mode** → on
   - **Settings → Apps & Connectors** (or [chatgpt.com/apps](https://chatgpt.com/apps) / plugins) → create a developer-mode connector
   - **URL:** `https://<service>/mcp`
   - **OAuth Client ID / Secret:** paste the values above
3. Save → authorize. The server allowlists ChatGPT callbacks (`connector_platform_oauth_redirect` and `https://chatgpt.com/connector/oauth/{callback_id}`).
4. In a chat: enable the connector, then call tools (e.g. `list_addresses`, `summarize_explorer`).

OAuth discovery: `/.well-known/oauth-authorization-server`, `/.well-known/oauth-protected-resource/mcp`, `/authorize`, `/token`.

**Dynamic Client Registration** (`/register`) is **disabled by default**. Open DCR + auto-approve would let anyone mint MCP tokens without your static secret. Only set `MCP_OAUTH_ALLOW_DCR=true` if a client truly requires DCR; registrations are still limited to Claude/ChatGPT/Cursor HTTPS redirect URIs (no localhost DCR).

## Deploy

Preferred host: **Render** via the Blueprint in `render.yaml` (Node web service — serves the SPA and MCP).

### Render (recommended)

1. In [Render](https://dashboard.render.com): **New → Blueprint**
2. Connect `StephenForte/settlementos-explorer` (branch `main`)
3. Apply the Blueprint — creates a Node web service
4. When prompted, set:
   - optional `VITE_ETHERSCAN_API_KEY`
   - optional `MCP_API_KEY` (enables `/mcp`)
   - optional `MCP_OAUTH_*` + `MCP_PUBLIC_URL` for Claude/ChatGPT/Cursor OAuth
5. After deploy, open the `*.onrender.com` URL and check `/api/health`

SPA deep links are served by Express fallback to `index.html`. Auto-deploys on every push to `main`.

Static-only hosts (Vercel `vercel.json`, etc.) still work for the SPA alone — they do **not** serve MCP. Use the Node service for MCP.

CI (GitHub Actions) runs typecheck, lint, tests, and build on every push/PR.

## Updating the address book

After a SettlementOS testnet redeploy:

1. Open SettlementOS `chain/deployments.base-sepolia.json`, `deployments.polygon-amoy.json`, and (when present) `deployments.fortel2-sepolia.json`.
2. Copy **public addresses only** into `src/config/address-book.ts`.
3. Never copy private keys into this repository.
4. Redeploy this site.

Contract addresses change on redeploy; entity/operator wallets are typically reused. ForteL2 address-book rows stay empty until SettlementOS completes its first deploy on chain 852.

## Stack

Vite · React · TypeScript · viem · React Flow · Express · MCP SDK · vitest

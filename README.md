# SettlementOS Explorer

Independent, third-party view of SettlementOS on-chain activity on **Base Sepolia** and **Polygon Amoy**.

This app reads **only public chain data** (public RPCs + explorer APIs). It labels addresses from a bundled address book and deep-links every claim to Basescan / Amoy Polygonscan.

## What this repo does **not** contain

- **No private keys**
- **No SettlementOS API keys or database access**
- **No backend / database**
- **No wallet connection or write operations**

Address book values are public on-chain addresses copied from SettlementOS `chain/deployments.<network>.json` (addresses only — never keys).

## Quick start

```bash
npm install
npm run dev
```

Optional: copy `.env.example` to `.env` and set `VITE_ETHERSCAN_API_KEY` for higher Etherscan V2 rate limits. The app works without a key (free tier + `eth_getLogs` fallback).

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Local Vite dev server |
| `npm run build` | Production static bundle in `dist/` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | oxlint |
| `npm test` | vitest |
| `npm run preview` | Preview the production build |

## Deploy

Static SPA (no server). Preferred host: **Render** via the Blueprint in `render.yaml`.

### Render (recommended)

1. In [Render](https://dashboard.render.com): **New → Blueprint**
2. Connect `StephenForte/settlementos-explorer` (branch `main`)
3. Apply the Blueprint — creates a free static site
4. When prompted, optionally set `VITE_ETHERSCAN_API_KEY` (same key as local `.env`)
5. After deploy, open the `*.onrender.com` URL

SPA deep links are covered by the Blueprint rewrite to `index.html`. Auto-deploys on every push to `main`.

Also works on Vercel (`vercel.json`) or any static host of `dist/`:

```bash
npm run build
# deploy contents of dist/
```

CI (GitHub Actions) runs typecheck, lint, tests, and build on every push/PR.

## Updating the address book

After a SettlementOS testnet redeploy:

1. Open SettlementOS `chain/deployments.base-sepolia.json` and `deployments.polygon-amoy.json`.
2. Copy **public addresses only** into `src/config/address-book.ts`.
3. Never copy private keys into this repository.
4. Redeploy this site.

Contract addresses change on redeploy; entity/operator wallets are typically reused.

## Stack

Vite · React · TypeScript · viem · React Flow · vitest

# PRD — ForteL2 transaction and block viewer

**Status:** proposed, not dispatched · **Author:** planner · **Date:** 2026-08-13
**Tasks:** `F6u` (transaction page), `F6v` (block page)
**Pre-assigned decisions:** `D33` (required), `D34` (optional)

Companion docs: [`PLAN.md`](PLAN.md) §2 file ownership, §3 commit contract, §6 traps ·
[`DECISIONS.md`](DECISIONS.md) D4, D13, D16, D27, D30, D31, D32.

---

## 1. Is it possible? Yes — and with no new infrastructure

Everything the page needs is already reachable through the RPC client this repo
ships. Four standard JSON-RPC methods carry the entire feature:

| Method | viem call | Supplies |
|---|---|---|
| `eth_getTransactionByHash` | `client.getTransaction` | from, to, value, nonce, input, gas, gas price, block number, tx index, type |
| `eth_getTransactionReceipt` | `client.getTransactionReceipt` | status, gasUsed, effectiveGasPrice, logs, contractAddress |
| `eth_getBlockByNumber` | `client.getBlock` | timestamp, hash, parentHash, gasUsed/gasLimit, baseFeePerGas, tx list |
| `eth_blockNumber` | `client.getBlockNumber` | head, for confirmation count |

No indexer, no Etherscan key, no `eth_getLogs` window scanning — so **none of the
`getLogs` fragility that D27 and D30 exist to manage applies to this feature.** A
transaction lookup is a point read by hash; it either resolves or it doesn't.

There is also a genuine advantage over Basescan here rather than mere parity. The
repo already holds the address book (`labelForAddress`, `RoleBadge`) and the
SettlementOS ABIs (`erc20Abi`, `paymentSettlementEventsAbi` in
[abis.ts](src/config/abis.ts)). Decoding a receipt's logs against those turns an
opaque hash into *"PaymentSettled · pay_4bf481cdc9ea · 100,000.00 mockUSDC · ACME
US Inc → Tokyo Trading KK"* — which Basescan cannot render for Base either,
because it does not know these labels. **The ForteL2 gap is the reason to build
it; the labelled decode is the reason it is worth more than a fallback.**

### Reach: localhost now, public replica later, no code change either way

ForteL2's default RPC is `http://127.0.0.1:9545` — the Mac sequencer (D4). **On
the ForteL2 host this feature works today with nothing configured**, and that is
the accepted near-term mode. A public visitor to a deployed site gets
`unavailable` until a reachable endpoint exists, which is a deployment fact, not
a code gap.

Pointing it at a future public replica is one env var —
`VITE_FORTEL2_SEPOLIA_READ_RPC_URL`. [clients.ts](src/lib/clients.ts) already
puts `readRpcUrl` **first** in the ForteL2 URL list and the sequencer last, so
reads prefer the replica automatically. Nothing in this PRD changes when that
day comes. Three things that are not obvious:

- **It is build-time, not runtime.** Vite inlines `import.meta.env` into the
  bundle, so setting the var on Render requires a **rebuild and redeploy** —
  restarting the Node service serves the old bundle with the old URL baked in.
- **The replica must send CORS headers.** The browser reads these responses
  directly; without `Access-Control-Allow-Origin` for the site's origin
  (op-geth: `--http.corsdomain`, plus `--http.vhosts`), every call fails in the
  browser while `curl` from the same box succeeds. That mismatch is the classic
  half-day of debugging.
- **The replica should be HTTPS.** A deployed site is served over TLS, and a
  plain `http://` endpoint is active mixed content that the browser blocks. No
  code here can override that — `validateRpcOverrideUrl` accepts `http:`, but
  the browser still refuses the request. (`http://127.0.0.1` is the special
  case: most browsers treat loopback as trustworthy, Safari less so — which is
  why local dev over plain `http://localhost` has no issue at all.)

Until then, `RpcOverrideForm` (D16) gives any visitor with their own endpoint a
runtime path in — per-visitor localStorage, no rebuild.

---

## 2. The job

SettlementOS renders an escrow-tx cell per payment. On Base it links to
Basescan. On ForteL2 it renders a bare hash, because chain 852 has no public
explorer. **Give SettlementOS a URL it can build the same way for ForteL2, that
resolves to a page a finance or ops reader can act on.**

Success is a single-line change on the SettlementOS side: swap the base URL per
corridor and keep the `/tx/<hash>` suffix.

---

## 3. Scope

### In

- Transaction detail page — status, block, time, from/to with labels, value, L2
  fee, gas, nonce, decoded ERC-20 and escrow events, raw input behind a toggle.
- Block detail page — header fields plus the block's transaction list.
- URL contract stable enough for SettlementOS to hardcode (§4).
- Internal tx links wherever this app currently renders a raw ForteL2 hash.

### Out — deliberately, and each for a reason

| Not building | Why |
|---|---|
| Internal traces / call tree | Needs `debug_traceTransaction`; not exposed on public endpoints, and not what a settlement reader asks. |
| OP-stack L1 data fee (`l1Fee`, `l1GasUsed`) | Requires `viem/op-stack` `chainConfig` formatters on the ForteL2 chain definition. See §6 — the displayed fee is labelled to match what we actually read. |
| Contract source, verification, ABI upload | An explorer feature, not a settlement-viewer feature. Months of scope. |
| USD/fiat pricing of amounts | Testnet mock tokens. A price would be fiction. |
| Address search box / global search | The URL *is* the entry point. Revisit only if humans start browsing rather than following links. |
| Pending-tx mempool view, block list / "latest blocks" feed | Narrow scope. Single-object lookup only. |
| Decoding logs from contracts outside the address book | Shown as raw topics + data. We decode what we have ABIs for and do not guess. |
| MCP `get_transaction` tool | Real parity gap, but a separate surface with its own auth tests. Candidate `F6w`. |
| Changes to `address-book.chain.test.ts` | PLAN §4 names it a serialization point. This feature needs nothing from it. |

---

## 4. URL contract — the interop surface

This is the part SettlementOS depends on, so it is specified before the UI.

### Canonical

```
/{networkId}/tx/{txHash}
/{networkId}/block/{blockNumberOrHash}
```

Example: `/fortel2-sepolia/tx/0x28feca98…3f36c25e`

This matches the route family already in [App.tsx](src/App.tsx)
(`/:networkId/address/:address`) and needs no new resolution logic.

### Basescan-shaped alias

```
/tx/{txHash}?network=fortel2-sepolia
/tx/{txHash}?chainId=852
/tx/{txHash}                              → defaults to fortel2-sepolia
```

[`useNetworkParam`](src/hooks/useNetworkParam.ts) already falls back to a
`?network=` search param, so the slug form is nearly free. Accepting `chainId`
costs one lookup over `NETWORKS` and is what SettlementOS naturally has on hand.

**The bare `/tx/<hash>` default is the one real design fork → `D33`.** The
recommendation is to default to `fortel2-sepolia` rather than the app-wide
`base-sepolia` default, on this reasoning: Base and Amoy have public explorers,
so a link *into this app* with no network stated is, by construction, a link for
the chain that has nowhere else to go. The alternative — reject a bare `/tx/`
with an explicit "network required" error — is defensible and safer against a
future fourth network, and the worker may choose it. Either way, **write D33**;
this must not be left as an accident of routing.

Aliases resolve by `<Navigate replace>` to the canonical path, so the address
bar, sharing, and back-button behaviour all settle on one form.

### Guarantees to SettlementOS

- Path shape is stable; treat it as an integration contract, not an internal route.
- `txHash` is matched case-insensitively and normalised to lowercase.
- A malformed hash renders an invalid-input page and **never reaches the RPC**.
- Deep links already survive a hard refresh — [`server/app.ts`](server/app.ts)
  falls through to `index.html` for any non-API path.

---

## 5. Transaction page — fields

Header: network eyebrow, `Transaction` title, full hash in `.mono` with
`CopyButton`, and `View on {explorerName} ↗` when the network has one.

| Field | Source | Notes |
|---|---|---|
| Status | `receipt.status` | `Success` / `Failed`; `Pending` when the tx resolves with `blockNumber: null`. |
| Block | `tx.blockNumber` | Links to `/{networkId}/block/{n}` (F6v). |
| Confirmations | `head - blockNumber + 1` | One `eth_blockNumber`. |
| Timestamp | `block.timestamp` | `formatTimestamp` + relative age. |
| From | `tx.from` | `labelForAddress` + `RoleBadge`, links to the address page. |
| To | `tx.to` | Same. `null` ⇒ contract creation; show `receipt.contractAddress`. |
| Value | `tx.value` | `formatNative`, suffixed with `nativeSymbol`. |
| **L2 execution fee** | `receipt.gasUsed × receipt.effectiveGasPrice` | **Label it exactly this.** On an OP-stack chain this excludes the L1 data fee, so calling it "Transaction fee" would publish a number that is quietly wrong. PLAN §6 trap 6 — state the unit. |
| Gas used / limit | `receipt.gasUsed`, `tx.gas` | With percentage. |
| Gas price | `receipt.effectiveGasPrice` | In gwei. |
| Nonce · Index · Type | `tx.nonce`, `tx.transactionIndex`, `tx.type` | One compact row. |
| Input data | `tx.input` | Default: 4-byte selector + byte length. Full hex behind a toggle, `CopyButton`. `0x` ⇒ "None (plain transfer)". |

### Decoded events

Run `receipt.logs` through `decodeEventLog` against `erc20Abi` and
`paymentSettlementEventsAbi`, mirroring how
[transfers.ts](src/chain/transfers.ts) already does it — including its
`try/catch` skip on undecodable logs.

- **ERC-20 `Transfer`** — from/to with labels and address links; amount via
  `lookupToken` + `formatTokenAmount`. Token not in the address book ⇒ show the
  raw integer and the token address, never a guessed decimal scaling.
- **`PaymentInitiated` / `PaymentSettled` / `PaymentRefunded`** — paymentId,
  labelled counterparties, currency pair, amount. Reuse the detail strings
  already composed in `fetchEscrowEvents`; do not invent a second phrasing.
  `PaymentSettled.settledAmount` stays raw, consistent with today's table — its
  `destinationAsset` is a currency string, not a token with known decimals.
- **Anything else** — address, topic0, and data, in mono. Labelled "Not decoded".

Render with the existing `.data-table` / `.panel` / `.section` vocabulary. The
`Escrow` variant of `.dir` already exists for the badge.

---

## 6. Block page — fields

| Field | Source |
|---|---|
| Number, hash, parent hash | `block.*`; parent links to the previous block |
| Timestamp + age | `block.timestamp` |
| Transactions | `block.transactions.length`, each linking to its tx page |
| Gas used / limit | `block.gasUsed`, `block.gasLimit` (+ %) |
| Base fee | `block.baseFeePerGas` |
| Fee recipient | `block.miner`, labelled through the address book |
| Prev / Next | `n-1` / `n+1`, next disabled at head |

Fetch with `getBlock({ includeTransactions: true })` — one call yields the
header *and* enough per-tx data (hash, from, to, value) to render the list
without N extra reads. Accept both a decimal number and a `0x…` block hash in
the route param.

---

## 7. States

Every state below is reachable on ForteL2 today and each needs a distinct
rendering. Collapsing them into one "failed" banner is the failure mode to avoid.

| State | Trigger | Render |
|---|---|---|
| Invalid hash | not 66 chars / not hex | `StatusBanner tone="error"`, no RPC call issued |
| Loading | in flight | existing `.muted` loading line |
| Found, mined | tx + receipt | full page |
| Found, pending | `tx.blockNumber === null`; receipt lookup throws `TransactionReceiptNotFoundError` | header + `Pending` banner; suppress fee/status/confirmations rather than showing zeros |
| Not found | viem `TransactionNotFoundError` | `tone="warn"`: not on this network — may be pending, on another corridor, or beyond this node's history. Offer the other two networks' links for the same hash. **Not** an error banner; it is a valid answer. |
| RPC unreachable | transport error | `tone="error"` + `RpcOverrideForm defaultOpen`, exactly as [AddressDetailPage.tsx:117](src/pages/AddressDetailPage.tsx#L117) does |

**Not-found and RPC-down must not share a branch.** That distinction is the same
one D13 draws between a reachable-but-wrong endpoint and a transport failure, and
for the same reason: one is an answer about the chain, the other is an answer
about the connection, and a reader who confuses them draws the wrong conclusion
about their payment.

---

## 8. Wiring the links up

A viewer nothing links to is half a feature. Today
[TransferTable.tsx](src/components/TransferTable.tsx) renders tx hashes through
`ExplorerLink`, which degrades to plain text when `explorerUrl` is null — the
exact ForteL2 dead end in the screenshot.

Add `src/components/TxLink.tsx`: external explorer link when the network has one,
internal `<Link to={/{networkId}/tx/{hash}}>` otherwise. Swap it into
`TransferTable`'s three call sites. Props are unchanged, so
`AddressDetailPage`, `EntityPage` and `RelationshipGraph` need no edits — but
**they are listed in the F6u allowlist anyway**, per the F6j lesson in PLAN §2.

Leave `ExplorerLink` untouched; address and token links still want it.

**Precedence is a judgement call — optional `D34`.** The recommendation is
external-wins: a Base reader wants Basescan's traces and verified source, and our
page cannot compete there. The internal view stays reachable by direct URL on
every network, which also makes it testable against Base Sepolia instead of only
against a host-local sequencer. If the worker finds no fork worth recording,
retire D34 unused — PLAN §1 is explicit that this is the pre-assignment rule
working, not waste.

---

## 9. Non-functional

- **Caching** — `cached()` from [cache.ts](src/lib/cache.ts) at the default 30s
  TTL, keyed `tx:{networkId}:{hash}` / `block:{networkId}:{id}`. Do not invent a
  new TTL and do not modify `cache.ts` (PLAN §2: F6n owns it, do not modify).
  Confirmations therefore refresh at 30s granularity — acceptable, and worth one
  line in the handback rather than a mechanism.
- **Reads per page** — 4 RPC calls for a tx, 2 for a block. No fan-out, so none
  of the D14 rate-limit exposure that the balance grid has.
- **Design** — reuse existing classes. Any new CSS goes in `src/index.css`
  `:root`-adjacent blocks and **serializes against every other design task**
  (PLAN §4 hot zone). Target: one new class block or none.
- **A11y** — the `--mute` AA fix (D7) and role-badge contrast (D6) already hold;
  new labels inherit them. Tx hashes get `overflow-wrap` via the existing
  `.break`.
- **No new dependencies.** viem, react-router, and the ABIs already in the repo
  cover all of it.

---

## 10. Task breakdown

### F6u — transaction detail page

**Files (allowlist):**
`src/chain/transaction.ts` (new) · `src/chain/transaction.test.ts` (new) ·
`src/pages/TransactionPage.tsx` (new) · `src/pages/TransactionPage.test.tsx`
(new) · `src/components/TxLink.tsx` (new) ·
`src/components/TransferTable.tsx` + `.test.tsx` · `src/App.tsx` ·
`src/index.css` (minimal) · `docs/DECISIONS.md` (append D33, and D34 or its
retirement).

**Must not touch:** `src/lib/cache.ts`, `src/config/address-book.ts`,
`src/config/address-book.chain.test.ts`, `src/pages/OverviewPage.tsx`,
`package.json` / `package-lock.json`, `docs/PLAN.md`.

**Acceptance — measurements, not adjectives:**

1. `/fortel2-sepolia/tx/<hash>` renders every §5 field for a real chain-852
   escrow settlement, run on the ForteL2 host. Quote the hash and the rendered
   status, block, fee and decoded event names.
2. The same page renders against Base Sepolia for a known escrow tx — proving
   the path is not host-only.
3. All six §7 states demonstrated: invalid hash, loading, mined, pending, not
   found, RPC unreachable. Not-found and RPC-down produce visibly different
   banners; say which.
4. The fee row reads `L2 execution fee` and its value equals
   `gasUsed × effectiveGasPrice` computed independently.
5. Aliases `/tx/<hash>?network=fortel2-sepolia`, `?chainId=852`, and bare
   `/tx/<hash>` all land on the canonical path (or bare is explicitly rejected
   per D33 — state which was chosen and why).
6. A ForteL2 row in `TransferTable` is now a working internal link; a Base row
   still points at Basescan.
7. A malformed hash issues **zero** RPC calls — assert on a mocked transport's
   call count, not on the rendered output.
8. Gate green: `npm run typecheck && npm run lint && npm test && npm run build`.
   Report the test count before → after; **do not quote PLAN §0's number, it is
   stale.**
9. Cite one mutation that turns a new test red, and re-run it. PLAN §6 trap 13 —
   a `setState` pair in one handler and a no-op state write both prove nothing.

### F6v — block detail page

Depends on F6u (shares `App.tsx` and `src/index.css`; **do not run in
parallel**). Same contract, scoped to §6. Acceptance: header fields against a
live chain-852 block, the tx list links resolve to F6u pages, prev/next
navigate, next is disabled at head, and a block number past the head renders the
not-found state rather than an error.

### Identifiers

`F6u` is the next free task ID per PLAN §1. `F6v` follows it. `D33` is the next
free decision ID after D32. Assign from here — PLAN §1: do not grep for
the highest and add one.

---

## 11. Open questions

1. **Public reach is deferred, not blocking.** Accepted: this runs against the
   local sequencer for now. A future replica is one env var plus a rebuild, with
   CORS and TLS as its own prerequisites (§1). Nothing in F6u/F6v needs to change
   when that lands — which is the point of keeping the endpoint in `NETWORKS`
   rather than in the pages.
2. **How far back will a replica retain state?** If it is pruned, older
   settlement links resolve to not-found — which the §7 copy should then say
   plainly rather than implying the payment never happened.
3. **Does SettlementOS want the alias or the canonical form?** The canonical form
   is one string concat either way; the alias exists only if SettlementOS prefers
   a single base URL across corridors.
4. **MCP `get_transaction` (F6w)** — worth it once the page exists, so an agent
   can answer "what happened in this tx" without scraping HTML.

---

## 12. Follow-ups, not in this PRD

Payment-centric view (`/payment/<paymentId>` stitching Initiated → Settled across
txs), unknown-ABI log decoding via a 4byte-style lookup, and a search box. Each
is a real feature; none is needed for SettlementOS to stop rendering a dead hash.

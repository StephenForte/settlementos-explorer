# SettlementOS Explorer — worker-ready plan

This repo is **F6** in the settlementos ForteL2 workstream
([`tasks/fortel2-worker-plan.md`](https://github.com/StephenForte/settlementos/blob/main/tasks/fortel2-worker-plan.md)
§0 tracks it as *"Partially done, out of repo"*). F6 sub-tasks are numbered
`F6a`, `F6b`, … here. Conventions mirror the settlementos worker plan
deliberately — same commit-and-merge contract, same decisions-log discipline —
so an agent moving between the two repos doesn't have to relearn the rules.

Companion doc: [`DECISIONS.md`](DECISIONS.md). Read it before starting any task.

---

## 0. Verified state (read this before assigning anything)

Everything below was re-checked against the repo on **2026-08-09** from a fresh
clone, not carried over from a status report. Where a claim was verified, the
method is named — "verified" without a method is how plans start lying.

| Item | State | Evidence |
|---|---|---|
| `main` | `330fa1a` | after #51. A docs PR cannot record its own merge SHA, so this cell is stale by one commit every time it closes out a docs PR. Re-read `origin/main` rather than trusting it. |
| Test suite | **206 total, 30 files** — healthy is `206 passed / 0 skipped` or `205 / 1` (Amoy, trap 9) on the ForteL2 host; `205 passed / 1 skipped` (ForteL2) in CI | re-measured 2026-08-14 on `777bef1` (#51's head) by the reviewer in an **isolated clone**: `206/0`, Amoy live. CI green incl. Bugbot (0 findings) on the same commit |
| `npm audit` | **`found 0 vulnerabilities`** | re-run by the reviewer on `pr38` in an isolated clone after `npm ci` (exit 0). Cleared by F6q — see **D25** |
| Gate | typecheck ✅ lint ✅ build ✅ | all re-run locally, not inherited from CI |
| `fortel2-sepolia` network registry | **True** | `src/config/networks.ts` on main, predates F6a |
| F6a — ForteL2 address book | **Done** | #4 → `20f17ff`; 11 addresses, `mmf-contract` role |
| F6b — design system | **Done** | #6 → `223d452`; tokens in `src/index.css`, `docs/DESIGN.md` |
| F6c — chain-852 liveness check | **Verified 2026-08-08** | **all 11 rows** confirmed — 6 on chain 852, 5 against the deploy manifest. Issue #8 |
| F6f — entity wallet ownership | **Closed 2026-08-08** | `chain/deployments.fortel2-sepolia.json` matches all 4 entities + treasury. Issue #11 |
| F6d — drop dead `--ash` token | **Done** | #12 → `c112874`; token-set and value diff vs `main` — 2 removals, 0 additions, every surviving token byte-identical |
| F6c-test — chain-852 liveness test | **Done** | #13 → `d03bff9`; proved it fails on a consistently-corrupted address that the `EXPECTED` map accepts |
| F6g — broken RPC fails, not skips | **Done** | #15 → `7673572`; end-to-end: error object / HTTP 500 / bad result / wrong chain all fail, closed port skips. D13 |
| F6h — Base + Amoy liveness | **Done** | #18 → `d251569`; Base **runs in CI** (1490ms of real `eth_getCode`) and fails on injected drift. Amoy skips — its `rpcUrl` is dead (#17). D14 |
| F6k — D13/D14 posture guards | **Done** | #20 → `0e891c3`; all three mutations re-run by the reviewer and each turns its guard red |
| F6l — D14 past the probe + timeout budget | **Done** | #22 → `db3bd92`; mid-run 429/-32005 skip, HTTP 500 and drift still fail; widening the catch turns 4 tests red |
| F6i — replace dead Amoy rpcUrl | **Done** | #24 → `e5b5e13`; dRPC. Amoy block flipped skip → pass **without touching the test file**, 10 rows live. D15 |
| F6j — user-configurable RPC | **Done** | #27 → `b58b165`; override layers **above** `NETWORKS` so the liveness suite still verifies what ships. Invalidation mutation re-run by the reviewer: dropping `invalidatePublicClient` turns the no-reload test red. D16 |
| F6n — superseded-epoch cache guard | **Done** | #28 → `62b9548`; reviewer reverted `cache.ts` to `main` keeping the new tests and **both** epoch tests went red, incl. the `inflight.delete` case no bot reported. Purely additive test file (zero deletions) |
| F6o — Overview RPC override + reload | **Done** | #31 → `651e7d4`; reviewer re-ran four mutations — dropping the reload token from the dep array turns 3 tests red, adding `query` turns 1 red, a genuine two-tick double refresh turns 2 red, and an unstable object dep dies on heap exhaustion rather than passing quietly. The PR's own claimed mutation was vacuous (§6 trap 13) |
| F6p — sticky Overview override control | **Done** | #33 → `e1ab6d7`; the worker's own mutation re-run by the reviewer and it genuinely goes red. Two further probes: no control leak from the previous network *during* the next one's load (the window their test skipped), and the render-time latch is stable under `StrictMode` across a broken→healthy→broken→healthy round trip, 0 re-render errors |
| F6q — clear GHSA-frvp-7c67-39w9 | **Done** | #38 → `ed4dbee`; `npm audit` 2 moderate → **0**. Reviewer re-proved the override is load-bearing: from `main`'s lockfile, bumping the SDK **alone** leaves `@hono/node-server` at `1.19.14` and the advisory survives. MCP server booted and `tools/list` + 2 tool calls exercised over hono 2.1.0; auth boundary re-probed 401/401/200 |
| F6m — Patchhog findings unreadable | **Closed 2026-08-09** | resolved at source: Patchhog reports `Clean scan: **0 findings**` on `e2af36b` — nothing left to read. D26 |
| All four scanners on `main` | **Green, and read rather than assumed** | `patchhog/security` `success — Clean scan: 0 findings`; Semgrep `Findings: 0 (0 blocking)`; Trivy `success`; `check` `success`. Semgrep/Trivy ran on `9c66892` (#39's head, the commit that merged) |
| CI action pinning | **Done** | #5 → `3ff4592`; Semgrep reports `Findings: 0` |
| `--mute` AA fix | **Done** | #7 → `ef4991b`; re-measured 4.90 canvas / 4.55 surface-soft |

### Address provenance — how the 11 ForteL2 rows were actually confirmed

The F6a test suite compares a hardcoded `EXPECTED` map against
`address-book.ts`. Both live in the same commit, so **that check is a
tautology** — it proves internal consistency, not correctness. The addresses
were instead confirmed out-of-band during review of #4:

- **PaymentSettlement, mockUSDC, mockJPY, mockSGD** — derived as CREATE
  addresses from deployer `0x5128889F…652d` at **nonces 5, 6, 7, 8**
  (consecutive), and confirmed to hold bytecode on Base Sepolia via
  `eth_getCode`.
- **TokenizedMMF `0xaed29387…ffe7ff`** — deployer nonce **20**; confirmed by
  settlementos PR #40, which records the live 852 session of 2026-08-07 where
  the MMF add-on path deployed it. The nonce gap is explained by the add-on
  reusing the existing escrow and tokens rather than redeploying.

> **Units correction (2026-08-08).** This section previously recorded "mockUSDC
> 3623 bytes, PaymentSettlement 8543 bytes". Those were `eth_getCode`
> **hex-string lengths, mislabeled as bytes, and off by one** — the true values
> are 3622 and 8542 hex chars, i.e. **1810 and 4270 bytes**. The substance of
> the claim (both hold bytecode) is unaffected, but anyone re-running the check
> and reading 1810/4270 would reasonably conclude the contracts differed. They
> do not.

### Chain-852 liveness — verified 2026-08-08 (F6c)

Run from a fresh clone **on the ForteL2 host** against the local sequencer at
`http://127.0.0.1:9545`. Node was at the chain tip, not replaying history:
`eth_syncing: false`, head block **762584**, head timestamp lag **1s**, cadence
**2.00s/block**. `eth_chainId` = `0x354` = **852**. Method: `eth_getCode`,
`eth_getBalance` and `eth_getTransactionCount` per row.

| Row | Role | Result |
|---|---|---|
| PaymentSettlement | escrow-contract | bytecode, 4270 B |
| TokenizedMMF | mmf-contract | bytecode, 2888 B |
| mockUSDC / mockJPY / mockSGD | token-contract | bytecode, 1810 B each |
| Operator | operator | no bytecode, nonce 29 |
| Treasury | treasury | no bytecode, nonce 2 |
| ACME US Inc | entity | no bytecode, nonce 3 |
| Tokyo Trading KK | entity | no bytecode, nonce 0, 0.0002 ETH |
| Singapore Imports Pte Ltd | entity | no bytecode, nonce 0, 0.0002 ETH |
| Osaka Parts Co | entity | no bytecode, nonce 0, 0.0002 ETH |

**What the chain query established.** Eight rows outright: the five contracts
hold bytecode, and Operator / Treasury / ACME are EOAs that have transacted on
852. Tokyo, Singapore and Osaka were EOAs with identical 0.0002 ETH and **nonce
0** — deliberately funded, but with nothing on-chain tying them to those
companies.

**What closed the remaining gap (F6f, 2026-08-08).** No chain query could — the
answer is off-chain. `scripts/deploy-testnet.mjs` in settlementos generates each
entity wallet with `generatePrivateKey()` (random, therefore **not
re-derivable**) and persists the `externalId → address` mapping to
`chain/deployments.<network>.json`. That file is gitignored *because it holds the
private keys*, so it never reaches the repo and lives only on the deploying host.
Read on the ForteL2 Mac, **all four entity wallets and the treasury matched the
address book exactly**. The 0.0002 ETH figure is corroborated independently: the
script sets `entityGasTarget: parseEther("0.0002")`.

That file is the *origin* of the mapping, not a copy of the address book, so this
is genuine out-of-band confirmation rather than a second tautology. It also
**cannot be automated** — the same private keys that make it authoritative make it
un-committable. See **D12**.

Five of the eleven rows (escrow, three tokens, operator) are **inherited
constants** shared with Base Sepolia and Polygon Amoy, not ForteL2-specific
data. They are correct today only because the 2026-08-07 deploy took the
add-on path. A full redeploy replaces them, and the verification above expires
with it — which is precisely why F6c-test encodes it as a runnable check rather
than a paragraph.

---

## 1. Task tree

```
F6a  address book + mmf-contract role     ✅ merged #4
F6b  design system (docs/DESIGN.md)       ✅ merged #6
 └── F6b-fix  --mute AA contrast          ✅ merged #7
F6c  chain-852 liveness check             ✅ verified 2026-08-08 — issue #8
 └── F6c-test  encode as opt-in test      ✅ merged #13
F6d  drop dead --ash token                ✅ merged #12
F6f  entity wallet ownership gap          ✅ closed 2026-08-08 — issue #11
F6g  broken RPC fails, not skips          ✅ merged #15 (D13)
F6h  Base + Amoy liveness                 ✅ merged #18 (D14)
F6i  replace dead Amoy rpcUrl             ✅ merged #24 (D15)
F6j  user-configurable RPC on failure     ✅ merged #27 (D16) — closed issue #17
F6k  make the D13 guard test real         ✅ merged #20
F6l  D14 availability past the probe       ✅ merged #22
F6m  Patchhog findings are unreadable     ✅ closed 2026-08-09 — D26; resolved, not abandoned
F6n  cache write from a superseded epoch  ✅ merged #28 — D18 retired unused
F6o  Overview RPC dead-end                ✅ merged #31 — D19 retired unused
F6p  override control unmounts mid-reload ✅ merged #33 — D22 retired unused
F6q  clear GHSA-frvp-7c67-39w9          ✅ merged #38 (D25)
F6r  eth_getLogs capability liveness    ✅ merged #41 (D27)
F6s  partial token getLogs must survive ✅ merged #41 — D29 retired unused
F6t  signal within-window getLogs loss  ✅ merged #43 (D30)
F6u  ForteL2 transaction detail page    ✅ merged #49 (D33, D34)
F6v  ForteL2 block detail page          ✅ merged #51 — D35 retired unused
F6w  MCP get_transaction tool           📋 dispatch-ready (D36 opt)

F6e  RETIRED — never dispatched, do not reuse
```

**Next free identifier: `F6x`.** `F6w` is **taken** (dispatch-ready). `F6u` and `F6v` are merged — they were specced in
[`TX-VIEWER-PRD.md`](TX-VIEWER-PRD.md) but not yet dispatched, which is exactly
the state the pre-assignment rule exists to protect. Assign from here; do not
grep for the highest and add one. Parallel workers that each derive their own ID
collide, and a collision is harder to detect than an impossible number.

**F6v verification record (2026-08-14).** Merged as #51 (`330fa1a`, one commit, purely
additive — 1174+/0−). Reviewer: gate re-run in an isolated clone (`206/0`, Amoy live),
the cited `block-full:` → `block:` mutation re-applied (**3 tests red**, exactly the ones
the handoff named), and live probes through the real code path — the navigation-order
flow (tx page primes the header-only cache, block page still gets full tx objects),
hash-param ≡ number-param, past-head → `not_found` on a live endpoint, head boundary
within 2 blocks at fetch time. D35 retired with both non-forks named — the sixth optional
identifier burned correctly. The F6u interim wart (dead block links) is closed.

**F6u verification record (2026-08-14).** Merged as #49 (`90fb57f`, two commits). The
reviewer did not inherit the worker's greens: gate re-run twice in an isolated clone
(`183/1`, then `184/0` when Amoy answered), the cited malformed-hash mutation re-applied
and observed red with the exact quoted error (transport count 0→1), and the real
`getTransactionDetail` probed against live chain 852 with no mocks — block 979595,
`49387 × 1000251 = 49399396137` wei, `PaymentInitiated` decoding to *ACME US Inc → Tokyo
Trading KK · USD → JPY*, plus an adversarial ghost-hash probe returning `not_found`
rather than a transport error. D33 and D34 were written with the pre-assigned numbers;
next free decision identifier: **`D35`** (pre-assigned optional to F6v). The one interim
wart: mined-tx block numbers link to `/{networkId}/block/{n}`, which dead-ends on the
catch-all until F6v lands — specified in the PRD, disclosed in the handoff, closed by F6v.

**`F6w` is the likely MCP `get_transaction` tool** — a real parity gap once F6u
lands, listed as a follow-up in the PRD rather than folded into it, because the
MCP surface carries its own auth and rate-limit tests.

**`D28` and `D29` are retired, not free.** Pre-assigned to F6r / F6s and correctly
declined. Burned rather than recycled. **`D30`** is used by F6t for the within-window
loss threshold.

**`D22` is retired, not free.** Pre-assigned to F6p as optional. F6p hit no design fork —
a session-local boolean latched during render, reset on `networkId` change — so the worker
correctly wrote no entry. Burned rather than recycled. **Three consecutive optional
decision identifiers have now retired unused (`D18`, `D19`, `D22`).** That is not waste;
it is the pre-assignment rule working. An optional identifier costs one line in a dispatch
and removes the chance of two parallel workers claiming the same number. Keep pre-assigning
them, and keep retiring them.

**`D19` is retired, not free.** It was pre-assigned to F6o as optional and published in
that dispatch and in this plan. F6o used the mechanism the dispatch specified — a
primitive reload token bumped from `onChanged` — so there was no design fork worth an
entry, and the worker correctly wrote none. Burned rather than recycled, exactly as `D18`
and `F6e` were.

**`D18` is retired, not free.** It was pre-assigned to F6n and published in that
dispatch and in this plan. F6n correctly declined it — a global epoch counter was the
mechanism the dispatch specified, so there was no design fork worth an entry. Because the
identifier was already published, it is burned rather than recycled, exactly as `F6e` was.

**`F6e` is retired, not free.** It was briefly assigned to the chain-852 test
before that work was renumbered `F6c-test` to sit under the issue it closes
(#8), matching the `F6b-fix` pattern. The identifier was already published in
D11 and PR #10 by then, so it is burned rather than recycled — reusing it would
make two different tasks share a name across the git history, which is exactly
the collision the pre-assignment rule exists to prevent.

**F6f is deliberately not dispatchable.** Ownership of the three zero-nonce
entity wallets cannot be settled by any chain query — F6c couldn't, and
F6c-test can't, since a green F6c-test run is fully compatible with all three
addresses being wrong. It needs an out-of-band artifact from settlementos
(deploy manifest or funding-script records). It is tracked so it is not mistaken
for verified, and left undispatched so it is not mistaken for actionable.

**F6d and F6c-test may run in parallel** — no file overlap (`src/index.css` vs
a new test file). F6c-test must run **on the ForteL2 host**; anywhere else only
its skip path is reachable, so a worker off-host cannot demonstrate the test
ever ran.

---

## 2. File ownership

Ownership is what keeps parallel agents from colliding. State it per task.

| Area | Owner | Notes |
|---|---|---|
| `src/config/address-book.ts` | address-book tasks | contains the only address data |
| `src/index.css` | design tasks | **all** hex lives here; components use `var(--*)` |
| `docs/DESIGN.md` | design tasks | the spec as applied |
| `docs/PLAN.md`, `docs/DECISIONS.md` | **planner only** | workers never edit these |
| `server/mcp/server.ts` `ROLES` | whoever adds a role | append-only enum |
| `.github/workflows/**` | CI tasks | actions pinned to SHAs — keep them pinned |
| `src/lib/rpc-overrides.ts`, `src/lib/clients.ts` | RPC-resolution tasks | override precedence + client cache; **must stay above `NETWORKS`** (D16) |
| `src/lib/cache.ts` | F6n (landed) | epoch guard — **do not modify**; correct and freshly reviewed |
| `src/pages/OverviewPage.tsx` | **unowned** (F6o #31, F6p #33 landed) | **do not change the balance effect's dep array** — it must stay `[entries, networkId, balanceReloadToken]`, and do not derive the sticky latch from render-time identity. Either one reopens the fan-out loop that D14 turns into silent skips |
| `package.json`, `package-lock.json` | **unowned** (F6q #38 landed) | highest-blast-radius pair in the repo. The `overrides` entry pinning `@hono/node-server` is **load-bearing** — see **D25** before removing it, and always re-run `npm ci` + `npm audit` after touching either file |

**Append-only shared files that will conflict anyway:** `DECISIONS.md` (every
worker appends at the end), and the `ROLES` array in `server/mcp/server.ts`.
Expect a trailing-line conflict on both and resolve it in seconds rather than
being surprised by it.

**Scope a component together with its call sites.** F6j's allowlist named
`src/components/BalanceChips.tsx` but not the pages that render it. Adding a required
prop forces every caller to change, so the worker had to touch
`AddressDetailPage.tsx`, `EntityPage.tsx` and `RelationshipGraph.tsx` to finish the
task — correctly disclosed, but off-allowlist. **That was a dispatch defect, not scope
creep.** When a task changes a component's props, list its callers in the allowlist or
say explicitly that wiring them is in scope.

---

## 3. Commit and merge contract

*Include verbatim in every worker prompt.*

- **Branch:** `<area>/<task-slug>`, created from `origin/main` **at the moment
  you start**. Never branch from another task's branch. `main` moves fast here
  — three PRs landed in one session on 2026-08-07.
- **Allowed to touch:** exactly the file allowlist in your assignment. If you
  believe you need anything else, stop and record it in `DECISIONS.md` as a
  proposal instead of editing it.
- **Never touch:** `README.md`, `docs/PLAN.md`, `docs/DECISIONS.md`,
  `package-lock.json` (unless a dependency was pre-approved), `.env`.
- **Commit convention:** small scoped commits, area prefix —
  `feat(config):`, `style(ui):`, `fix(a11y):`, `chore(ci):`, `docs():`.
  Mirror existing `git log` style.
- **Gate — all four must pass locally before handback:**
  ```
  npm run typecheck && npm run lint && npm test && npm run build
  ```
- **Never push to `main`.** Always a PR, even a one-line change. The PR is what
  triggers CI, Semgrep, Trivy, Cursor Bugbot and Patchhog; a direct push
  silently skips all of it.
- **You open the PR; you do not merge it.**

### Handback report

```
TASK:        <id> — <title>
BRANCH / PR: <branch> / <url>
GATE:        typecheck / lint / tests <before> -> <after> / build
<TASK-SPECIFIC EVIDENCE — measurements, not adjectives>
EXISTING TESTS MODIFIED: <which, and strengthening or weakening + why>
DEVIATIONS FROM THE SPEC, AND WHY: <none, or numbered list>
RISKS AND FOLLOW-UPS: <the most useful field — write it honestly>
```

---

## 4. Integration order and conflict hot zones

```
F6g ──✅ #15   F6h ──✅ #18   F6k ──✅ #20   F6l ──✅ #22
F6i ──✅ #24 ──▶ F6j ──✅ #27 ──▶ F6n ──✅ #28 ──▶ F6o ──✅ #31 ──▶ F6p ──✅ #33  (chain complete)
F6m  ✅ closed — Patchhog at 0 findings; nothing left unreadable (D26)
```

**F6m is closed — resolved, not abandoned (2026-08-09).** Patchhog now reports
`Clean scan: **0 findings**` on `main` (`e2af36b`), the first zero in the repo's history.
There is nothing left to be unreadable, so the task's substance is gone rather than
deferred. Recorded as **D26**. The dashboard is still `DEPLOYMENT_NOT_FOUND` and that is
now accepted permanently — see D26 for why that costs nothing.

**Two planner errors on the way there, both worth keeping.** First, F6m was written on the
claim that Patchhog *could not fail*; Stephen had seen it red, and **D23** corrected it
from full history rather than the sampled window that produced the error (§6 trap 11).
Second, for most of 2026-08-09 this plan called F6m *blocked* on the dead dashboard.
Stephen corrected that too: **Patchhog's findings are dependency advisories, which are
independently discoverable** — `npm audit` against the committed lockfile names the
package, the GHSA, the severity and the fix version with no Patchhog UI involved, and
**D20 had already proved it** by adjudicating GHSA-frvp-7c67-39w9 entirely from the
lockfile. Treating a dead UI as a blocker parked an actionable task for a day. **F6q (#38)
is the demonstration:** found by `npm audit`, decided against D20, fixed, verified and
merged with the dashboard never once consulted.

**What closed the two residues.** The four historical high/critical failures were all
pre-#5, all on commits Patchhog itself authored, and are all reflected in a count that is
now zero — whatever they were is fixed, and recovering the detail is archaeology with no
action attached. Whether Patchhog earns its §3 slot was answered by **D24**: it is a
required status check. Neither residue survives.

**Nothing is in flight, and there are no open tasks.** The F6i → F6p chain is complete,
F6q and F6m are closed, and `src/pages/OverviewPage.tsx` and the dependency files are
unowned — the next task can take anything without queueing. The constraint to re-check
first is
`src/components/BalanceChips.tsx` and `RpcOverrideForm.tsx`, which are shared with three
pages: changing their gating or props forces every caller to change and puts a task
outside a reviewable diff (the F6j lesson in §2).

**F6i and F6h interact usefully:** once F6i replaces the dead Amoy endpoint, the
F6h suite's Amoy block flips from skip to pass on its own. That is a free
confirmation that F6i worked, rather than a claim — check for it after merging F6i.

**`src/config/address-book.chain.test.ts` is a serialization point.** F6h, F6k and
F6l all own it, so they ran one at a time. That constraint is **currently discharged** —
no task in flight owns the file, and F6j deliberately did not touch it, which the
reviewer confirmed against the merged diff. It becomes live again the moment two tasks
need chain-test changes.

**F6i and F6l have both landed** (#24, #22). Their predicted interaction happened
as recorded: Amoy flipped from skipped to passing, so the healthy skip counts each
dropped by one. **The ForteL2 host now reports `0 skipped` — all three chain blocks
run live.** Off-host, only ForteL2 skips.

**The `PROBE_OPTIONS` question is answered, for now.** F6k raised it: if probing ever
became product behaviour, the per-network D13/D14 posture would belong in
`src/config/networks.ts` rather than the chain test file. F6j **declined to make probing
product behaviour** — a user-supplied endpoint is validated by scheme only, not probed —
so `PROBE_OPTIONS` and `probeRpcUrl` stay in `address-book.chain.test.ts`. Recorded in
D16. The question reopens if anything ever needs to health-check an endpoint before use.

**F6j's residual risks, carried deliberately (D16, #27):**

- **An override replaces the whole URL list for that network** — no public fallbacks
  while one is set. Intended, for users whose network position cannot reach the public
  endpoints at all. The cost: an override that later dies has nothing behind it and must
  be cleared by hand. Do not "fix" this by merging the override into the fallback list
  without a decision entry; it would defeat the case it exists for.
- **The Overview directory rows have no override control** — only the address-detail,
  entity and graph panels do. A user whose first stop is Overview sees `unavailable`
  with no affordance. **Closed by F6o (#31)** — a page-level `RpcOverrideForm` mounts
  when any row is unavailable or an override already exists, and save/clear bumps a
  primitive reload token that re-runs the balance effect exactly once. The one gap it
  left — the control unmounting during the reload that follows a clear, so a slow or dead
  default RPC made it vanish for the length of the timeout — is **closed by F6p (#33)**,
  which latches the control per network and resets that latch on `networkId` change.
  **This residual risk is fully discharged.**
- **F6j made a latent `cache.ts` flaw reachable** — a fetch already in flight when
  `cacheClear()` runs still writes its result, and can overwrite a newer good one
  (last-writer-wins). **Closed by F6n (#28)** — an epoch counter discards writes and
  inflight-deletes from a superseded generation. The `invalidatePublicClient` path in
  `clients.ts` was correct all along and was *not* the defect site, despite being where
  the bot reported it.

**And the risk F6n itself flagged is closed, not merely accepted.** Its handoff warned
that callers awaiting a superseded promise still receive stale data in their own return
value. True at the promise level, unreachable in practice: `src/hooks/useAsync.ts` puts
its retry token in the effect dependency array, so React runs the cleanup
(`cancelled = true`) before the next effect and the stale `.then` never reaches
`setState`; and `server/` never calls `cacheClear` or `invalidatePublicClient` at all, so
the Node/MCP path cannot reach the race. Recorded because "accepted residual risk" and
"unreachable" get different treatment from the next reader.

#7 (`ef4991b`) and F6d (`c112874`) have both landed, so the `--mute`
serialization constraint is fully discharged and **no task currently owns
`src/index.css`** — the next design task can take it without queueing.

Hot zones despite the ownership split:

- `src/index.css` `:root` — every design task edits the same 100 lines.
  Serialize design tasks; don't run two in parallel.
- `DECISIONS.md` end-of-file — append-only, conflicts nearly every time.
- `src/config/address-book.test.ts` — both address and role tasks add cases.

---

## 5. Model tiering

### Per-task dispatch record

Recorded here so the operator does not re-derive it from a chat message that has
scrolled away.

| Task | Model | Order | Host | Baseline |
|---|---|---|---|---|
| F6u — tx detail page | strongest | ✅ done | ForteL2 host | merged #49 (`90fb57f`); reviewer re-ran the gate in an isolated clone, re-ran the cited mutation (red), and probed the real `getTransactionDetail` against live chain 852 — fee matched to the wei. One Bugbot finding (refund row dropped its recipient) verified and fixed on the PR (`4aa7ded`), proof-of-red re-run by the reviewer |
| F6v — block detail page | strong | ✅ done | ForteL2 host | merged #51 (`330fa1a`); reviewer re-ran the gate in isolation (206/0), re-applied the cited cache-key mutation (3 tests red, the ones named), and probed the real navigation-order flow live — F6u's header-only cache primed, then `getBlockDetail` returned full tx objects. Both dispatch traps (`block-full:` key, deposit-tx `type: undefined`) were handled; worker exceeded spec with a defensive throw on hash-only transactions and canonical dedup of zero-padded block numbers |
| F6w — MCP `get_transaction` | strong | wave 3, alone | **ForteL2 host required** for live evidence | `main` after #51 (`330fa1a`). **Traps the dispatch names:** `http.test.ts` asserts the tool list as an **exact sorted array** — adding a tool reddens it by design, and the fix is adding the name, never weakening to `contains`; `not_found` must be a structured **answer** (`textJson`), never `toolError` — collapsing them reproduces the D13 confusion for agent callers; bigints only via `toJsonSafe`; `server/` must never call `cacheClear`/`invalidatePublicClient` (§4 records why) |

F6u is strongest-tier despite being "just a page": it publishes a **URL contract that
SettlementOS will hardcode** (§4 of the PRD) and a **money figure** (the L2 execution
fee). Both fail silently and both are expensive to change after the fact — §5 model
tiering, row 1.

**F6u and F6v must not run in parallel.** They share `src/App.tsx` and `src/index.css`,
and `src/index.css` is the §4 hot zone.

| Task shape | Tier |
|---|---|
| Address/chain data where a wrong value ships silently | strongest |
| Design-system application with measured contrast | strong |
| Mechanical (pin a SHA, add a gitignore line, rename a token) | cheap |
| Review of any of the above | strongest — the reviewer needs to out-think the worker |

---

## 6. Standing traps in this repo

Each of these has already cost time.

1. **`main` moves during a task.** F6b was based on `20f17ff` while main was at
   `3ff4592`; #6 then merged *before* a review fix landed on its branch,
   stranding the commit. Re-check `origin/main` immediately before merging.
2. **The address-book test can't fail on wrong addresses.** `EXPECTED` at
   `src/config/address-book.test.ts:151` is compared against
   `getAddressesForNetwork()` — source versus a copy of itself, both from the
   same commit. Any claim of "addresses verified" must name an out-of-band
   method. F6c-test adds a real chain check; the tautological test stays
   because it still catches accidental edits.
3. **ForteL2 balances and transfers read `unavailable` by default.** Not a bug —
   see DECISIONS D4. Don't let a worker "fix" it.
4. **A green Semgrep job isn't proof it ran.** Read the log for
   `Findings: N` before reporting a scan result.
5. **`git add -A` sweeps scan output.** `semgrep-results.json` and
   `trivy-results.*` are gitignored as of #5; stage files explicitly anyway.
6. **Byte counts in evidence are easy to record wrong.** `eth_getCode` returns
   a hex *string*: length 3622 means **1810 bytes**. The F6a evidence recorded
   hex-string lengths as bytes (and off by one), which made the same contracts
   look different when re-checked on 852. State the unit.
7. **The stranded-commit pattern is real.** `feat/design-system` carried
   `cfcd0e3`, byte-identical to what later became #7, because #6 merged before
   the reviewer's push landed. Before deleting any branch, diff its extra
   commits against `main` rather than assuming they're redundant.
8. **`grep` here is ugrep, and its errors look like clean results.** `\{` in a
   pattern errors with "invalid repeat", and a pattern starting with `--` is
   parsed as an option: `grep --ash file` exits **2** with "invalid option",
   not 1 ("no matches"). Both produce no output, so a worker reading only stdout
   reports "0 hits" from a command that never ran — this happened in the F6d
   handoff (#12), where the claim was true but the cited evidence was void.
   **Check the exit code, not just the empty output.** Working form:
   `grep -F -- '--ash'`. Scratchpad scripts also can't import `viem`; run node
   from the repo root.
9. **Skip counts are per-network now; the number alone means nothing.**

   > **Re-measured 2026-08-14 on `a70924d`, and the healthy states below have changed —
   > read this before the paragraph it corrects.** The suite is **155 tests / 24 files**,
   > not 137. Both the ForteL2 host and CI report the identical line
   > `154 passed | 1 skipped (155)` — **and the skipped test is a different one in each
   > place.** In CI, ForteL2 skips (port 9545 is closed on a GitHub runner; D13). On the
   > ForteL2 host, **ForteL2 passes and _Polygon Amoy_ skips** — reproduced on three
   > consecutive runs, its block taking ~4990ms before skipping.
   >
   > **This is the exact case trap 9 exists to catch, and the count hides it perfectly:
   > `1 skipped` is the documented-healthy number in both places, so nothing looks wrong.**
   > Read the `describe` titles.
   >
   > It is **not** a dead endpoint — a fresh #17. `https://polygon-amoy.drpc.org` answered
   > `eth_chainId` → `0x354`-class success in **85 / 119 / 98 ms** on three straight curls
   > from the same host, seconds after the skip. The block issues `eth_getCode` for **10
   > rows** in a burst, so the working hypothesis is per-IP throttling on the burst (a
   > D14 `429` / `-32005` skip-class response, working as designed) rather than
   > unavailability. **Unconfirmed** — nobody has yet read which skip-class response
   > came back.
   >
   > **What is not at risk:** CI drift detection. Amoy passes in CI, which is where it
   > guards. The loss is host-local. **What to do:** do not let a worker "fix" this by
   > widening a catch. It needs the actual response read first. Candidate follow-up task
   > — assign from **`F6w`** onward per §1.

   As of #33
   the suite is 137 tests across **three** chain blocks, and all three are live
   (measured on the ForteL2 host: ForteL2 295ms, Base Sepolia 1153ms, Amoy 4378ms —
   the public-chain timings vary by seconds run to run; treat them as liveness evidence,
   not a budget). Healthy states: `137 passed / 0 skipped` on the ForteL2 host, and
   `136 passed / 1 skipped` anywhere else (ForteL2 only). **Base Sepolia and Polygon
   Amoy must never appear in the skipped list** — they are the blocks that run in CI,
   so a silent skip there means automated drift detection is gone. Read the
   `describe` titles, not the count. A public block may also skip *mid-run* on
   throttling (D14/D13): started-then-skipped is normal, but started-and-passed on a
   truncated row set would not be, and is guarded.

10. **Never run git write commands in a working directory an agent is using.**
   A worker agent, the planner and the reviewer share one HEAD, index and tree.
   On 2026-08-08 a planner `checkout -b` put a docs commit on the agent's branch,
   a `reset --hard` orphaned the agent's commit, and an agent-side reset silently
   reverted half of an in-progress docs edit — producing a commit that looked
   complete but contained 2 of 5 changes. Read the shared checkout with
   ref-scoped commands (`git show <ref>:<path>`, `git diff a...b`, `gh pr diff`);
   do writes through the GitHub API or in a throwaway clone. A `git status` check
   is not an interlock — it is true for one instant.

11. **Do not conclude "never happens" from a window that starts after it stopped
   happening.** `patchhog/security` is a commit *status*, not a check run, and not any
   workflow in `.github/workflows`. Across PRs #5–#25 it posted `success` **every single
   time, including "Clean scan: 4 findings" on #6**, and the planner concluded from that
   run of greens that the status **could not fail** and had no threshold. **That was
   wrong, and Stephen corrected it** — it has posted `failure` four times
   (`a436ecf`, `e77fb13`, `1d7b24d`, `f76ebaa`, 2026-07-28 → 08-04), and the threshold is
   **severity and auto-fixability, not the finding count**: `failure` reads
   `N auto-fixable high+critical`, `success` reads `Clean scan: N findings`. Which is why
   4 findings passed — none were auto-fixable high/critical.

   **The methodological trap, which generalises past Patchhog:** the sample was PRs
   #5–#25, and #5 opened four days *after* the last failure, by which point the portal had
   already auto-fixed every high/critical on `main`. **A window that begins after the
   fixes cannot contain the failures it is being used to rule out.** The observations were
   all accurate; the error was stating an absolute from a bounded sample when full history
   was one API call away. Before writing "X never happens", ask what window you actually
   looked at and whether X would have been *inside* it.

   **What still holds, and what stopped mattering:** the dashboard host returns
   `DEPLOYMENT_NOT_FOUND` (re-checked 2026-08-09), so no finding it ever reported is
   readable — only the count and severity, in the status description. That was the live
   half until Patchhog reached **0 findings** on `main`; with nothing left to read, the
   gap costs nothing and **F6m is closed (D26)**. `npm audit` is the system of record for
   the detail; the status is the gate.

   Still true of the neighbours: the word "Clean" in `Clean scan: 4 findings` is not a
   verdict, so read the number, not the adjective — same family as trap 4 (a green Semgrep
   job isn't proof it ran) and trap 8 (a command that never ran reads as a clean result).
   **Semgrep, Trivy and Cursor Bugbot are real** — all three verified as genuine check runs
   on #24's head. See **D23** (which supersedes **D17**), **D24** — which makes
   `patchhog/security` a required check, so this status now blocks merges — and **D26**,
   which closes F6m at 0 findings.

12. **Patchhog applies fixes as a direct push to `main`, which skips every scanner.**
   On 2026-08-08, commit `7b6b382` — *"Security: bump 1 vulnerable dependency (Patchhog
   security fix)"* — landed **directly on `main` with no PR**. Stephen authorised it in the
   Patchhog portal, so it is **not** an autonomous bot write, and it runs under his account
   because that is the credential the portal holds. The gap is the delivery channel, not
   the authorisation: §3 routes fixes through a PR precisely so CI, Semgrep, Trivy and
   Bugbot run, and a portal-applied push gets none of them. This one changed
   `package.json` + `package-lock.json` — the highest-blast-radius pair in the repo — and
   `main` was only confirmed green afterwards by a hand-run gate (`npm ci` coherent,
   131 passed / 0 skipped). That was verification after the fact, not before.
   **If you authorise a portal fix, re-run the gate on `main` yourself**, because nothing
   else will. **D21** adds a ruleset on `main` but deliberately keeps a `Repository admin`
   bypass — and since Patchhog holds Stephen's credential, that bypass covers it too, so
   this trap is not closed by the ruleset. It is mitigated only by the hand-run gate.

   *Sharpened 2026-08-09 by **D24**.* `patchhog/security` is now a **required** status
   check, which makes this trap circular rather than merely open: a red Patchhog blocks
   every PR on that base, and the documented remedy — *"click Auto-PR at Patchhog"* — runs
   under Stephen's credential, so it passes the `Repository admin` bypass and lands as a
   direct push that skips every scanner. **The remedy for a Patchhog block routes around
   the gate Patchhog now enforces.** The hand-run gate on `main` after authorising a portal
   fix is therefore not optional hygiene any more; it is the only verification in that
   path.

   *Planner error worth recording (2026-08-08).* I first read this commit as claiming to fix
   the `@hono/node-server` advisory and failing to — it bumped `nanoid` and left
   `@hono/node-server` at `1.19.14`. **That was wrong.** The message says "1 vulnerable
   dependency" and names no package; Patchhog had several findings, this one applied the
   `nanoid` fix, and the hono advisory was simply still outstanding (see **D20**). I
   inferred a connection from timing and stated it as fact. **Do not infer which advisory
   an automated security commit addresses from what was reported near it — read the diff
   and match the package.**

13. **A mutation proof can be vacuous and still read as rigorous.** Reviews here re-run
   the worker's proof rather than reading it, which only works if the mutation
   actually exercises the property. #31's PR body claimed its tests "prove a double-bump
   goes red." Re-run, it stayed **green** — two `setBalanceReloadToken((n) => n + 1)`
   calls in one React handler are batched into a single `0 → 2` transition, so it is one
   effect run, not two. The mutation was a no-op dressed as a proof. The guard itself was
   real: dropping the token from the dep array went red (3 tests), adding `query` went red
   (1), a genuine two-tick double refresh went red (2), and an unstable object dep failed
   loudly with heap exhaustion at 230s. **A mutation that leaves behaviour identical
   proves nothing about the test.** When a handoff cites a mutation, re-run that exact
   one — a claim can be false while the underlying code is correct, and the two failures
   look identical from the PR body. Same family as trap 4, trap 8 and trap 11: something
   that never really ran reading as a clean result.

   *The follow-through, recorded because the negative case is what makes the trap
   usable (2026-08-09).* The very next handoff, F6p (#33), cited a mutation — reverting
   `showRpcOverride` to its pre-F6p form — and on re-run it **genuinely went red**, with
   the exact error the handoff quoted. So the rule is "re-run the cited mutation", not
   "distrust cited mutations". Two handoffs, two opposite outcomes, and the only way to
   tell them apart was to run it. Cheap check, and it is the one that separates a real
   proof from a plausible sentence.

   **Two mutation shapes that reliably prove nothing in React**, both worth recognising
   before citing one: (a) **two `setState` calls in the same handler** — batched into one
   transition, so no extra effect run; (b) **a state update that lands on an equal value**
   — React bails out of the re-render, so a "changed" dependency never fires. If a
   mutation is supposed to cause extra work, assert the **call count** of the expensive
   thing, and confirm the number actually moves.

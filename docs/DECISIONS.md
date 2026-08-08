# SettlementOS Explorer — decisions log

Numbered, **append-only**. Every worker reads this file before starting and
cites decisions by number rather than re-deciding them. Format mirrors
settlementos [`tasks/fortel2-decisions-log-template.md`](https://github.com/StephenForte/settlementos/blob/main/tasks/fortel2-decisions-log-template.md).

**Rules**

- Entries are append-only. To change a decision, add a **new** entry that
  supersedes the old one and mark the old one `SUPERSEDED by Dn` with a date
  and reason. **Never renumber and never rewrite history.**
- A worker writes here *instead of* touching a file outside its allowlist,
  adding a dependency, or deviating from its assignment. Proposal first, code
  only once the entry reads `APPROVED`.
- Workers must not act on an entry marked `OPEN`.
- Only the planner/integrator edits existing entries' status.

**Entry format**

```
### Dn: <one-line title>
- Status: OPEN | APPROVED | REJECTED | SUPERSEDED by <id>
- Type: design-choice | file-outside-allowlist | new-dependency | bug-found-elsewhere | scope-question
- Date: <YYYY-MM-DD>
- Source: <PR / issue / task id>
- Detail: <2–5 lines: what, why, smallest viable alternative>
```

**Next free identifier: `D21`.** `D19` is assigned to **F6o** (dispatched 2026-08-08,
optional for that task); `D20` is below. **`D18` is retired unused** — pre-assigned to F6n,
published, and correctly declined because there was no design fork; burned rather than
recycled, as `F6e` was. Take `D21` only from the plan, never by reading for the highest
number here.

---

### D1: `mmf-contract` is its own role, grouped under Contracts
- Status: APPROVED
- Type: design-choice
- Date: 2026-08-07
- Source: F6a, PR #4
- Detail: `TokenizedMMF` renders as role `mmf-contract` with `roleLabel`
  "Tokenized MMF", grouped with escrow/token contracts rather than under
  Platform/Treasury. Alternative considered: fold it into `treasury`, rejected
  because the fund is a contract, not a platform wallet, and the graph needs a
  distinct node slot.

### D2: ForteL2 reuses the shared escrow, token and operator constants
- Status: APPROVED
- Type: design-choice
- Date: 2026-08-07
- Source: F6a, PR #4
- Detail: `PaymentSettlement`, `mockUSDC`, `mockJPY`, `mockSGD` and the operator
  wallet are the **same addresses** on Base Sepolia, Polygon Amoy and ForteL2
  Sepolia, inherited via `tokenEntries()` / shared constants rather than
  re-listed per network. This is correct **only because** the 2026-08-07
  ForteL2 deploy took the MMF add-on path and preserved them. A full redeploy
  breaks this assumption — see D3 and issue #8.

### D3: TokenizedMMF address and its provenance
- Status: APPROVED
- Type: design-choice
- Date: 2026-08-07
- Source: F6a, PR #4; settlementos PR #40
- Detail: `TOKENIZED_MMF_ADDRESS = 0xaed29387417dad9ab1993332e2c2b99d35ffe7ff`,
  ForteL2 Sepolia only. Deployer `0x5128889F…652d` nonce **20**, deployed via
  the MMF add-on path during the live 852 session on 2026-08-07. Base Sepolia
  and Amoy have no fund deployed. The address shares a 5-hex prefix with
  `ent_osaka_parts` (`0xAEd29CA4…`) by coincidence — a regression test pins the
  distinction; do not "fix" the apparent duplication.

### D4: ForteL2 balances and transfers read `unavailable` without an RPC URL
- Status: APPROVED — **partially superseded by D16 (2026-08-08)**. The default degradation
  described below is unchanged and still intended: off the operator Mac, ForteL2 chips
  still read `unavailable`, and **that is still not a bug to fix** (PLAN §6 trap 3 stands).
  What D16 changes is only that the chips are now *actionable* — a user may supply their
  own endpoint. Nothing about the default behaviour, and nothing about the instruction not
  to "fix" it, is retracted.
- Type: design-choice
- Date: 2026-08-08
- Source: Stephen, via F6a handoff
- Detail: ForteL2 Sepolia defaults to `http://127.0.0.1:9545` (the operator Mac
  sequencer). On any other host, balance chips render `unavailable` and
  transfers show a contained inline RPC failure. **This is intended** — the
  deployed site degrades rather than hiding the network. Set
  `VITE_FORTEL2_SEPOLIA_RPC_URL` to change it. Do not treat the `unavailable`
  chips as a bug.

### D5: Dark mode is invented, not specified
- Status: APPROVED
- Type: design-choice
- Date: 2026-08-07
- Source: F6b, PR #6
- Detail: `docs/DESIGN.md` is a marketing spec with no in-product chrome, so
  the dark palette (inverted surfaces, same yellow CTA and role hues) was
  authored rather than derived. Kept behind `prefers-color-scheme`. If product
  wants light-only, drop the media query — the light tokens stand alone.

### D6: Role badges use soft fill with darkened ink, not white-on-hue
- Status: APPROVED
- Type: design-choice
- Date: 2026-08-07
- Source: F6b, PR #6
- Detail: Badges pair `--role-*-soft` backgrounds with `--role-*-ink` text
  (measured 5.28–7.74:1, all AA at 12px). Solid white-on-hue failed AA at badge
  size. Graph nodes keep the saturated `--role-*` values as borders, so the
  list↔graph colour correspondence survives — pinned by a test in
  `RoleBadge.test.tsx`.

### D7: `--mute` darkened to `#66685d` for WCAG AA
- Status: APPROVED
- Type: design-choice
- Date: 2026-08-07
- Source: review of F6b; PR #7
- Detail: F6b shipped `--mute: #6c6e63`, which measures **4.49:1** on
  `--canvas` and **4.16:1** on `--surface-soft` (`.data-table th`). None of the
  affected styles qualify for the AA-large exemption — largest is 16px, and
  large text needs 24px normal / 18.66px bold — so `.footer`, `.lede`,
  `.muted`, `.brand-tagline` and `.data-table th` all failed AA-normal.
  Darkening 6 per channel clears every surface (canvas 4.90, surface-soft 4.55,
  card 5.67) without introducing a parallel palette. Dark mode unaffected — it
  declares its own `--mute: #b6b7af` (8.56 / 7.06).

### D8: GitHub Actions are pinned to commit SHAs
- Status: APPROVED
- Type: design-choice
- Date: 2026-08-07
- Source: PR #5
- Detail: Mutable tags can be silently repointed by the action owner. All
  `uses:` are pinned to full 40-char SHAs, verified against the GitHub tag refs
  API rather than trusted from the Semgrep suggestion. Keep new actions pinned;
  Semgrep's `github-actions-mutable-action-tag` will flag regressions.

### D9: `docs/DESIGN.md` lives in this repo
- Status: APPROVED
- Type: scope-question
- Date: 2026-08-07
- Source: F6b, PR #6; confirmed by Stephen
- Detail: The 690-line design spec was committed alongside the implementation
  rather than kept external. Stephen attached it to the F6b prompt, so
  committing it was the intended call — the tokens in `src/index.css` are
  traceable to a spec that lives with them.

### D10: `--ash` is a dead token
- Status: **APPROVED 2026-08-08 — drop both declarations**
- Type: design-choice
- Date: 2026-08-07 (resolved 2026-08-08)
- Source: review of F6b; resolved by Stephen
- Detail: `--ash: #9b9c92` is declared in both the light and dark blocks
  (identical value in each, unlike every other token, which inverts) and
  consumed **zero** times anywhere in `src/` or `server/`. The F6b handoff
  described it as "used only as disabled token", which implies a usage that
  does not exist. Options: wire it to a real disabled state, or drop both
  declarations. **Resolution: drop both** — re-confirmed on `4c676cc` that
  `grep -rF 'var(--ash)' src server` returns 0 hits. Implemented by **F6d**
  (`src/index.css` lines 20 and 138). If a disabled state later needs a token,
  add one then, against a real usage.

### D11: chain-852 verification is an opt-in test, skipped when RPC is unreachable
- Status: APPROVED
- Type: design-choice
- Date: 2026-08-08
- Source: F6c / issue #8; decided by Stephen
- Detail: The ForteL2 sequencer is host-local (**D4**), so CI cannot reach
  chain 852 and never will under the current topology. The chain-852 liveness
  check is therefore encoded as a **vitest block that resolves the RPC from
  `VITE_FORTEL2_SEPOLIA_RPC_URL` / `FORTEL2_SEPOLIA_RPC_URL` (default
  `http://127.0.0.1:9545`), probes once, and skips when unreachable** — green
  in CI, real on the host. Implemented by **F6c-test**.
  Alternatives considered: a standalone script run by hand (rejected — nothing
  forces anyone to run it, so it decays to documentation), and docs-only
  (rejected — a redeploy silently invalidates the evidence with no mechanism to
  catch it, and per D2 a full redeploy *does* replace the inherited constants).
  **Accepted cost:** the suite's `0 skipped` baseline ends. Off-host runs will
  report skipped cases, so "0 skipped" is no longer the signal that the suite is
  healthy — read the skip reason instead. The risk this buys down is a wrong
  address shipping silently, which the existing `EXPECTED`-map test structurally
  cannot catch (see PLAN §6 trap 2).

### D12: entity wallet ownership is confirmed against the deploy manifest, and that check is not automatable
- Status: APPROVED
- Type: design-choice
- Date: 2026-08-08
- Source: F6f / issue #11
- Detail: The four ForteL2 entity wallets and the treasury were unverifiable by
  any chain query — they are EOAs, and three had never transacted, so nothing
  on-chain links an address to a company. The authoritative mapping is
  `chain/deployments.<network>.json` in settlementos, written by
  `scripts/deploy-testnet.mjs`, which generates each wallet with
  `generatePrivateKey()` and reuses it across re-runs. Read on the ForteL2 host on
  2026-08-08: **all five addresses matched the address book exactly**, and the
  script's `entityGasTarget: parseEther("0.0002")` independently explains the
  identical dust balances observed on chain.
  Because the keys are random, there is **no re-derivation path** — that file is
  the only source. Because it contains those private keys it is gitignored and
  must stay that way: never commit it, never copy its contents into this repo, and
  read only `.address` fields from it.
  Consequence: this verification **cannot be encoded as a test**, unlike D11's
  chain check. It expires on any redeploy that regenerates the wallets, and the
  only way to re-confirm is to re-read the manifest on the deploying host. Recorded
  in `PLAN.md` §0 with the date it was true.

### D13: a reachable-but-broken RPC fails the chain check; only transport failures skip
- Status: APPROVED
- Type: design-choice
- Date: 2026-08-08
- Source: F6g / PR #15
- Detail: D11 made the chain-852 check skip when the RPC is unreachable, which is
  correct for CI but made a *broken* endpoint indistinguishable from an absent
  one — a typo'd `FORTEL2_SEPOLIA_RPC_URL` on the ForteL2 host read as "you must
  be off-host" and the address book would go unverified indefinitely. The line is
  now drawn at **whether anything answered**:

  | Situation | Behaviour |
  |---|---|
  | Connection refused, DNS failure, transport timeout | skip |
  | HTTP response arrived, non-2xx | **fail** |
  | HTTP 200 with a JSON-RPC `error` object | **fail** |
  | HTTP 200, `result` absent or not a string | **fail** |
  | HTTP 200, valid result, wrong chain id | **fail** |
  | HTTP 200, valid result, chain 852 | run the assertions |

  The distinction is **structural, not string-matched** — the `try/catch` wraps
  only the `fetch` call, so "no HTTP response" is separated from "responded badly"
  by control flow. Matching on `ECONNREFUSED` / `AbortError` / `err.code` would
  behave differently on the CI runner than on the host, which is precisely the
  machine whose behaviour must stay predictable. Do not reintroduce it.

  **Boundary, decided rather than inherited:** a server that sends headers and then
  never finishes the body is classified **broken**, not unreachable — the probe
  timeout lands inside `res.json()`. That is deliberate: it answered, so it is
  broken rather than absent. It fails in ~2s without stalling, and cannot affect CI,
  where nothing is listening at all.

  Verified end-to-end against stub servers, not just at the classifier: each of
  error-object / HTTP 500 / non-string result / wrong chain fails the suite and
  names the URL; a closed port still skips. CI confirms `92 passed / 1 skipped`,
  so D11 is intact.

### D14: public RPCs get an availability class that skips; private ones keep D13
- Status: APPROVED
- Type: design-choice
- Date: 2026-08-08
- Source: F6h / PR #18
- Detail: D13 draws the line at "did anything answer" — right for a sequencer we
  control, wrong for a public provider, which can refuse or throttle for reasons
  that say nothing about our address data. Under D13 alone those refusals would
  turn CI red, and the first fix anyone reaches for is deleting the test, which
  loses the drift detection entirely.

  A probe is now **opt-in availability-aware**. For public networks only
  (`availabilityAware: true` on Base Sepolia and Polygon Amoy):

  | Response | Class |
  |---|---|
  | Transport failure — DNS, refused, timeout | skip (D13) |
  | HTTP 403, 408, 429, 502, 503, 504 | **skip** — provider refusing or throttling |
  | JSON-RPC rate-limit error (e.g. `-32005`) | **skip** |
  | Any other non-2xx | fail (D13) |
  | HTTP 200 + other JSON-RPC error, or missing/non-string result | fail (D13) |
  | Correct response, wrong chain id | **fail** — config error, not availability |
  | Correct response, wrong bytecode shape | **fail** — this is the drift |

  **ForteL2 is deliberately excluded.** Its probe is called with no options, so
  D13 is unchanged for the private sequencer: a broken ForteL2 RPC still fails.
  Evidence for skip-on-403: `sepolia.base.org` returns 403 to Python-urllib and 200
  to Node `fetch` — that is client policy, not address drift.

  **What this buys:** Base Sepolia now runs in CI (~1.5s of real `eth_getCode`),
  so address drift on that network is caught with nobody remembering to check.
  Verified by injecting drift — a Base entity row pointed at a contract fails and
  names the row. Amoy skips until #17 replaces its dead endpoint; when that lands,
  the Amoy block flips to passing on its own.

  **Known gap (F6k):** the D13 guard test asserts `probeRpcUrl`'s default rather
  than the ForteL2 call site, so it would not catch someone making ForteL2
  availability-aware. Behaviour is correct today; the regression net is thinner
  than it looks.

### D15: Polygon Amoy's replacement RPC endpoint
- Status: **APPROVED 2026-08-08** — `https://polygon-amoy.drpc.org` (F6i, #24)
- Type: design-choice
- Date: 2026-08-08
- Source: F6i / issue #17
- Detail: `https://rpc-amoy.polygon.technology` — the `rpcUrl` previously on `main` —
  does not resolve (`ENOTFOUND`, 3/3 attempts; `dig` returns nothing).

  > **Correction (2026-08-08, planner error).** This entry and issue #17 originally
  > claimed the dead host meant "every Amoy feature is dead for all users." **That was
  > wrong**, and the F6i handoff caught it. `src/lib/clients.ts` builds every client
  > through viem's `fallback()` transport, and `RPC_URLS['polygon-amoy']` already
  > listed `polygon-amoy.drpc.org` **first**, with the dead host third and simply
  > skipped — so app reads were already being served. The real impact was narrower:
  > the F6h liveness suite reads `NETWORKS[id].rpcUrl` **directly**, so Amoy could not
  > be verified, and the config disagreed with what the app actually used. Recorded
  > rather than silently edited, because the wrong claim shaped the dispatch.

  Candidates measured from the ForteL2 Mac on 2026-08-08:

  | Endpoint | chainId | getCode | eth_call | **getLogs @ 2000 blocks** | latency |
  |---|---|---|---|---|---|
  | `rpc-amoy.polygon.technology` | — | — | — | **dead** | — |
  | `polygon-amoy-bor-rpc.publicnode.com` | 80002 | 4270 B | ok | **OK** | 111ms median, 6/6 |
  | `polygon-amoy.drpc.org` | 80002 | 4270 B | ok | **OK** | 45ms median, 6/6 |
  | `80002.rpc.thirdweb.com` | 80002 | 4270 B | ok | **REJECTED** `-32005` | 200ms |
  | `rpc.ankr.com/polygon_amoy` | — | — | — | needs an API key | — |

  **`eth_getLogs` is the selection criterion, not `eth_chainId`.**
  `src/chain/transfers.ts` requests logs in `LOG_CHUNK = 2_000n` windows, and
  thirdweb rejects exactly that window while answering every other method
  perfectly. Worse, `getLogsChunked` swallows chunk failures by design (`catch {}`),
  so a rejecting endpoint yields an **empty transfer list rather than an error** —
  it cannot be caught by loading the app and seeing whether it looks right.

  **Chosen: `https://polygon-amoy.drpc.org`**, over publicnode on lower measured
  latency and because it was already the app's primary Amoy URL in
  `src/lib/clients.ts` — so `NETWORKS`, the fallback list, the liveness suite and the
  env default now all agree, which they did not before.

  **Free-tier limits, from the F6i handoff:** ~120k CU/min per IP (~100 `eth_call`/s),
  degrading to ~50.4k under load; log responses capped at 10k entries; batches ≤3;
  filter/trace/debug disabled; 2s max timeout. The monthly CU budget is account-keyed
  — the keyless public URL is "always free" but still IP-rate-limited. publicnode
  publishes no numeric limits (fair-use, 429). These matter because D14 treats 429 and
  the `-32005` rate-limit code as **skip**, so throttling degrades the liveness suite
  rather than reddening CI.

  An env override (`VITE_POLYGON_AMOY_RPC_URL` / `POLYGON_AMOY_RPC_URL`) ships with
  it, matching the ForteL2 pattern, so a deployment can move without a code change.

  **Accepted residual risk:** a single public default can die again, exactly as this
  one did. The `fallback()` list in `src/lib/clients.ts` already softens that for app
  reads — but **not** for the liveness suite, which deliberately reads the configured
  URL so it tests what ships. F6j (user-configurable RPC, #17) remains the durable
  product fix, though less urgently than issue #17 originally implied.

### D16: User-configurable per-network RPC override (partially supersedes D4)
- Status: **APPROVED 2026-08-08** (#27 → `b58b165`). Reviewer re-ran the full gate in an
  isolated clone: **125 passed / 0 skipped**, all three chain blocks live (ForteL2 34ms,
  Base 1224ms, Amoy 5029ms against dRPC). The cache-invalidation mutation was re-run
  independently — removing `invalidatePublicClient` from `setNetworkRpcOverride` turns
  `override changes the URL set for the next client with no reload` red, so the guard
  guards. `PROPOSED` was not one of this log's documented statuses; corrected here.
- Type: design-choice
- Date: 2026-08-08
- Source: F6j / issue #17
- Detail: When a network's RPC fails (or the whole `fallback()` list is wrong for a
  user's network position), the UI offers a per-network endpoint override stored in
  `localStorage`. Precedence is **user override → env (`getEnv` / `NETWORKS`) →
  built-in fallback list**. The override lives in the client-construction path
  (`src/lib/clients.ts` + `src/lib/rpc-overrides.ts`), not in `NETWORKS`, so the
  chain liveness suite (`address-book.chain.test.ts`) keeps verifying what ships.

  Setting or clearing an override invalidates the per-network public-client cache
  and the shared data cache (`cacheClear()`), so the next balances/transfers call
  hits the new host in the same page session with no reload.

  Privacy: only `http:` / `https:` URLs are accepted; the form states plainly that
  viewed addresses are sent to that host; nothing is persisted until Save.

  Endpoint health-probing beyond scheme validation is **out of scope** for F6j.
  `PROBE_OPTIONS` / `probeRpcUrl` stay in the chain test file; moving probing into
  product code would require a separate decision about where D13/D14 posture lives.

  **Partially supersedes D4.** D4 said ForteL2 chips reading `unavailable` without a
  reachable sequencer RPC is intended degradation. That degradation still happens by
  default, but the chips are now actionable — the user can supply a working endpoint
  (including pointing at the host-local sequencer from a browser that can reach it).
  The site still does not hide the network. D4's existing entry is left unchanged;
  the planner marks its status at merge.

### D17: Patchhog's status is not a scan result, and its findings are unrecoverable
- Status: **OPEN** — Stephen is restoring the dashboard deployment; revisit once it answers
- Type: scope-question
- Date: 2026-08-08
- Source: F6m / planner audit of PRs #5–#25
- Detail: `docs/PLAN.md` §3 tells every worker that opening a PR triggers "CI, Semgrep,
  Trivy, Cursor Bugbot and Patchhog." The first four are real. Patchhog, as configured
  today, reports nothing anyone can act on.

  **It cannot fail.** `patchhog/security` is a GitHub commit **status**, not a check run,
  and there is no corresponding workflow in `.github/workflows` — the status is posted by
  creator `StephenForte`, i.e. an external tool using a user token. Across every PR from
  #5 to #25 it posted state `success` with a description beginning `Clean scan:`:

  | PR | Description |
  |---|---|
  | #5, #7, #9, #10, #12, #13, #15, #16, #18–#25 | `Clean scan: 2 findings` |
  | **#6** | **`Clean scan: 4 findings`** |

  The word "Clean" and the `success` state are **independent of the findings count**. A
  status that is `success` at 2 findings and `success` at 4 has no threshold, so it has
  never been capable of blocking a merge. Note the count does vary with the diff (#6 was
  the design-system PR), so the scanner was doing real work — which makes the next part
  worse rather than better.

  **The findings are unreadable, and retrospectively unrecoverable.** Every `target_url`
  points at `patchr-eight.vercel.app`. That host is gone:

  ```
  curl -sS -D - -o /dev/null https://patchr-eight.vercel.app/
  HTTP/2 404
  x-vercel-error: DEPLOYMENT_NOT_FOUND
  ```

  Both at the per-scan paths and at the root, so it is a deleted deployment rather than an
  auth gate. Roughly twenty scans' worth of findings are therefore lost, and the only
  surviving evidence is the integer in each status description.

  **Why this is recorded rather than fixed by editing §3.** Stephen owns the Patchhog
  deployment and is restoring it, so removing it from the merge contract now would
  discard a control that is about to come back. §3 is deliberately left intact. What is
  *not* acceptable is the current state persisting silently — hence trap 11 in PLAN §6,
  so a worker reading §3 does not infer coverage that is not there today.

  **What resolving this looks like:** with the dashboard live, re-scan one merged PR,
  read the 2 findings, and decide whether they are real. If they are, they become a task.
  Then decide whether the status should be able to fail — a scanner that always reports
  `success` is decoration, and the honest options are a failing threshold or dropping it
  from §3.

  **Smallest viable alternative considered:** delete Patchhog from §3 and stop thinking
  about it. Rejected — the varying count says it finds something, and nobody has ever
  looked at what.

### D20: the `@hono/node-server` path-traversal advisory needs no code change here
- Status: **OPEN** — recorded by the planner; Stephen confirms the risk acceptance
- Type: bug-found-elsewhere
- Date: 2026-08-08
- Source: Patchhog security report; verified by the planner on `7b6b382`
- Detail: Patchhog reports `@hono/node-server@1.19.14` (**GHSA-frvp-7c67-39w9**, medium):
  path traversal in `serve-static` on **Windows** via an encoded backslash (`%5C`).
  Suggested fix: upgrade to `2.0.5`.

  **The finding is accurate about the version and wrong about the remedy.** Verified from
  the lockfile and `node_modules` on a clean `npm ci`:

  | Question | Answer |
  |---|---|
  | Installed version | `1.19.14` — confirmed, still present |
  | Direct dependency? | **No.** Transitive via `@modelcontextprotocol/sdk`, which requires `^1.19.9` |
  | Does our code use it? | **No.** `server/app.ts` is **Express**, not Hono |
  | Is `serveStatic` used anywhere? | **No.** Zero references in `src/`, `server/`, or the SDK's shipped `dist/` |
  | What the SDK actually imports | `getRequestListener`, in `dist/*/server/streamableHttp.js` — **not** `serveStatic` |
  | Do we run on Windows? | No — macOS / Linux |

  **The vulnerable code path is unreachable.** The package is loaded (we do use
  `StreamableHTTPServerTransport`, `server/mcp/http.ts:12`), but only for
  `getRequestListener`. `serveStatic` is never imported by anything in this dependency
  tree, and the advisory is Windows-specific regardless.

  **Why the suggested upgrade is worse than the finding.** `^1.19.9` excludes `2.x`, so
  reaching `2.0.5` means forcing it through `overrides` — a **major**-version bump on a
  transitive dependency that the MCP SDK never declared support for, on a module that sits
  on our live MCP request path. That trades an unreachable Windows-only path traversal for
  a real risk of breaking the MCP transport at runtime.

  **Decision: no code change.** Revisit when `@modelcontextprotocol/sdk` widens its range
  to accept `2.x`, at which point the bump is ordinary maintenance rather than a forced
  override. Marked `OPEN` deliberately so no worker "helpfully" adds the override —
  workers must not act on an `OPEN` entry.

  **Smallest viable alternative considered:** add the `overrides` pin anyway to silence the
  scanner. Rejected — silencing a scanner is not a security outcome, and the change is
  riskier than the finding it closes.

  See **PLAN §6 trap 12** for the separate and more serious problem: the commit that
  claimed to fix this (`7b6b382`) changed a different package and was pushed straight to
  `main`, skipping every scanner §3 relies on.

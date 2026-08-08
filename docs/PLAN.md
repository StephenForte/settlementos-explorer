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

Everything below was re-checked against the repo on **2026-08-08** from a fresh
clone, not carried over from a status report. Where a claim was verified, the
method is named — "verified" without a method is how plans start lying.

| Item | State | Evidence |
|---|---|---|
| `main` | `ec2f9dc` | after #25. This row previously read `e5b5e13` — a docs PR cannot record its own merge SHA, so §0 is stale by one commit every time it closes out a docs PR. Re-read `origin/main` rather than trusting this cell. |
| Test suite | **110 total** — `110 passed / 0 skipped` on the ForteL2 host, `109 passed / 1 skipped` anywhere else | `npx vitest run` on `e5b5e13`; **all three chain blocks live** since #24 |
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
F6j  user-configurable RPC on failure     📤 dispatched 2026-08-08 — issue #17
                                             D16 · strongest · solo · closes #17
F6k  make the D13 guard test real         ✅ merged #20
F6l  D14 availability past the probe       ✅ merged #22
F6m  Patchhog reports nothing readable    📋 open — D17
F6n  (next free identifier)

F6e  RETIRED — never dispatched, do not reuse
```

**Next free identifier: `F6n`.** Assign from here; do not grep for the highest
and add one. Parallel workers that each derive their own ID collide, and a
collision is harder to detect than an impossible number.

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

**Append-only shared files that will conflict anyway:** `DECISIONS.md` (every
worker appends at the end), and the `ROLES` array in `server/mcp/server.ts`.
Expect a trailing-line conflict on both and resolve it in seconds rather than
being surprised by it.

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
F6g ──✅ merged #15   F6h ──✅ merged #18
F6k ──┐  (test file)
F6i ──┼── F6i and F6k both touch nothing the other does; F6j follows F6i
F6j ──┘
```

**F6i and F6h interact usefully:** once F6i replaces the dead Amoy endpoint, the
F6h suite's Amoy block flips from skip to pass on its own. That is a free
confirmation that F6i worked, rather than a claim — check for it after merging F6i.

**`src/config/address-book.chain.test.ts` is a serialization point.** F6h, F6k and
F6l all own it, so they run one at a time — F6k landed as #20, and F6l branches
from `main` after it. F6i owns `src/config/networks.ts` and overlaps with none of
them, so it can run in parallel with any. F6j should follow F6i rather than run
beside it — both change how an RPC URL is resolved.

**F6i and F6l have both landed** (#24, #22). Their predicted interaction happened
as recorded: Amoy flipped from skipped to passing, so the healthy skip counts each
dropped by one. **The ForteL2 host now reports `0 skipped` — all three chain blocks
run live.** Off-host, only ForteL2 skips.

**Open design question, raised by F6k and deliberately not decided.** The
`PROBE_OPTIONS` map lives in the chain test file because `probeRpcUrl` is test-only
today. If probing ever becomes product behaviour — which F6j could make true, since
a user-supplied RPC needs validating before use — the per-network posture belongs in
`src/config/networks.ts` instead, and moving it needs a decision entry. Not forced
now; recorded so whoever picks up F6j sees it rather than rediscovering it.

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
9. **Skip counts are per-network now; the number alone means nothing.** As of #24
   the suite is 110 tests across **three** chain blocks, and all three are live.
   Healthy states: `110 passed / 0 skipped` on the ForteL2 host, and
   `109 passed / 1 skipped` anywhere else (ForteL2 only). **Base Sepolia and Polygon
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

11. **A green Patchhog status is not a scan result — it cannot fail.** `patchhog/security`
   is a commit *status*, not a check run, and not any workflow in `.github/workflows`.
   Across PRs #5–#25 it posted state `success` with a description beginning
   `Clean scan:` **every single time, including "Clean scan: 4 findings" on #6** — the
   word "Clean" and the `success` state are independent of the count. Its dashboard host
   also returns `DEPLOYMENT_NOT_FOUND`, so no finding it ever reported has been readable.
   §3 still lists it among the things a PR triggers, which is true but implies coverage
   we do not currently have. Same shape as trap 4 (a green Semgrep job isn't proof it
   ran) and trap 8 (a command that never ran reads as a clean result). **Semgrep, Trivy
   and Cursor Bugbot are real** — all three verified as genuine check runs on #24's head.
   See **D17** and **F6m**.

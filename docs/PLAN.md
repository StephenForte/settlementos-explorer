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

Everything below was checked against the repo on **2026-08-07**, not carried
over from a status report. Where a claim was verified, the method is named —
"verified" without a method is how plans start lying.

| Item | State | Evidence |
|---|---|---|
| `main` | `223d452` | after F6b (#6) |
| Test suite | **88 passed / 19 files** | `npx vitest run` locally |
| Gate | typecheck ✅ lint ✅ build ✅ | all re-run locally, not inherited from CI |
| `fortel2-sepolia` network registry | **True** | `src/config/networks.ts` on main, predates F6a |
| F6a — ForteL2 address book | **Done** | #4 → `20f17ff`; 11 addresses, `mmf-contract` role |
| F6b — design system | **Done** | #6 → `223d452`; tokens in `src/index.css`, `docs/DESIGN.md` |
| F6c — chain-852 liveness check | **Open** | issue #8; blocked on a host that can reach the sequencer |
| CI action pinning | **Done** | #5 → `3ff4592`; Semgrep reports `Findings: 0` |
| `--mute` AA fix | **In flight** | #7 open |

### Address provenance — how the 11 ForteL2 rows were actually confirmed

The F6a test suite compares a hardcoded `EXPECTED` map against
`address-book.ts`. Both live in the same commit, so **that check is a
tautology** — it proves internal consistency, not correctness. The addresses
were instead confirmed out-of-band during review of #4:

- **PaymentSettlement, mockUSDC, mockJPY, mockSGD** — derived as CREATE
  addresses from deployer `0x5128889F…652d` at **nonces 5, 6, 7, 8**
  (consecutive), and confirmed to hold bytecode on Base Sepolia via
  `eth_getCode` (mockUSDC 3623 bytes, PaymentSettlement 8543 bytes).
- **TokenizedMMF `0xaed29387…ffe7ff`** — deployer nonce **20**; confirmed by
  settlementos PR #40, which records the live 852 session of 2026-08-07 where
  the MMF add-on path deployed it. The nonce gap is explained by the add-on
  reusing the existing escrow and tokens rather than redeploying.
- **Treasury + 4 entity wallets** — EOAs, not derivable. **Not independently
  verified.** Taken from the F6a handoff.

Five of the eleven rows (escrow, three tokens, operator) are **inherited
constants** shared with Base Sepolia and Polygon Amoy, not ForteL2-specific
data. They are correct today only because the 2026-08-07 deploy took the
add-on path. A full redeploy replaces them — see F6c.

---

## 1. Task tree

```
F6a  address book + mmf-contract role     ✅ merged #4
F6b  design system (docs/DESIGN.md)       ✅ merged #6
 └── F6b-fix  --mute AA contrast          🔄 open #7
F6c  chain-852 liveness check             📋 open, issue #8 — needs ForteL2 host
F6d  (next free identifier)
```

**Next free identifier: `F6d`.** Assign from here; do not grep for the highest
and add one. Parallel workers that each derive their own ID collide, and a
collision is harder to detect than an impossible number.

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
F6c ──┐
F6d ──┼── any order once #7 lands (no mutual file overlap)
```

**#7 should merge before any new design work** — it changes `--mute` in
`src/index.css`, and any other branch touching that file will conflict on the
token block.

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
2. **The address-book test can't fail on wrong addresses.** It compares the
   source against a copy of itself. Any claim of "addresses verified" must name
   an out-of-band method. See F6c / issue #8.
3. **ForteL2 balances and transfers read `unavailable` by default.** Not a bug —
   see DECISIONS D4. Don't let a worker "fix" it.
4. **A green Semgrep job isn't proof it ran.** Read the log for
   `Findings: N` before reporting a scan result.
5. **`git add -A` sweeps scan output.** `semgrep-results.json` and
   `trivy-results.*` are gitignored as of #5; stage files explicitly anyway.

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

**Next free identifier: `D15`** — *reserved for F6i (Amoy endpoint choice).*

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
- Status: APPROVED
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

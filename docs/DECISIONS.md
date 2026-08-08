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

**Next free identifier: `D11`.**

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
- Status: OPEN
- Type: design-choice
- Date: 2026-08-07
- Source: review of F6b
- Detail: `--ash: #9b9c92` is declared in both the light and dark blocks
  (identical value in each, unlike every other token, which inverts) and
  consumed **zero** times anywhere in `src/` or `server/`. The F6b handoff
  described it as "used only as disabled token", which implies a usage that
  does not exist. Options: wire it to a real disabled state, or drop both
  declarations. **Do not act on this entry until it is APPROVED.**

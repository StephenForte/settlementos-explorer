# ForteL2 address-book re-key

ForteL2 re-genesis wipes L2 state. The 11 `fortel2-sepolia` rows on this public
site may then be wrong. This is the operational path to replace them. **Do not
invent placeholder addresses. Do not copy private keys into this repository.**

See **D31** for the structure and the CREATE-address reasoning. This file is the
checklist, not the argument.

## What ForteL2 owes us

≥1 day of notice, plus the new public addresses (or confirmation that CREATE
addresses reproduced). SettlementOS recovery is a full redeploy. This repo's
recovery is a file edit, a live chain check, and a site redeploy.

## Which rows change

Until the post-wipe deploy exists, treat every ForteL2 row as *able* to change.
The likely split, if the same deployer key is reused:

| Row | Likely fate | Why |
|---|---|---|
| Operator | Unchanged | EOA of `DEPLOYER_PRIVATE_KEY`, not a CREATE address |
| PaymentSettlement, mockUSDC, mockJPY, mockSGD | Unchanged *if* the deploy sequence repeats nonces 5–8; otherwise new | CREATE(`deployer`, nonce) |
| TokenizedMMF | New address, or absent | Was nonce 20 via the MMF add-on (D3), not in that sequence |
| Treasury + 4 entities | Unchanged *if* the gitignored overlay is kept; new if regenerated | `generatePrivateKey()`; overlay lives on the host, not on L2 (D12) |

Copy **public addresses only** from settlementos
`chain/deployments.fortel2-sepolia.json` on the deploying host (`.address`
fields). Never keys, never the overlay file itself.

Leave Base Sepolia and Polygon Amoy rows untouched.

## The edit

1. Open `src/config/address-book.ts`.
2. Replace `FORTEL2_SEPOLIA_DEPLOYMENT` as one object.
3. **CREATE contracts reproduced:** keep `contracts: SHARED_CONTRACTS`.
4. **CREATE contracts diverged:** give ForteL2 a *new* `contracts` object with
   the new escrow / token / operator values. Do **not** edit `SHARED_CONTRACTS`
   — that object is still Base Sepolia and Polygon Amoy.
5. Replace `treasury` and `entities` with the overlay's public addresses.
6. **TokenizedMMF / no fund:** omit `tokenizedMmf`. The `mmf-contract` row
   disappears. Then:
   - `src/config/address-book.test.ts` — drop the MMF entry from `EXPECTED` and
     from `PINNED_ADDRESS_BOOK`; the "eleven" assertion becomes ten.
   - `src/config/address-book.chain.test.ts` — `expectedRowCount: 11` becomes
     `10`, and the live-test title that says "all 11 rows" matches.
   **TokenizedMMF / new fund:** set `tokenizedMmf` to the new address and update
   `TOKENIZED_MMF_ADDRESS`. Keep the Osaka-prefix distinction test (D3); it
   still has to pass.

Do not add env vars or a fetched JSON config for these addresses (D31).

## Verify against the live chain

On a host that can reach the ForteL2 sequencer (default
`http://127.0.0.1:9545`, or `VITE_FORTEL2_SEPOLIA_RPC_URL` /
`FORTEL2_SEPOLIA_RPC_URL`):

```
npm test
```

The `ForteL2 chain-852 liveness` block must **run**. A skip is legitimate only
on transport failure (connection refused, DNS, timeout) — D13. A reachable but
broken sequencer, a wrong chain id, or a row whose bytecode shape does not
match its role (contract vs EOA) is a **failure**, not a skip. Public-RPC
throttling skips (D14) do not apply to ForteL2.

Treasury and entity *ownership* still cannot be proved from chain data (D12).
Re-read the overlay `.address` fields on the deploying host and confirm they
match the book.

`PINNED_ADDRESS_BOOK` in `address-book.test.ts` will go red when values change.
That is expected for a real re-key: update the pin to the new ForteL2 rows
only. Base and Amoy pins must stay.

## After

Redeploy this site. The MCP `list_addresses` tool reads the same
`ADDRESS_BOOK`; it updates with the bundle.

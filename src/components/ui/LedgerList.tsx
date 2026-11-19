export type LedgerEntry = {
  id: string
  label: string
  sub?: string
  /** Already formatted, including the sign the row should show. */
  amount: string
  /** Base units (wei or token minor units). Summed exactly; do not pass floats. */
  value: bigint
}

function signClass(value: bigint): 'in' | 'out' | 'flat' {
  if (value > 0n) return 'in'
  if (value < 0n) return 'out'
  return 'flat'
}

export function LedgerList({
  caption = 'Where the money went',
  entries,
  expectedTotal,
  totalLabel = 'Total',
  formatTotal = (value) => value.toString(),
}: {
  caption?: string
  entries: readonly LedgerEntry[]
  expectedTotal: bigint
  totalLabel?: string
  formatTotal?: (value: bigint) => string
}) {
  const actual = entries.reduce((sum, entry) => sum + entry.value, 0n)
  const reconciles = actual === expectedTotal

  return (
    <section className="ledger">
      <h3 className="ledger-caption">{caption}</h3>
      {entries.map((entry) => (
        <div className="ledger-row" key={entry.id}>
          <div className="ledger-label">
            {entry.label}
            {entry.sub ? <span className="ledger-sub">{entry.sub}</span> : null}
          </div>
          <p className={`ledger-amount ${signClass(entry.value)}`}>{entry.amount}</p>
        </div>
      ))}
      <div className="ledger-row ledger-total">
        <div className="ledger-label">{totalLabel}</div>
        <p className={`ledger-amount ${signClass(actual)}`}>{formatTotal(actual)}</p>
      </div>
      {reconciles ? null : (
        <p className="ledger-mismatch" role="alert">
          Does not reconcile. Rows sum to {formatTotal(actual)}; expected {formatTotal(expectedTotal)}.
        </p>
      )}
    </section>
  )
}

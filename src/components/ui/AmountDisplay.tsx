import type { ReactNode } from 'react'

export function AmountDisplay({
  amount,
  unit,
  sub,
  label,
}: {
  amount: string
  unit: string
  sub?: ReactNode
  label?: string
}) {
  return (
    <div className="amount-display">
      {label ? <p className="amount-label">{label}</p> : null}
      <p className="amount-figure">
        <span className="amount-value">{amount}</span>
        <span className="amount-unit">{unit}</span>
      </p>
      {sub ? <p className="amount-sub">{sub}</p> : null}
    </div>
  )
}

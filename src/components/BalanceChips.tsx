import type { AddressBalances } from '../chain/balances'

export function BalanceChips({ balances }: { balances: AddressBalances | null | undefined }) {
  if (!balances) {
    return (
      <div className="balance-chips" aria-busy="true" aria-label="Loading balances">
        <span className="chip chip-skeleton" />
        <span className="chip chip-skeleton" />
        <span className="chip chip-skeleton" />
      </div>
    )
  }

  return (
    <div className="balance-chips">
      <span
        className={`chip ${balances.native.status === 'unavailable' ? 'chip-warn' : ''}`}
        title={balances.native.error}
      >
        {balances.native.status === 'unavailable'
          ? `${balances.native.symbol}: unavailable`
          : `${balances.native.formatted} ${balances.native.symbol}`}
      </span>
      {balances.tokens.map((t) => (
        <span
          key={t.token.address}
          className={`chip ${t.status === 'unavailable' ? 'chip-warn' : ''}`}
          title={t.error}
        >
          {t.status === 'unavailable'
            ? `${t.token.symbol}: unavailable`
            : `${t.formatted} ${t.token.symbol}`}
        </span>
      ))}
    </div>
  )
}

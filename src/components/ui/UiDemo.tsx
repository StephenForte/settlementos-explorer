import { CopyButton } from '../CopyButton'
import {
  AmountDisplay,
  Breadcrumbs,
  DetailsPanel,
  LedgerList,
  PageSplit,
  ReceiptCard,
  StatusPill,
  TermTooltip,
} from './index'

function formatCents(value: bigint): string {
  const negative = value < 0n
  const absolute = negative ? -value : value
  const whole = absolute / 100n
  const fraction = (absolute % 100n).toString().padStart(2, '0')
  const digits = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const sign = negative ? '−' : value > 0n ? '+' : ''
  return `${sign}${digits}.${fraction}`
}

const ledger = [
  {
    id: 'principal',
    label: 'To escrow',
    sub: 'ACME US Inc',
    amount: '−10,000.00',
    value: -1000000n,
  },
  {
    id: 'fee',
    label: 'Settlement fee',
    sub: 'Cost',
    amount: '−1.25',
    value: -125n,
  },
] as const

export function UiDemo() {
  return (
    <div className="page">
      <p className="muted small">
        Sample gallery for the receipt primitives. Not a live transaction and not a price.
      </p>
      <Breadcrumbs
        items={[
          { label: 'Transactions', href: '/base-sepolia' },
          { label: '3ae8jL…ShWURb' },
        ]}
      />
      <PageSplit
        main={
          <ReceiptCard
            status={<StatusPill status="success">✓ Swap complete</StatusPill>}
            title="ACME US Inc paid Tokyo Trading KK · mockUSDC → mockJPY"
            note="Final · block 18,204,331"
            action={<CopyButton text="/dev/ui" label="Copy link" />}
          >
            <div className="amount-pair">
              <AmountDisplay label="Sent" amount="10,000.00" unit="mockUSDC" sub="Debited" />
              <AmountDisplay label="Received" amount="1,485,230" unit="mockJPY" sub="Credited" />
            </div>
            <LedgerList
              entries={ledger}
              expectedTotal={-1000125n}
              formatTotal={formatCents}
            />
          </ReceiptCard>
        }
        side={
          <DetailsPanel
            rows={[
              {
                id: 'hash',
                label: 'Hash',
                value: <span className="mono">3ae8jL…ShWURb</span>,
                sub: 'Base Sepolia',
              },
              { id: 'block', label: 'Block', value: '18204331', sub: '12 confirmations' },
              { id: 'time', label: 'Time', value: '2026-08-07 16:04 UTC' },
              {
                id: 'from',
                label: 'From',
                value: 'ACME US Inc',
                sub: <span className="mono">0xAEd2…9CA4</span>,
              },
              { id: 'to', label: 'To', value: 'Tokyo Trading KK' },
              { id: 'status', label: 'Status', value: 'Success' },
              {
                id: 'gas',
                label: <TermTooltip term="Gas" definition="Computation the sender paid for, in gas units." />,
                value: '148,221',
              },
              {
                id: 'nonce',
                label: (
                  <TermTooltip
                    term="Nonce"
                    definition="How many transactions the sender had already sent before this one."
                  />
                ),
                value: '29',
              },
            ]}
          />
        }
      />
      <ReceiptCard
        tone="failed"
        status={<StatusPill status="failed">Reverted</StatusPill>}
        title="Swap reverted"
        note="Nothing settled. The ledger is not a completed payment."
      >
        <div className="receipt-heading">
          <StatusPill status="pending">Pending</StatusPill>
          <StatusPill status="success">Success</StatusPill>
        </div>
      </ReceiptCard>
    </div>
  )
}

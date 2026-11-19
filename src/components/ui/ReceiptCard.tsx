import type { ReactNode } from 'react'

export function ReceiptCard({
  status,
  title,
  note,
  action,
  tone = 'default',
  children,
}: {
  status?: ReactNode
  title?: ReactNode
  note?: ReactNode
  action?: ReactNode
  tone?: 'default' | 'failed'
  children?: ReactNode
}) {
  const className = tone === 'failed' ? 'receipt-card receipt-card-failed' : 'receipt-card'
  return (
    <article className={className}>
      {status ? <div className="receipt-heading">{status}</div> : null}
      {title ? <h2 className="receipt-title">{title}</h2> : null}
      {note ? <p className="finality-note">{note}</p> : null}
      {children}
      {action ? <div className="receipt-actions">{action}</div> : null}
    </article>
  )
}

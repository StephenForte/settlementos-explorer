import { useState, type ReactNode } from 'react'

export type DetailRow = {
  id: string
  label: ReactNode
  value: ReactNode
  sub?: ReactNode
}

export function DetailsPanel({
  title = 'Technical details',
  rows,
  defaultOpen = true,
}: {
  title?: string
  rows: readonly DetailRow[]
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <section className="details-panel" data-open={open ? 'true' : 'false'}>
      <button
        type="button"
        className="details-summary"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {title}
      </button>
      {open ? (
        <dl className="details-rows">
          {rows.map((row) => (
            <div className="details-row" key={row.id}>
              <dt>{row.label}</dt>
              <dd>
                <div className="details-value">{row.value}</div>
                {row.sub != null && row.sub !== '' ? <div className="details-sub">{row.sub}</div> : null}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  )
}

import type { ReactNode } from 'react'

export type PillStatus = 'success' | 'pending' | 'failed'

export function StatusPill({ status, children }: { status: PillStatus; children: ReactNode }) {
  return <span className={`status-pill status-pill-${status}`}>{children}</span>
}

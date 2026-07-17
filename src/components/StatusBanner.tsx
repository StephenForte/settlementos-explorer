import type { ReactNode } from 'react'

export function StatusBanner({
  tone = 'info',
  children,
  action,
}: {
  tone?: 'info' | 'warn' | 'error'
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div className={`status-banner tone-${tone}`} role="status">
      <div>{children}</div>
      {action}
    </div>
  )
}

import type { ReactNode } from 'react'

/** External explorer deep link, or plain mono text when the network has none. */
export function ExplorerLink({
  href,
  children,
  className,
}: {
  href: string | null
  children: ReactNode
  className?: string
}) {
  if (!href) {
    return <span className={className}>{children}</span>
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" className={className}>
      {children}
    </a>
  )
}

import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { explorerTxUrl, type NetworkId } from '../config/networks'

/**
 * External explorer when the network has one (D34: external-wins); otherwise
 * an in-app link to `/{networkId}/tx/{hash}`.
 */
export function TxLink({
  networkId,
  hash,
  children,
  className,
}: {
  networkId: NetworkId
  hash: string
  children: ReactNode
  className?: string
}) {
  const external = explorerTxUrl(networkId, hash)
  if (external) {
    return (
      <a href={external} target="_blank" rel="noreferrer" className={className}>
        {children}
      </a>
    )
  }
  return (
    <Link to={`/${networkId}/tx/${hash.toLowerCase()}`} className={className}>
      {children}
    </Link>
  )
}

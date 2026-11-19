import type { ReactNode } from 'react'

/** Main column (~620px) and side column (~300px). Stacks at 900px. */
export function PageSplit({ main, side }: { main: ReactNode; side: ReactNode }) {
  return (
    <div className="page-split">
      <div className="page-split-main">{main}</div>
      <div className="page-split-side">{side}</div>
    </div>
  )
}

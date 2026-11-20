import { RelationshipGraph } from '../components/RelationshipGraph'
import { NETWORKS } from '../config/networks'
import { Breadcrumbs } from '../components/ui/Breadcrumbs'
import { ReceiptCard } from '../components/ui/ReceiptCard'
import { useNetworkParam } from '../hooks/useNetworkParam'
import '../styles/graph.css'

export function GraphPage() {
  const { networkId } = useNetworkParam()

  return (
    <div className="page graph-page">
      <Breadcrumbs
        items={[
          { label: NETWORKS[networkId].name, href: `/${networkId}` },
          { label: 'Graph' },
        ]}
      />
      <ReceiptCard
        title="Relationship graph"
        note="Known addresses as nodes; aggregated token flows as directed edges."
      />
      <div className="graph-frame">
        <RelationshipGraph networkId={networkId} />
      </div>
    </div>
  )
}

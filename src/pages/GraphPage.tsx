import { RelationshipGraph } from '../components/RelationshipGraph'
import { NETWORKS } from '../config/networks'
import { useNetworkParam } from '../hooks/useNetworkParam'

export function GraphPage() {
  const { networkId } = useNetworkParam()

  return (
    <div className="page graph-page">
      <section className="detail-header compact">
        <p className="eyebrow">{NETWORKS[networkId].name}</p>
        <h1>Relationship graph</h1>
        <p className="lede">
          Known addresses as nodes; aggregated token flows as directed edges.
        </p>
      </section>
      <RelationshipGraph networkId={networkId} />
    </div>
  )
}

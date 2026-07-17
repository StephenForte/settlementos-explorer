import { NavLink, Outlet } from 'react-router-dom'
import { NETWORKS } from '../config/networks'
import { useNetworkParam } from '../hooks/useNetworkParam'

export function AppShell() {
  const { networkId, setNetworkId } = useNetworkParam()

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <NavLink to={`/${networkId}`} className="brand">
            SettlementOS Explorer
          </NavLink>
          <p className="brand-tagline">
            Independent on-chain view · public data only · no secrets
          </p>
        </div>
        <nav className="nav-links" aria-label="Primary">
          <NavLink to={`/${networkId}`} end>
            Overview
          </NavLink>
          <NavLink to={`/${networkId}/graph`}>Graph</NavLink>
        </nav>
        <div className="network-switcher" role="group" aria-label="Network">
          {(Object.keys(NETWORKS) as Array<keyof typeof NETWORKS>).map((id) => (
            <button
              key={id}
              type="button"
              className={id === networkId ? 'active' : ''}
              onClick={() => setNetworkId(id)}
            >
              {NETWORKS[id].name}
            </button>
          ))}
        </div>
      </header>
      <main className="main">
        <Outlet />
      </main>
      <footer className="footer">
        Reads public RPCs and explorer APIs only. Every claim deep-links to{' '}
        {NETWORKS[networkId].explorerName}.
      </footer>
    </div>
  )
}

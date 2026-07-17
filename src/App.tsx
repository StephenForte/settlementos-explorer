import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { AddressDetailPage } from './pages/AddressDetailPage'
import { EntityPage } from './pages/EntityPage'
import { GraphPage } from './pages/GraphPage'
import { OverviewPage } from './pages/OverviewPage'

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/base-sepolia" replace />} />
        <Route path="/entity/:entityId" element={<EntityPage />} />
        <Route path="/:networkId" element={<OverviewPage />} />
        <Route path="/:networkId/graph" element={<GraphPage />} />
        <Route path="/:networkId/address/:address" element={<AddressDetailPage />} />
        <Route path="*" element={<Navigate to="/base-sepolia" replace />} />
      </Route>
    </Routes>
  )
}

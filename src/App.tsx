import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { AppShell } from './components/AppShell'
import { AddressDetailPage } from './pages/AddressDetailPage'
import { BlockPage } from './pages/BlockPage'
import { EntityPage } from './pages/EntityPage'
import { GraphPage } from './pages/GraphPage'
import { OverviewPage } from './pages/OverviewPage'
import {
  TransactionAliasPage,
  TransactionPage,
} from './pages/TransactionPage'

// Vite replaces import.meta.env.DEV at build time, so this route and its
// chunk are absent from production. Harmless if a dev server is what renders it.
const UiDemo = import.meta.env.DEV
  ? lazy(() =>
      import('./components/ui/UiDemo').then((module) => ({ default: module.UiDemo })),
    )
  : null

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/base-sepolia" replace />} />
        <Route path="/entity/:entityId" element={<EntityPage />} />
        <Route path="/tx/:txHash" element={<TransactionAliasPage />} />
        <Route path="/:networkId" element={<OverviewPage />} />
        <Route path="/:networkId/graph" element={<GraphPage />} />
        <Route path="/:networkId/address/:address" element={<AddressDetailPage />} />
        <Route path="/:networkId/tx/:txHash" element={<TransactionPage />} />
        <Route
          path="/:networkId/block/:blockNumberOrHash"
          element={<BlockPage />}
        />
        {UiDemo ? (
          <Route
            path="/dev/ui"
            element={
              <Suspense fallback={null}>
                <UiDemo />
              </Suspense>
            }
          />
        ) : null}
        <Route path="*" element={<Navigate to="/base-sepolia" replace />} />
      </Route>
    </Routes>
  )
}

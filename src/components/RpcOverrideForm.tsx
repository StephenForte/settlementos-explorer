import { useId, useState, type FormEvent } from 'react'
import type { NetworkId } from '../config/networks'
import { NETWORKS } from '../config/networks'
import {
  clearNetworkRpcOverride,
  setNetworkRpcOverride,
} from '../lib/clients'
import { getRpcOverride } from '../lib/rpc-overrides'

export function RpcOverrideForm({
  networkId,
  defaultOpen = false,
  onChanged,
}: {
  networkId: NetworkId
  /** Open the form when balances are unavailable. */
  defaultOpen?: boolean
  /** Parent should retry balances/transfers after a successful set or clear. */
  onChanged?: () => void
}) {
  const inputId = useId()
  const existing = getRpcOverride(networkId)
  const [open, setOpen] = useState(defaultOpen || Boolean(existing))
  const [draft, setDraft] = useState(existing ?? '')
  const [error, setError] = useState<string | null>(null)
  const [savedUrl, setSavedUrl] = useState<string | undefined>(existing)

  const networkName = NETWORKS[networkId].name

  function handleSave(event: FormEvent) {
    event.preventDefault()
    const result = setNetworkRpcOverride(networkId, draft)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setError(null)
    setSavedUrl(result.url)
    setDraft(result.url)
    onChanged?.()
  }

  function handleClear() {
    clearNetworkRpcOverride(networkId)
    setSavedUrl(undefined)
    setDraft('')
    setError(null)
    onChanged?.()
  }

  return (
    <div className="rpc-override">
      <button
        type="button"
        className="rpc-override-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {savedUrl
          ? `Custom RPC for ${networkName}`
          : `Set RPC for ${networkName}`}
      </button>
      {open ? (
        <form className="rpc-override-form" onSubmit={handleSave}>
          <p className="rpc-override-privacy">
            Addresses you view will be sent to this host. Only use an endpoint
            you trust. The value is stored in this browser after you save.
          </p>
          <label className="rpc-override-label" htmlFor={inputId}>
            RPC URL
          </label>
          <input
            id={inputId}
            className="rpc-override-input"
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="https://"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value)
              setError(null)
            }}
          />
          {error ? (
            <p className="rpc-override-error" role="alert">
              {error}
            </p>
          ) : null}
          {savedUrl ? (
            <p className="rpc-override-current muted small">
              Active override: <span className="mono break">{savedUrl}</span>
            </p>
          ) : null}
          <div className="rpc-override-actions">
            <button type="submit" className="btn-primary">
              Save RPC
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={handleClear}
              disabled={!savedUrl}
            >
              Use default
            </button>
          </div>
        </form>
      ) : null}
    </div>
  )
}

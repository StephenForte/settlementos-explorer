import { useMemo } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { isNetworkId, type NetworkId } from '../config/networks'

const DEFAULT: NetworkId = 'base-sepolia'

export function useNetworkParam(): {
  networkId: NetworkId
  setNetworkId: (id: NetworkId) => void
} {
  const params = useParams()
  const location = useLocation()
  const navigate = useNavigate()

  const networkId = useMemo(() => {
    if (params.networkId && isNetworkId(params.networkId)) {
      return params.networkId
    }
    const search = new URLSearchParams(location.search).get('network')
    if (search && isNetworkId(search)) return search
    return DEFAULT
  }, [params.networkId, location.search])

  const setNetworkId = (id: NetworkId) => {
    const path = location.pathname
    if (params.networkId && isNetworkId(params.networkId)) {
      const next = path.replace(`/${params.networkId}`, `/${id}`)
      navigate({ pathname: next, search: location.search })
      return
    }
    const search = new URLSearchParams(location.search)
    search.set('network', id)
    navigate({ pathname: path, search: search.toString() })
  }

  return { networkId, setNetworkId }
}

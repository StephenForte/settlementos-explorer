import { useEffect, useRef, useState } from 'react'

export type AsyncState<T> =
  | { status: 'loading' }
  | { status: 'ok'; data: T }
  | { status: 'error'; error: string }

export function useAsync<T>(
  key: string,
  fn: () => Promise<T>,
): AsyncState<T> & { retry: () => void } {
  const [tick, setTick] = useState(0)
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' })
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    fnRef
      .current()
      .then((data) => {
        if (!cancelled) setState({ status: 'ok', data })
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            status: 'error',
            error: err instanceof Error ? err.message : 'Request failed',
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [key, tick])

  return {
    ...state,
    retry: () => setTick((t) => t + 1),
  }
}

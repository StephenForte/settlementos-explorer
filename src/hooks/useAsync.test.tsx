import { act, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useAsync } from './useAsync'

function Probe({
  keyName,
  fn,
}: {
  keyName: string
  fn: () => Promise<string>
}) {
  const state = useAsync(keyName, fn)
  return (
    <div>
      <span data-testid="status">{state.status}</span>
      {state.status === 'ok' ? <span data-testid="data">{state.data}</span> : null}
      {state.status === 'error' ? (
        <span data-testid="error">{state.error}</span>
      ) : null}
      <button type="button" onClick={state.retry}>
        Retry
      </button>
    </div>
  )
}

describe('useAsync', () => {
  it('loads data successfully', async () => {
    render(<Probe keyName="ok" fn={async () => 'hello'} />)
    expect(screen.getByTestId('status').textContent).toBe('loading')
    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('ok')
    })
    expect(screen.getByTestId('data').textContent).toBe('hello')
  })

  it('surfaces errors and retries', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('recovered')

    render(<Probe keyName="err" fn={fn} />)
    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('error')
    })
    expect(screen.getByTestId('error').textContent).toBe('boom')

    await act(async () => {
      screen.getByRole('button', { name: 'Retry' }).click()
    })
    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('ok')
    })
    expect(screen.getByTestId('data').textContent).toBe('recovered')
  })
})

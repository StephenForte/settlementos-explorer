import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearNetworkRpcOverride,
  resolveRpcUrls,
} from '../lib/clients'
import { RPC_OVERRIDE_STORAGE_KEY } from '../lib/rpc-overrides'
import { RpcOverrideForm } from './RpcOverrideForm'

afterEach(() => {
  localStorage.removeItem(RPC_OVERRIDE_STORAGE_KEY)
  clearNetworkRpcOverride('polygon-amoy')
})

describe('RpcOverrideForm', () => {
  it('states the privacy surface and requires an explicit Save', () => {
    const onChanged = vi.fn()
    render(
      <RpcOverrideForm
        networkId="polygon-amoy"
        defaultOpen
        onChanged={onChanged}
      />,
    )

    expect(
      screen.getByText(/Addresses you view will be sent to this host/i),
    ).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/RPC URL/i), {
      target: { value: 'https://custom-amoy.example/rpc' },
    })
    expect(resolveRpcUrls('polygon-amoy')[0]).not.toBe(
      'https://custom-amoy.example/rpc',
    )

    fireEvent.click(screen.getByRole('button', { name: /Save RPC/i }))
    expect(resolveRpcUrls('polygon-amoy')).toEqual([
      'https://custom-amoy.example/rpc',
    ])
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  it('rejects non-HTTP schemes in the UI', () => {
    render(<RpcOverrideForm networkId="polygon-amoy" defaultOpen />)

    fireEvent.change(screen.getByLabelText(/RPC URL/i), {
      target: { value: 'javascript:alert(1)' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Save RPC/i }))

    expect(screen.getByRole('alert')).toHaveTextContent(/http: and https:/i)
    expect(localStorage.getItem(RPC_OVERRIDE_STORAGE_KEY)).toBeNull()
  })

  it('Use default clears the override and notifies the parent', () => {
    const onChanged = vi.fn()
    const defaults = resolveRpcUrls('polygon-amoy')

    render(
      <RpcOverrideForm
        networkId="polygon-amoy"
        defaultOpen
        onChanged={onChanged}
      />,
    )
    fireEvent.change(screen.getByLabelText(/RPC URL/i), {
      target: { value: 'https://temp.example/rpc' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Save RPC/i }))
    fireEvent.click(screen.getByRole('button', { name: /Use default/i }))

    expect(resolveRpcUrls('polygon-amoy')).toEqual(defaults)
    expect(onChanged).toHaveBeenCalledTimes(2)
  })
})

/** Minimal ERC-20 fragments used for balance and Transfer log reads. */
export const erc20Abi = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'event',
    name: 'Transfer',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'value', type: 'uint256', indexed: false },
    ],
  },
] as const

/** PaymentSettlement escrow lifecycle events only (no write functions). */
export const paymentSettlementEventsAbi = [
  {
    type: 'event',
    name: 'PaymentInitiated',
    inputs: [
      { name: 'paymentId', type: 'bytes32', indexed: true },
      { name: 'sender', type: 'address', indexed: true },
      { name: 'recipient', type: 'address', indexed: true },
      { name: 'asset', type: 'address', indexed: false },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'sourceCurrency', type: 'string', indexed: false },
      { name: 'destinationCurrency', type: 'string', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'PaymentSettled',
    inputs: [
      { name: 'paymentId', type: 'bytes32', indexed: true },
      { name: 'routeId', type: 'bytes32', indexed: false },
      { name: 'settledAmount', type: 'uint256', indexed: false },
      { name: 'destinationAsset', type: 'string', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'PaymentRefunded',
    inputs: [
      { name: 'paymentId', type: 'bytes32', indexed: true },
      { name: 'refundedTo', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
] as const

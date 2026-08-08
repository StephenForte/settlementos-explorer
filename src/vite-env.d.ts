/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ETHERSCAN_API_KEY?: string
  readonly VITE_FORTEL2_SEPOLIA_RPC_URL?: string
  readonly VITE_FORTEL2_SEPOLIA_READ_RPC_URL?: string
  readonly VITE_POLYGON_AMOY_RPC_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

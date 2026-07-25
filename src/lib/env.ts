/**
 * Env helpers that work in Vite (browser) and Node (MCP server).
 */

function processEnv(): Record<string, string | undefined> | undefined {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env
}

/** Read a Vite (`VITE_*`) or Node env var; first non-empty wins. */
export function getEnv(...names: string[]): string | undefined {
  const env = processEnv()
  for (const name of names) {
    if (name.startsWith('VITE_')) {
      const viteVal = (import.meta.env as Record<string, string | undefined> | undefined)?.[
        name
      ]
      if (typeof viteVal === 'string' && viteVal.trim()) return viteVal.trim()
    }
    const nodeVal = env?.[name]?.trim()
    if (nodeVal) return nodeVal
  }
  return undefined
}

export function getEtherscanApiKey(): string | undefined {
  return getEnv('VITE_ETHERSCAN_API_KEY', 'ETHERSCAN_API_KEY')
}

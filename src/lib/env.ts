/**
 * Env helpers that work in Vite (browser) and Node (MCP server).
 */

export function getEtherscanApiKey(): string | undefined {
  const viteKey = import.meta.env?.VITE_ETHERSCAN_API_KEY
  if (typeof viteKey === 'string' && viteKey.trim()) {
    return viteKey.trim()
  }

  const env = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process?.env
  const nodeKey =
    env?.VITE_ETHERSCAN_API_KEY?.trim() || env?.ETHERSCAN_API_KEY?.trim()
  return nodeKey || undefined
}

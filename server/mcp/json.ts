/** JSON helpers that stringify bigint fields as decimal strings. */

export function toJsonSafe(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (_key, v) =>
      typeof v === 'bigint' ? v.toString() : v,
    ),
  )
}

export function textJson(items: unknown[]) {
  const payload = items.length === 1 ? items[0] : items
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(toJsonSafe(payload), null, 2),
      },
    ],
  }
}

export function toolError(message: string) {
  return {
    isError: true,
    content: [{ type: 'text' as const, text: message }],
  }
}

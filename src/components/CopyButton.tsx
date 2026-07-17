import { useState } from 'react'
import { copyText } from '../lib/format'

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <button
      type="button"
      className="btn-ghost"
      aria-label={label}
      onClick={async () => {
        const ok = await copyText(text)
        if (ok) {
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1200)
        }
      }}
    >
      {copied ? 'Copied' : label}
    </button>
  )
}

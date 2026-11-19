import { useId } from 'react'

export function TermTooltip({ term, definition }: { term: string; definition: string }) {
  const id = useId()
  return (
    <span className="term">
      <button type="button" className="term-trigger" aria-describedby={id}>
        {term}
      </button>
      <span role="tooltip" id={id} className="term-tooltip">
        {definition}
      </span>
    </span>
  )
}

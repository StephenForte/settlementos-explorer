import { Link } from 'react-router'

export type Crumb = {
  label: string
  href?: string
}

export function Breadcrumbs({ items }: { items: readonly Crumb[] }) {
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <ol>
        {items.map((item, index) => {
          const current = index === items.length - 1
          return (
            <li key={`${item.label}-${index}`}>
              {item.href && !current ? (
                <Link to={item.href}>{item.label}</Link>
              ) : (
                <span aria-current={current ? 'page' : undefined}>{item.label}</span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

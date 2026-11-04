import type { LucideIcon } from 'lucide-react'

export function SectionSkeleton({ rows = 3 }: { rows?: number }) {
  return <div className="state-skeleton" aria-label="Loading" aria-busy="true">
    {Array.from({ length: rows }, (_, index) => <div className="state-skeleton-row" key={index}>
      <span className="skeleton state-skeleton-thumb" />
      <span className="state-skeleton-copy"><i className="skeleton" /><i className="skeleton short" /></span>
    </div>)}
  </div>
}

export function EmptyState({ icon: Icon, title, hint, action }: { icon?: LucideIcon; title: string; hint?: string; action?: React.ReactNode }) {
  return <div className="owner-empty state-empty">{Icon && <Icon size={26} />}<h3>{title}</h3>{hint && <p>{hint}</p>}{action}</div>
}

export function ErrorState({ title = 'Could not load this section', hint, retry }: { title?: string; hint?: string; retry?: () => void }) {
  return <div className="owner-empty state-empty state-error"><h3>{title}</h3>{hint && <p>{hint}</p>}{retry && <button className="owner-button" type="button" onClick={retry}>Try again</button>}</div>
}

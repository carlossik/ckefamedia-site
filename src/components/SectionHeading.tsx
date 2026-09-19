import type { ReactNode } from 'react'

export function SectionHeading({
  eyebrow,
  title,
  copy,
  action,
  align = 'left',
}: {
  eyebrow: string
  title: string
  copy?: string
  action?: ReactNode
  align?: 'left' | 'centre'
}) {
  return (
    <div className={`section-heading section-heading--${align}`}>
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
        {copy ? <p>{copy}</p> : null}
      </div>
      {action ? <div className="section-heading__action">{action}</div> : null}
    </div>
  )
}

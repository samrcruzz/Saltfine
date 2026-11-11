// White panel with an optional small uppercase title, as in the manuscript mockups.
export default function Card({ title, action, children, className = '', bodyClassName = '' }) {
  const hasHeader = Boolean(title || action)

  return (
    <section
      className={`rounded-xl border border-line bg-panel shadow-[0_1px_2px_rgb(22_32_44/0.04)] ${className}`}
    >
      {hasHeader && (
        <header className="flex min-h-9 items-center justify-between gap-3 px-5 pt-4">
          <h2 className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-ink-500">
            {title}
          </h2>
          {action}
        </header>
      )}
      <div className={`px-5 pb-5 ${hasHeader ? 'pt-3' : 'pt-5'} ${bodyClassName}`}>{children}</div>
    </section>
  )
}

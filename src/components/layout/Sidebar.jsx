import { APP_NAME, GRADE_META, GRADES } from '../../config.js'

// Fixed navigation for desktop widths (>= 1280px).
export default function Sidebar({ pages, activeId }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-navy-900 text-white xl:flex">
      <div className="px-6 pb-7 pt-7">
        <div className="text-[1.6rem] font-bold leading-none tracking-[0.09em]">{APP_NAME}</div>
        <p className="mt-2.5 text-[0.8rem] leading-snug text-navy-300">
          Sea Salt Fineness
          <br />
          Classification System
        </p>
      </div>

      <nav aria-label="Main" className="flex-1">
        <ul>
          {pages.map(({ id, label, icon: Icon }) => {
            const active = id === activeId
            return (
              <li key={id}>
                <a
                  href={`#/${id}`}
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center gap-3 border-l-4 py-3.5 pl-5 pr-4 text-[0.95rem] transition-colors ${
                    active
                      ? 'border-brine-500 bg-navy-700 font-semibold text-white'
                      : 'border-transparent text-navy-200 hover:bg-navy-800 hover:text-white'
                  }`}
                >
                  <Icon className="size-[1.1rem] shrink-0" aria-hidden="true" />
                  {label}
                </a>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Reference: the particle-size range behind each grade. */}
      <div className="border-t border-white/10 px-6 py-5">
        <h2 className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-navy-300">
          Fineness grades
        </h2>
        <ul className="mt-3 space-y-2 text-sm">
          {GRADES.map((grade) => (
            <li key={grade} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2.5 text-navy-200">
                <span
                  className="size-2.5 rounded-[3px]"
                  style={{ backgroundColor: GRADE_META[grade].colorOnDark }}
                  aria-hidden="true"
                />
                {grade}
              </span>
              <span className="font-mono text-[0.72rem] text-navy-300">{GRADE_META[grade].range}</span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  )
}

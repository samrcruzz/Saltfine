import { APP_NAME, APP_TAGLINE } from '../../config.js'

// Navigation for tablet and phone widths (< 1280px): the three tabs stay
// visible across the top instead of hiding behind a menu button.
export default function TopNav({ pages, activeId }) {
  return (
    <div className="sticky top-0 z-30 bg-navy-900 text-white xl:hidden">
      <div className="flex items-baseline gap-3 px-4 pt-3 sm:px-5 lg:px-8">
        <span className="text-lg font-bold tracking-[0.09em]">{APP_NAME}</span>
        <span className="hidden text-xs text-navy-300 sm:inline">{APP_TAGLINE}</span>
      </div>

      <nav aria-label="Main" className="mt-1.5 flex gap-1 overflow-x-auto px-2 sm:px-3 lg:px-6">
        {pages.map(({ id, shortLabel, icon: Icon }) => {
          const active = id === activeId
          return (
            <a
              key={id}
              href={`#/${id}`}
              aria-current={active ? 'page' : undefined}
              className={`flex shrink-0 items-center gap-2 border-b-[3px] px-3 py-2.5 text-sm transition-colors ${
                active
                  ? 'border-brine-500 font-semibold text-white'
                  : 'border-transparent text-navy-200 hover:text-white'
              }`}
            >
              <Icon className="size-4" aria-hidden="true" />
              {shortLabel}
            </a>
          )
        })}
      </nav>
    </div>
  )
}

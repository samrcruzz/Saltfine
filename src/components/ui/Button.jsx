const VARIANTS = {
  primary: 'bg-navy-800 text-white hover:bg-navy-700 active:bg-navy-900 border border-transparent',
  secondary: 'bg-panel text-ink-900 border border-line hover:bg-canvas active:bg-line-soft',
  ghost: 'text-ink-700 hover:bg-canvas border border-transparent',
}

const SIZES = {
  md: 'h-10 px-4 text-sm',
  sm: 'h-8 px-3 text-[0.8rem]',
}

export default function Button({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  className = '',
  children,
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      className={`inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md font-semibold transition-colors disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    >
      {Icon && <Icon className="size-4" aria-hidden="true" />}
      {children}
    </button>
  )
}

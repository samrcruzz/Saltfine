export interface DemoBadgeProps {
  className?: string
}

/** Marks a simulated demo record (is_demo), so it is never mistaken for a measured result. */
export default function DemoBadge({ className = '' }: DemoBadgeProps) {
  return (
    <span
      title="Simulated demo data, not measured from a photo"
      className={`inline-flex items-center rounded border border-amber-500/40 bg-amber-500/15 px-1.5 py-0.5 font-sans text-[0.65rem] font-bold uppercase tracking-wider text-amber-400 ${className}`}
    >
      Demo
    </span>
  )
}

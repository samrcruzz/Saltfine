import { GRADE_META } from '../../config.js'

// Colored pill for a fineness grade (Fine / Medium / Coarse).
export default function GradeBadge({ grade, className = '' }) {
  const meta = GRADE_META[grade]
  if (!meta) return <span className={className}>{grade}</span>

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.8rem] font-semibold ${meta.badge} ${className}`}
    >
      {grade}
    </span>
  )
}

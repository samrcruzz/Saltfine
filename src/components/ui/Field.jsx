import { useId } from 'react'
import { GRADES } from '../../config.js'

export const inputClass =
  'h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-ink-900 placeholder:text-ink-400 hover:border-navy-300 focus-visible:border-brine-600'

// Label + control wrapper. `children` receives the generated id.
export function Field({ label, className = '', children }) {
  const id = useId()
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-[0.8rem] font-medium text-ink-700">
        {label}
      </label>
      {children(id)}
    </div>
  )
}

export function DateField({ label, value, onChange, min, max, className }) {
  return (
    <Field label={label} className={className}>
      {(id) => (
        <input
          id={id}
          type="date"
          value={value}
          min={min || undefined}
          max={max || undefined}
          onChange={(event) => onChange(event.target.value)}
          className={`${inputClass} tabular-nums`}
        />
      )}
    </Field>
  )
}

export function GradeSelect({ label = 'Fineness grade', value, onChange, className }) {
  return (
    <Field label={label} className={className}>
      {(id) => (
        <select
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={inputClass}
        >
          <option value="All">All grades</option>
          {GRADES.map((grade) => (
            <option key={grade} value={grade}>
              {grade}
            </option>
          ))}
        </select>
      )}
    </Field>
  )
}

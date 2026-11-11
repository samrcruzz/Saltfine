import { RotateCcw, Search } from 'lucide-react'
import Button from '../ui/Button.jsx'
import Card from '../ui/Card.jsx'
import { DateField, Field, GradeSelect, inputClass } from '../ui/Field.jsx'

// Search and filter controls for the Salt-Record Log. Filters are applied
// with the button (or Enter), matching a query sent to the backend.
export default function RecordFilters({ value, onChange, onApply, onReset, canReset }) {
  const set = (key) => (next) => onChange({ ...value, [key]: next })

  return (
    <Card title="Search and filter">
      <form
        className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-6 min-[1400px]:flex min-[1400px]:items-end"
        onSubmit={(event) => {
          event.preventDefault()
          onApply()
        }}
      >
        <DateField
          label="Date from"
          value={value.from}
          max={value.to}
          onChange={set('from')}
          className="md:col-span-2 min-[1400px]:w-40"
        />
        <DateField
          label="Date to"
          value={value.to}
          min={value.from}
          onChange={set('to')}
          className="md:col-span-2 min-[1400px]:w-40"
        />
        <GradeSelect
          value={value.grade}
          onChange={set('grade')}
          className="col-span-2 md:col-span-2 min-[1400px]:w-40"
        />
        <Field label="Sample / Batch ID" className="col-span-2 md:col-span-4 min-[1400px]:min-w-0 min-[1400px]:flex-1">
          {(id) => (
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400"
                aria-hidden="true"
              />
              <input
                id={id}
                type="search"
                value={value.query}
                onChange={(event) => set('query')(event.target.value)}
                placeholder="Search sample or batch ID…"
                autoComplete="off"
                className={`${inputClass} pl-9`}
              />
            </div>
          )}
        </Field>
        <div className="col-span-2 flex items-end gap-3 md:col-span-2">
          <Button type="submit" variant="primary" className="flex-1 min-[1400px]:flex-none">
            Apply Filter
          </Button>
          <Button onClick={onReset} disabled={!canReset} icon={RotateCcw}>
            Reset
          </Button>
        </div>
      </form>
    </Card>
  )
}

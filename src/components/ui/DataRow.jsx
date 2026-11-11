// One "label ........ value" line. Use inside <dl className="divide-y divide-line-soft">.
export default function DataRow({ label, children, mono = false }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="text-sm text-ink-500">{label}</dt>
      <dd
        className={`text-right font-semibold text-ink-900 tabular-nums ${
          mono ? 'font-mono text-[0.86rem] font-medium' : 'text-[0.95rem]'
        }`}
      >
        {children}
      </dd>
    </div>
  )
}

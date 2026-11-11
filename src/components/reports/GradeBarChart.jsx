import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { GRADE_META } from '../../config.js'
import Card from '../ui/Card.jsx'

const AXIS_INK = '#5b6877'
const MUTED_INK = '#7d8996'
const GRID = '#e6eaef'
const BASELINE = '#c3ccd6'

function ChartTooltip({ active, payload, renderDetail }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload

  return (
    <div className="rounded-lg border border-line bg-panel px-3 py-2 text-sm shadow-md">
      <div className="flex items-center gap-2 font-semibold text-ink-900">
        <span
          className="size-2.5 rounded-[3px]"
          style={{ backgroundColor: GRADE_META[row.grade].color }}
          aria-hidden="true"
        />
        {row.grade}
        <span className="font-mono text-[0.72rem] font-normal text-ink-400">
          {GRADE_META[row.grade].range}
        </span>
      </div>
      <div className="mt-1 text-ink-700">{renderDetail(row)}</div>
    </div>
  )
}

// One value per fineness grade, drawn as three columns. Each grade keeps its
// own color everywhere in the dashboard, and the value sits on top of its bar.
export default function GradeBarChart({
  title,
  data,
  dataKey,
  formatValue,
  renderDetail,
  allowDecimals = false,
  summary,
}) {
  return (
    <Card title={title}>
      <div role="img" aria-label={summary}>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data} margin={{ top: 26, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis
              dataKey="grade"
              tickLine={false}
              axisLine={{ stroke: BASELINE }}
              tick={{ fill: AXIS_INK, fontSize: 13 }}
              tickMargin={8}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={44}
              allowDecimals={allowDecimals}
              tick={{ fill: MUTED_INK, fontSize: 12 }}
            />
            <Tooltip
              cursor={{ fill: 'rgb(22 32 44 / 0.05)' }}
              content={<ChartTooltip renderDetail={renderDetail} />}
            />
            <Bar dataKey={dataKey} maxBarSize={44} radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {data.map((row) => (
                <Cell key={row.grade} fill={GRADE_META[row.grade].color} />
              ))}
              <LabelList
                dataKey={dataKey}
                position="top"
                offset={8}
                formatter={formatValue}
                fill="#16202c"
                fontSize={13}
                fontWeight={600}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}

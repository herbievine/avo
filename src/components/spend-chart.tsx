import { useRef, useState } from 'react'

import { formatCents } from '#/lib/money'

export type DayPoint = {
  date: string // YYYY-MM-DD
  day: number // 1-based
  dayCents: number
  cumulativeCents: number
}

/** Running total of debits, one point per elapsed day of the month. */
export function cumulativePoints(
  month: string,
  daysInMonth: number,
  daily: Array<{ date: string; spentCents: number }>,
  today: string,
): DayPoint[] {
  const byDate = new Map(daily.map((d) => [d.date, d.spentCents]))
  const points: DayPoint[] = []
  let running = 0
  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${month}-${String(day).padStart(2, '0')}`
    if (date > today) break
    const dayCents = byDate.get(date) ?? 0
    running += dayCents
    points.push({ date, day, dayCents, cumulativeCents: running })
  }
  return points
}

const W = 100
const H = 40
const TOP_PAD = 3

/**
 * Cumulative spend line. Hover, or press and hold on touch, to scrub; the parent
 * receives the day under the pointer via onScrub and renders the readout.
 */
export function SpendChart({
  points,
  daysInMonth,
  onScrub,
}: {
  points: DayPoint[]
  daysInMonth: number
  onScrub: (point: DayPoint | null) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState<DayPoint | null>(null)

  const max = Math.max(1, ...points.map((p) => p.cumulativeCents))
  const x = (day: number) => (daysInMonth === 1 ? 0 : ((day - 1) / (daysInMonth - 1)) * W)
  const y = (cents: number) => H - (cents / max) * (H - TOP_PAD)

  const line = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.day)} ${y(p.cumulativeCents)}`)
    .join(' ')
  const last = points.at(-1)
  const area = last ? `${line} L${x(last.day)} ${H} L${x(1)} ${H} Z` : ''

  function scrubTo(clientX: number) {
    const el = ref.current
    if (!el || points.length === 0) return
    const rect = el.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    const day = Math.round(ratio * (daysInMonth - 1)) + 1
    const point = points[Math.min(points.length, day) - 1]
    setActive(point)
    onScrub(point)
  }

  function stop() {
    setActive(null)
    onScrub(null)
  }

  return (
    <div
      ref={ref}
      className="relative h-28 w-full cursor-crosshair select-none touch-none sm:h-32"
      onPointerDown={(e) => scrubTo(e.clientX)}
      onPointerMove={(e) => {
        if (e.pointerType === 'mouse' || e.buttons > 0) scrubTo(e.clientX)
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onPointerLeave={stop}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="absolute inset-0 size-full overflow-visible"
        aria-hidden="true"
      >
        {area && <path d={area} fill="currentColor" fillOpacity={0.12} />}
        {line && (
          <path
            d={line}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      {/* Hairline + marker live in HTML so they don't stretch with the SVG. */}
      {active && (
        <>
          <div
            className="pointer-events-none absolute inset-y-0 w-px bg-current opacity-40"
            style={{ left: `${x(active.day)}%` }}
          />
          <div
            className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current ring-2 ring-foreground"
            style={{ left: `${x(active.day)}%`, top: `${(y(active.cumulativeCents) / H) * 100}%` }}
          />
        </>
      )}
      {/* End marker for the latest day when idle. */}
      {!active && last && (
        <div
          className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current ring-2 ring-foreground"
          style={{ left: `${x(last.day)}%`, top: `${(y(last.cumulativeCents) / H) * 100}%` }}
        />
      )}
    </div>
  )
}

const dayLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })

/** Black hero card: month total, or the scrubbed day's running total while holding. */
export function SpendHero({
  month,
  daysInMonth,
  daily,
  totalCents,
}: {
  month: string
  daysInMonth: number
  daily: Array<{ date: string; spentCents: number }>
  totalCents: number
}) {
  const [scrub, setScrub] = useState<DayPoint | null>(null)
  const today = new Date().toISOString().slice(0, 10)
  const points = cumulativePoints(month, daysInMonth, daily, today)

  return (
    <section className="rounded-2xl bg-foreground p-6 text-background sm:p-8">
      <p className="text-sm text-background/70">
        {scrub ? `Spent by ${dayLabel(scrub.date)}` : 'Spent this month'}
      </p>
      <p className="mt-1 text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">
        {formatCents(scrub ? scrub.cumulativeCents : totalCents)}
      </p>
      <p className="mt-1 h-5 text-sm text-background/70 tabular-nums">
        {scrub
          ? scrub.dayCents > 0
            ? `${formatCents(scrub.dayCents)} that day`
            : 'Nothing that day'
          : points.length > 0
            ? 'Hold the chart to see a day'
            : ''}
      </p>
      <div className="mt-4">
        <SpendChart points={points} daysInMonth={daysInMonth} onScrub={setScrub} />
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-background/60">
        <span>1</span>
        <span>{daysInMonth}</span>
      </div>
    </section>
  )
}

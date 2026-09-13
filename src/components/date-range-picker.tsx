import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { CalendarIcon } from 'lucide-react'
import type { DateRange } from 'react-day-picker'

import { daysAgoISO, monthRange, todayISO } from '#/lib/dates'
import { currentMonth } from '#/lib/money'
import { useIsMobile } from '#/hooks/use-mobile'
import { Button } from '#/components/ui/button'
import { Calendar } from '#/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '#/components/ui/popover'

type Range = { from: string; to: string }

function previousMonth() {
  const [y, m] = currentMonth().split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 2, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

const PRESETS: Array<{ label: string; range: () => Range }> = [
  { label: 'This month', range: () => monthRange() },
  { label: 'Last month', range: () => monthRange(previousMonth()) },
  { label: 'Last 30 days', range: () => ({ from: daysAgoISO(30), to: todayISO() }) },
  { label: 'Last 90 days', range: () => ({ from: daysAgoISO(90), to: todayISO() }) },
]

const toISO = (d: Date) => format(d, 'yyyy-MM-dd')
const label = (iso: string) => format(parseISO(iso), 'd MMM yyyy')

export function DateRangePicker({
  value,
  onChange,
  className,
}: {
  value: Range
  onChange: (range: Range) => void
  className?: string
}) {
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<DateRange | undefined>()

  const selected = draft ?? { from: parseISO(value.from), to: parseISO(value.to) }

  function commit(range: Range) {
    onChange(range)
    setDraft(undefined)
    setOpen(false)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setDraft(undefined)
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" className={`justify-start font-normal ${className ?? ''}`}>
          <CalendarIcon className="text-muted-foreground" />
          <span className="truncate">
            {label(value.from)} – {label(value.to)}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[calc(100vw-2rem)] max-w-md p-0 sm:w-auto sm:max-w-none"
        align="start"
        collisionPadding={16}
      >
        <div className="flex flex-col sm:flex-row">
          <div className="grid grid-cols-2 gap-1 border-b p-2 sm:flex sm:flex-col sm:border-r sm:border-b-0">
            {PRESETS.map((p) => (
              <Button
                key={p.label}
                variant="ghost"
                size="sm"
                className="justify-start whitespace-nowrap"
                onClick={() => commit(p.range())}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <Calendar
            className="mx-auto"
            mode="range"
            defaultMonth={selected.from}
            selected={selected}
            numberOfMonths={isMobile ? 1 : 2}
            onSelect={(r) => {
              setDraft(r)
              if (r?.from && r.to) commit({ from: toISO(r.from), to: toISO(r.to) })
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}

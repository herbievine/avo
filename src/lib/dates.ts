import { currentMonth } from './money'

/** First and last day of a YYYY-MM month as YYYY-MM-DD. */
export function monthRange(month = currentMonth()) {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` }
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export function daysAgoISO(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
}

/** Default search params for the transactions page: this month, newest first. */
export function defaultTransactionsSearch() {
  return { ...monthRange(), page: 1, sort: 'date' as const, dir: 'desc' as const }
}

/** Shift a YYYY-MM month by n months. */
export function shiftMonth(month: string, n: number) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export function monthLabel(month: string) {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

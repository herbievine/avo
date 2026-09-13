import { Await, Link, createFileRoute, linkOptions, type LinkOptions } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { z } from 'zod'

import { monthSchema, monthSummaryFn, recurringFn } from '#/fns/transactions'
import { monthLabel, monthRange, shiftMonth } from '#/lib/dates'
import { currentMonth, formatCents } from '#/lib/money'
import { SpendHero } from '#/components/spend-chart'
import { Button } from '#/components/ui/button'
import { Skeleton } from '#/components/ui/skeleton'

export const Route = createFileRoute('/_authed/')({
  validateSearch: z.object({ month: monthSchema.optional().catch(undefined) }),
  loaderDeps: ({ search }) => ({ month: search.month ?? currentMonth() }),
  loader: ({ deps }) => ({
    month: deps.month,
    // Not awaited: the shell renders immediately and the summary streams in.
    summary: monthSummaryFn({ data: deps.month }),
    recurring: recurringFn(),
  }),
  component: Overview,
})

function Overview() {
  const { month, summary, recurring } = Route.useLoaderData()
  const isCurrent = month === currentMonth()
  const range = monthRange(month)
  const txSearch = { ...range, page: 1, sort: 'date' as const, dir: 'desc' as const }

  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Spending</p>
          <h1 className="text-2xl font-semibold tracking-tight">{monthLabel(month)}</h1>
        </div>
        <div className="flex items-center gap-1">
          <Button asChild variant="outline" size="icon" className="size-8">
            <Link to="/" search={{ month: shiftMonth(month, -1) }} aria-label="Previous month">
              <ChevronLeft />
            </Link>
          </Button>
          <Button asChild variant="outline" size="icon" className="size-8" disabled={isCurrent}>
            <Link
              to="/"
              search={{ month: shiftMonth(month, 1) }}
              aria-label="Next month"
              aria-disabled={isCurrent}
              className={isCurrent ? 'pointer-events-none opacity-50' : ''}
            >
              <ChevronRight />
            </Link>
          </Button>
        </div>
      </header>

      <Await promise={summary} fallback={<OverviewSkeleton />}>
        {({
          byCategory,
          uncategorizedCents,
          previousUncategorizedCents,
          previousMonth,
          topMerchants,
          daily,
        }) => {
          const spent = byCategory.reduce((s, c) => s + c.spentCents, 0) + uncategorizedCents
          const previousSpent =
            byCategory.reduce((s, c) => s + c.previousSpentCents, 0) + previousUncategorizedCents
          const budget = byCategory.reduce((s, c) => s + (c.budgetCents ?? 0), 0)
          const budgetedSpent = byCategory
            .filter((c) => c.budgetCents !== null)
            .reduce((s, c) => s + c.spentCents, 0)
          const daysInMonth = Number(range.to.slice(-2))
          const visibleCategories = byCategory.filter(
            (c) => c.spentCents > 0 || c.budgetCents !== null,
          )

          return (
            <>
              <SpendHero
                month={month}
                daysInMonth={daysInMonth}
                daily={daily}
                totalCents={spent}
                previousTotalCents={previousSpent}
                previousMonth={previousMonth}
              />

              {/* Tiles */}
              <section className="grid grid-cols-2 gap-3">
                <Tile
                  label="Budget"
                  value={budget > 0 ? `${Math.round((budgetedSpent / budget) * 100)}%` : '—'}
                  hint={
                    budget > 0
                      ? `${formatCents(budgetedSpent)} of ${formatCents(budget)}`
                      : 'No budgets set'
                  }
                />
                <Tile
                  label="Uncategorized"
                  value={formatCents(uncategorizedCents)}
                  hint={uncategorizedCents > 0 ? 'Needs a merchant rule' : 'All sorted'}
                  link={
                    uncategorizedCents > 0
                      ? linkOptions({
                          to: '/transactions',
                          search: { ...txSearch, categoryId: 'none' },
                        })
                      : undefined
                  }
                />
              </section>

              {/* Categories */}
              <section className="space-y-3">
                <h2 className="text-sm font-medium text-muted-foreground">By category</h2>
                {visibleCategories.length === 0 ? (
                  <div className="rounded-2xl border border-dashed px-6 py-10 text-center">
                    <p className="text-sm font-medium">Nothing here yet</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Connect a bank to start importing transactions into this profile.
                    </p>
                    <Button asChild variant="outline" size="sm" className="mt-4">
                      <Link to="/connect" search={{ country: 'FR' }}>
                        Connect a bank
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <ul className="divide-y overflow-hidden rounded-2xl border">
                    {visibleCategories.map((c) => {
                      const pct =
                        c.budgetCents && c.budgetCents > 0
                          ? Math.min(100, Math.round((c.spentCents / c.budgetCents) * 100))
                          : null
                      const over = c.budgetCents !== null && c.spentCents > c.budgetCents
                      return (
                        <li key={c.id}>
                          <Link
                            to="/transactions"
                            search={{ ...txSearch, categoryId: c.id }}
                            className="flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-muted/50 active:bg-muted"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-baseline justify-between gap-3">
                                <span className="truncate text-sm font-medium">{c.name}</span>
                                <span className="text-sm font-medium tabular-nums">
                                  {formatCents(c.spentCents)}
                                </span>
                              </div>
                              {c.budgetCents === null && c.previousSpentCents > 0 && (
                                <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                                  {formatCents(c.previousSpentCents)} last month
                                </p>
                              )}
                              {c.budgetCents !== null && (
                                <div className="mt-2 flex items-center gap-3">
                                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                                    <div
                                      className={`h-full rounded-full transition-[width] ${over ? 'bg-destructive' : 'bg-foreground'}`}
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                  <span
                                    className={`shrink-0 text-xs tabular-nums ${over ? 'text-destructive' : 'text-muted-foreground'}`}
                                  >
                                    {over
                                      ? `${formatCents(c.spentCents - c.budgetCents)} over`
                                      : `${formatCents(c.budgetCents - c.spentCents)} left`}
                                  </span>
                                </div>
                              )}
                            </div>
                            <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" />
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>

              {topMerchants.length > 0 && (
                <section className="space-y-3">
                  <h2 className="text-sm font-medium text-muted-foreground">Top merchants</h2>
                  <ul className="divide-y overflow-hidden rounded-2xl border">
                    {topMerchants.map((m) => (
                      <li key={m.id} className="flex items-center gap-4 px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{m.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {m.count} × {m.category ? `· ${m.category}` : ''}
                          </p>
                        </div>
                        <span className="text-sm font-medium tabular-nums">
                          {formatCents(m.spentCents)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )
        }}
      </Await>

      <Await promise={recurring} fallback={null}>
        {(items) =>
          items.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-baseline justify-between">
                <h2 className="text-sm font-medium text-muted-foreground">Recurring</h2>
                <span className="text-xs text-muted-foreground tabular-nums">
                  ≈ {formatCents(items.reduce((s, r) => s + r.monthlyCents, 0))} / month
                </span>
              </div>
              <ul className="divide-y overflow-hidden rounded-2xl border">
                {items.map((r) => (
                  <li key={r.merchantId} className="flex items-center gap-4 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{r.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.category ?? 'Uncategorized'} · seen {r.months} months · last {r.lastDate}
                      </p>
                    </div>
                    <span className="text-sm font-medium tabular-nums">
                      {formatCents(r.monthlyCents)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )
        }
      </Await>
    </div>
  )
}

function Tile({
  label,
  value,
  hint,
  link,
}: {
  label: string
  value: string
  hint?: string
  link?: LinkOptions
}) {
  const body = (
    <>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">
        {value}
      </p>
      {hint && <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>}
    </>
  )
  const cls = 'block rounded-2xl border p-4 sm:p-5'
  if (link) {
    return (
      <Link {...link} className={`${cls} transition-colors hover:bg-muted/50 active:bg-muted`}>
        {body}
      </Link>
    )
  }
  return <div className={cls}>{body}</div>
}

function OverviewSkeleton() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-48 rounded-2xl" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
      <div className="space-y-3">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    </div>
  )
}

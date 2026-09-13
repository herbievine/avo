// Budget alerts over ntfy (self-hosted at ntfy.herbievine.com). All optional: nothing is
// sent unless NTFY_URL and NTFY_TOPIC are set.
import { createServerOnlyFn } from '@tanstack/react-start'
import { and, eq, gt, isNotNull, like, lt, sql } from 'drizzle-orm'

import { db } from '#/db'
import { categories, merchants, transactions } from '#/db/schema'
import { formatCents } from '#/lib/money'

const THRESHOLDS = [0.8, 1] as const

export type BudgetSnapshot = Map<string, { name: string; budgetCents: number; spentCents: number }>

/** Spent vs budget for every budgeted category in the given month. */
export const budgetSnapshot = createServerOnlyFn((orgId: string, month: string): BudgetSnapshot => {
  const rows = db
    .select({
      id: categories.id,
      name: categories.name,
      budgetCents: categories.budgetCents,
      spentCents: sql<number>`coalesce(-sum(${transactions.amountCents}), 0)`,
    })
    .from(categories)
    .leftJoin(merchants, eq(merchants.categoryId, categories.id))
    .leftJoin(
      transactions,
      and(
        eq(transactions.merchantId, merchants.id),
        eq(transactions.organizationId, orgId),
        like(transactions.bookingDate, `${month}-%`),
        lt(transactions.amountCents, 0),
      ),
    )
    .where(
      and(
        eq(categories.organizationId, orgId),
        isNotNull(categories.budgetCents),
        gt(categories.budgetCents, 0),
      ),
    )
    .groupBy(categories.id)
    .all()
  return new Map(
    rows.map((r) => [
      r.id,
      { name: r.name, budgetCents: r.budgetCents!, spentCents: r.spentCents },
    ]),
  )
})

export const isNtfyConfigured = createServerOnlyFn(() =>
  Boolean(process.env.NTFY_URL && process.env.NTFY_TOPIC),
)

export const notify = createServerOnlyFn(
  async (title: string, message: string, tags: string[] = []) => {
    if (!isNtfyConfigured()) return false
    const res = await fetch(`${process.env.NTFY_URL}/${process.env.NTFY_TOPIC}`, {
      method: 'POST',
      headers: {
        Title: title,
        Tags: tags.join(','),
        Priority: 'default',
        Click: process.env.APP_URL ?? '',
        ...(process.env.NTFY_TOKEN ? { Authorization: `Bearer ${process.env.NTFY_TOKEN}` } : {}),
      },
      body: message,
    })
    if (!res.ok) console.error('ntfy', res.status, await res.text())
    return res.ok
  },
)

/**
 * Compare two snapshots and push one message per category that crossed 80% or 100%
 * of its budget between them (i.e. because of the transactions just imported).
 */
export const notifyBudgetCrossings = createServerOnlyFn(
  async (profile: string, before: BudgetSnapshot, after: BudgetSnapshot) => {
    let sent = 0
    for (const [id, now] of after) {
      const prev = before.get(id)?.spentCents ?? 0
      for (const t of THRESHOLDS) {
        const line = now.budgetCents * t
        if (prev < line && now.spentCents >= line) {
          const over = now.spentCents - now.budgetCents
          const title =
            t === 1
              ? `${now.name}: over budget (${profile})`
              : `${now.name}: 80% of budget used (${profile})`
          const body =
            t === 1
              ? `${formatCents(now.spentCents)} spent, ${formatCents(over)} over the ${formatCents(now.budgetCents)} budget.`
              : `${formatCents(now.spentCents)} of ${formatCents(now.budgetCents)}. ${formatCents(now.budgetCents - now.spentCents)} left this month.`
          if (await notify(title, body, [t === 1 ? 'rotating_light' : 'warning', 'avocado'])) sent++
        }
      }
    }
    return sent
  },
)

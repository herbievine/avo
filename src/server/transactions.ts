import { and, asc, desc, eq, gte, isNull, like, lt, lte, or, sql } from 'drizzle-orm'
import { createServerOnlyFn } from '@tanstack/react-start'

import { db } from '#/db'
import { bankConnections, categories, merchants, transactions } from '#/db/schema'

export const PAGE_SIZE = 25

/** Sentinel for "has no category" in the category filter. */
export const UNCATEGORIZED = 'none'

export type TransactionFilter = {
  from: string // YYYY-MM-DD inclusive
  to: string // YYYY-MM-DD inclusive
  categoryId?: string
  accountUid?: string
  q?: string
  page: number
  sort: 'date' | 'amount'
  dir: 'asc' | 'desc'
}

function inMonth(month: string) {
  // booking_date is YYYY-MM-DD, so a prefix compare is enough.
  return like(transactions.bookingDate, `${month}-%`)
}

const noCategory = or(isNull(transactions.merchantId), isNull(merchants.categoryId))

export const listCategories = createServerOnlyFn((orgId: string) =>
  db
    .select()
    .from(categories)
    .where(eq(categories.organizationId, orgId))
    .orderBy(asc(categories.name))
    .all(),
)

export const listTransactions = createServerOnlyFn((orgId: string, filter: TransactionFilter) => {
  const where = and(
    eq(transactions.organizationId, orgId),
    gte(transactions.bookingDate, filter.from),
    lte(transactions.bookingDate, filter.to),
    filter.categoryId === undefined
      ? undefined
      : filter.categoryId === UNCATEGORIZED
        ? noCategory
        : eq(merchants.categoryId, filter.categoryId),
    filter.accountUid === undefined ? undefined : eq(transactions.accountUid, filter.accountUid),
    filter.q
      ? or(
          like(transactions.merchant, `%${filter.q}%`),
          like(merchants.name, `%${filter.q}%`),
          like(transactions.description, `%${filter.q}%`),
        )
      : undefined,
  )

  const base = db
    .select({
      id: transactions.id,
      bookingDate: transactions.bookingDate,
      amountCents: transactions.amountCents,
      currency: transactions.currency,
      rawMerchant: transactions.merchant,
      merchant: sql<string>`coalesce(${merchants.name}, ${transactions.merchant})`,
      merchantId: transactions.merchantId,
      category: categories.name,
      categoryId: merchants.categoryId,
      payer: transactions.payer,
      status: transactions.status,
      accountUid: transactions.accountUid,
      bank: bankConnections.aspsp,
      iban: bankConnections.iban,
      accountLabel: bankConnections.label,
    })
    .from(transactions)
    .leftJoin(merchants, eq(transactions.merchantId, merchants.id))
    .leftJoin(categories, eq(merchants.categoryId, categories.id))
    .leftJoin(
      bankConnections,
      and(
        eq(bankConnections.accountUid, transactions.accountUid),
        eq(bankConnections.organizationId, transactions.organizationId),
      ),
    )
    .where(where)

  const sortColumn = filter.sort === 'amount' ? transactions.amountCents : transactions.bookingDate
  const rows = base
    .orderBy(
      filter.dir === 'asc' ? asc(sortColumn) : desc(sortColumn),
      desc(transactions.createdAt),
    )
    .limit(PAGE_SIZE)
    .offset((filter.page - 1) * PAGE_SIZE)
    .all()

  const [{ total }] = db
    .select({ total: sql<number>`count(*)` })
    .from(transactions)
    .leftJoin(merchants, eq(transactions.merchantId, merchants.id))
    .where(where)
    .all()

  return { rows, total, pageSize: PAGE_SIZE }
})

/** Month summary for the overview: debits by category, by day and by payer. Transfers are excluded. */
export const monthSummary = createServerOnlyFn((orgId: string, month: string) => {
  const spent = sql<number>`coalesce(-sum(${transactions.amountCents}), 0)`
  const notExcluded = or(isNull(categories.excluded), eq(categories.excluded, false))
  const debitInMonth = and(
    eq(transactions.organizationId, orgId),
    inMonth(month),
    lt(transactions.amountCents, 0),
  )

  const byCategory = db
    .select({
      id: categories.id,
      name: categories.name,
      budgetCents: categories.budgetCents,
      spentCents: spent,
    })
    .from(categories)
    .leftJoin(merchants, eq(merchants.categoryId, categories.id))
    .leftJoin(transactions, and(eq(transactions.merchantId, merchants.id), debitInMonth))
    .where(and(eq(categories.organizationId, orgId), eq(categories.excluded, false)))
    .groupBy(categories.id)
    .orderBy(desc(spent))
    .all()

  const [{ uncategorizedCents }] = db
    .select({ uncategorizedCents: spent })
    .from(transactions)
    .leftJoin(merchants, eq(transactions.merchantId, merchants.id))
    .where(and(debitInMonth, noCategory))
    .all()

  // Same categories last month, for month-over-month deltas.
  const [py, pm] = month.split('-').map(Number)
  const prevDate = new Date(Date.UTC(py, pm - 2, 1))
  const previousMonth = `${prevDate.getUTCFullYear()}-${String(prevDate.getUTCMonth() + 1).padStart(2, '0')}`
  const previous = new Map(
    db
      .select({ id: categories.id, spentCents: spent })
      .from(categories)
      .leftJoin(merchants, eq(merchants.categoryId, categories.id))
      .leftJoin(
        transactions,
        and(
          eq(transactions.merchantId, merchants.id),
          eq(transactions.organizationId, orgId),
          inMonth(previousMonth),
          lt(transactions.amountCents, 0),
        ),
      )
      .where(and(eq(categories.organizationId, orgId), eq(categories.excluded, false)))
      .groupBy(categories.id)
      .all()
      .map((r) => [r.id, r.spentCents] as const),
  )
  const [{ previousUncategorizedCents }] = db
    .select({ previousUncategorizedCents: spent })
    .from(transactions)
    .leftJoin(merchants, eq(transactions.merchantId, merchants.id))
    .where(
      and(
        eq(transactions.organizationId, orgId),
        inMonth(previousMonth),
        lt(transactions.amountCents, 0),
        noCategory,
      ),
    )
    .all()

  const topMerchants = db
    .select({
      id: merchants.id,
      name: merchants.name,
      category: categories.name,
      count: sql<number>`count(*)`,
      spentCents: spent,
    })
    .from(transactions)
    .innerJoin(merchants, eq(transactions.merchantId, merchants.id))
    .leftJoin(categories, eq(merchants.categoryId, categories.id))
    .where(and(debitInMonth, notExcluded))
    .groupBy(merchants.id)
    .orderBy(desc(spent))
    .limit(5)
    .all()

  const daily = db
    .select({ date: transactions.bookingDate, spentCents: spent })
    .from(transactions)
    .leftJoin(merchants, eq(transactions.merchantId, merchants.id))
    .leftJoin(categories, eq(merchants.categoryId, categories.id))
    .where(and(debitInMonth, notExcluded))
    .groupBy(transactions.bookingDate)
    .orderBy(asc(transactions.bookingDate))
    .all()

  return {
    byCategory: byCategory.map((c) => ({ ...c, previousSpentCents: previous.get(c.id) ?? 0 })),
    uncategorizedCents,
    previousUncategorizedCents,
    previousMonth,
    topMerchants,
    daily,
  }
})

/**
 * Recurring payments: merchants charged in at least 2 of the last 4 months with
 * similar amounts (within 25% of the median). Typical for subscriptions, rent, telecom.
 */
export const recurring = createServerOnlyFn((orgId: string) => {
  const since = new Date()
  since.setUTCMonth(since.getUTCMonth() - 4, 1)
  const rows = db
    .select({
      merchantId: merchants.id,
      name: merchants.name,
      category: categories.name,
      date: transactions.bookingDate,
      cents: sql<number>`-${transactions.amountCents}`,
    })
    .from(transactions)
    .innerJoin(merchants, eq(transactions.merchantId, merchants.id))
    .leftJoin(categories, eq(merchants.categoryId, categories.id))
    .where(
      and(
        eq(transactions.organizationId, orgId),
        lt(transactions.amountCents, 0),
        gte(transactions.bookingDate, since.toISOString().slice(0, 10)),
        or(isNull(categories.excluded), eq(categories.excluded, false)),
      ),
    )
    .all()

  const byMerchant = new Map<string, typeof rows>()
  for (const r of rows) byMerchant.set(r.merchantId, [...(byMerchant.get(r.merchantId) ?? []), r])

  const result: Array<{
    merchantId: string
    name: string
    category: string | null
    monthlyCents: number
    months: number
    lastDate: string
  }> = []
  for (const [merchantId, list] of byMerchant) {
    const months = new Set(list.map((r) => r.date.slice(0, 7)))
    if (months.size < 2) continue
    const amounts = list.map((r) => r.cents).sort((a, b) => a - b)
    const median = amounts[Math.floor(amounts.length / 2)]
    const similar = amounts.filter((a) => Math.abs(a - median) <= median * 0.25)
    if (similar.length < 2 || similar.length < amounts.length * 0.6) continue
    const perMonth = list.reduce((s, r) => s + r.cents, 0) / months.size
    result.push({
      merchantId,
      name: list[0].name,
      category: list[0].category,
      monthlyCents: Math.round(perMonth),
      months: months.size,
      lastDate: list
        .map((r) => r.date)
        .sort()
        .at(-1)!,
    })
  }
  return result.sort((a, b) => b.monthlyCents - a.monthlyCents)
})

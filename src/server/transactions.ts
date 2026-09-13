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
      category: categories.name,
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

  const daily = db
    .select({ date: transactions.bookingDate, spentCents: spent })
    .from(transactions)
    .leftJoin(merchants, eq(transactions.merchantId, merchants.id))
    .leftJoin(categories, eq(merchants.categoryId, categories.id))
    .where(and(debitInMonth, notExcluded))
    .groupBy(transactions.bookingDate)
    .orderBy(asc(transactions.bookingDate))
    .all()

  return { byCategory, uncategorizedCents, daily }
})

import { and, eq, isNull, sql } from 'drizzle-orm'

import { db } from '#/db'
import { categories, merchantRules, merchants, transactions } from '#/db/schema'

/**
 * Assign a merchant to every unclassified transaction whose raw counterparty name
 * contains a rule pattern (case-insensitive). Longer patterns win.
 * Plain function (no server-only wrapper) so scripts can call it too.
 */
export function applyRules(orgId: string) {
  const rules = db
    .select({ pattern: merchantRules.pattern, merchantId: merchantRules.merchantId })
    .from(merchantRules)
    .where(eq(merchantRules.organizationId, orgId))
    .all()
    .sort((a, b) => b.pattern.length - a.pattern.length)

  const unclassified = db
    .select({ id: transactions.id, merchant: transactions.merchant })
    .from(transactions)
    .where(and(eq(transactions.organizationId, orgId), isNull(transactions.merchantId)))
    .all()

  let classified = 0
  for (const t of unclassified) {
    const name = t.merchant.toLowerCase()
    const rule = rules.find((r) => name.includes(r.pattern))
    if (!rule) continue
    db.update(transactions)
      .set({ merchantId: rule.merchantId })
      .where(eq(transactions.id, t.id))
      .run()
    classified++
  }
  return classified
}

/** Uncategorized transactions grouped by raw counterparty name, most frequent first. */
export function listUncategorized(orgId: string) {
  return db
    .select({
      merchant: transactions.merchant,
      count: sql<number>`count(*)`,
      totalCents: sql<number>`sum(${transactions.amountCents})`,
      lastDate: sql<string>`max(${transactions.bookingDate})`,
      kind: sql<string | null>`max(${transactions.kind})`,
    })
    .from(transactions)
    .where(and(eq(transactions.organizationId, orgId), isNull(transactions.merchantId)))
    .groupBy(transactions.merchant)
    .orderBy(sql`count(*) desc`, sql`sum(${transactions.amountCents})`)
    .all()
}

/**
 * Add a rule (pattern -> merchant -> category) and classify. Creates the merchant and,
 * if `newCategory` is given, the category. Returns how many transactions matched.
 */
export function createRule(
  orgId: string,
  input: { pattern: string; merchantName: string; categoryId?: string; newCategory?: string },
) {
  return db.transaction((tx) => {
    let categoryId = input.categoryId ?? null
    if (input.newCategory) {
      const [c] = tx
        .insert(categories)
        .values({ organizationId: orgId, name: input.newCategory })
        .onConflictDoUpdate({
          target: [categories.organizationId, categories.name],
          set: { name: input.newCategory },
        })
        .returning({ id: categories.id })
        .all()
      categoryId = c.id
    }
    const [m] = tx
      .insert(merchants)
      .values({ organizationId: orgId, name: input.merchantName, categoryId })
      .onConflictDoUpdate({
        target: [merchants.organizationId, merchants.name],
        set: { categoryId },
      })
      .returning({ id: merchants.id })
      .all()
    tx.insert(merchantRules)
      .values({ organizationId: orgId, pattern: input.pattern, merchantId: m.id })
      .onConflictDoUpdate({
        target: [merchantRules.organizationId, merchantRules.pattern],
        set: { merchantId: m.id },
      })
      .run()
    return applyRules(orgId)
  })
}

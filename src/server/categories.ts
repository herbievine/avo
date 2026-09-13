import { createServerOnlyFn } from '@tanstack/react-start'
import { and, asc, eq, sql } from 'drizzle-orm'

import { db } from '#/db'
import { categories, merchants } from '#/db/schema'

export const listCategoriesWithStats = createServerOnlyFn((orgId: string) =>
  db
    .select({
      id: categories.id,
      name: categories.name,
      budgetCents: categories.budgetCents,
      excluded: categories.excluded,
      merchantCount: sql<number>`count(${merchants.id})`,
    })
    .from(categories)
    .leftJoin(merchants, eq(merchants.categoryId, categories.id))
    .where(eq(categories.organizationId, orgId))
    .groupBy(categories.id)
    .orderBy(asc(categories.excluded), asc(categories.name))
    .all(),
)

export const createCategory = createServerOnlyFn((orgId: string, name: string) =>
  db.insert(categories).values({ organizationId: orgId, name }).returning().get(),
)

export const updateCategory = createServerOnlyFn(
  (
    orgId: string,
    id: string,
    patch: { name?: string; budgetCents?: number | null; excluded?: boolean },
  ) =>
    db
      .update(categories)
      .set(patch)
      .where(and(eq(categories.id, id), eq(categories.organizationId, orgId)))
      .run().changes,
)

/** Merchants keep their rules but lose the category (FK is set null). */
export const deleteCategory = createServerOnlyFn(
  (orgId: string, id: string) =>
    db
      .delete(categories)
      .where(and(eq(categories.id, id), eq(categories.organizationId, orgId)))
      .run().changes,
)

export const setMerchantCategory = createServerOnlyFn(
  (orgId: string, merchantId: string, categoryId: string | null) =>
    db
      .update(merchants)
      .set({ categoryId })
      .where(and(eq(merchants.id, merchantId), eq(merchants.organizationId, orgId)))
      .run().changes,
)

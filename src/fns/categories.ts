import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import {
  createCategory,
  deleteCategory,
  listCategoriesWithStats,
  setMerchantCategory,
  updateCategory,
} from '#/server/categories'
import { requireOrg } from '#/server/org'

export const listCategoriesWithStatsFn = createServerFn({ method: 'GET' }).handler(async () =>
  listCategoriesWithStats((await requireOrg()).id),
)

export const createCategoryFn = createServerFn({ method: 'POST' })
  .validator(z.object({ name: z.string().trim().min(1).max(40) }))
  .handler(async ({ data }) => createCategory((await requireOrg()).id, data.name))

export const updateCategoryFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      id: z.string().min(1),
      name: z.string().trim().min(1).max(40).optional(),
      budgetCents: z.number().int().nonnegative().nullable().optional(),
      excluded: z.boolean().optional(),
    }),
  )
  .handler(async ({ data: { id, ...patch } }) => {
    if (updateCategory((await requireOrg()).id, id, patch) === 0) {
      throw new Response('Not found', { status: 404 })
    }
    return { ok: true }
  })

export const deleteCategoryFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    if (deleteCategory((await requireOrg()).id, data.id) === 0) {
      throw new Response('Not found', { status: 404 })
    }
    return { ok: true }
  })

export const setMerchantCategoryFn = createServerFn({ method: 'POST' })
  .validator(z.object({ merchantId: z.string().min(1), categoryId: z.string().min(1).nullable() }))
  .handler(async ({ data }) => {
    if (setMerchantCategory((await requireOrg()).id, data.merchantId, data.categoryId) === 0) {
      throw new Response('Not found', { status: 404 })
    }
    return { ok: true }
  })

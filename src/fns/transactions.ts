import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { requireOrg } from '#/server/org'
import { listCategories, listTransactions, monthSummary, recurring } from '#/server/transactions'

export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Expected YYYY-MM')

export const listCategoriesFn = createServerFn({ method: 'GET' }).handler(async () =>
  listCategories((await requireOrg()).id),
)

export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')

export const listTransactionsFn = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      from: isoDateSchema,
      to: isoDateSchema,
      categoryId: z.string().min(1).optional(),
      accountUid: z.string().min(1).optional(),
      q: z.string().trim().min(1).optional(),
      page: z.number().int().positive(),
      sort: z.enum(['date', 'amount']),
      dir: z.enum(['asc', 'desc']),
    }),
  )
  .handler(async ({ data }) => listTransactions((await requireOrg()).id, data))

export const monthSummaryFn = createServerFn({ method: 'GET' })
  .validator(monthSchema)
  .handler(async ({ data }) => monthSummary((await requireOrg()).id, data))

export const recurringFn = createServerFn({ method: 'GET' }).handler(async () =>
  recurring((await requireOrg()).id),
)

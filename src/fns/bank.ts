import { randomUUID } from 'node:crypto'
import { createServerFn } from '@tanstack/react-start'
import { setCookie } from '@tanstack/react-start/server'
import { z } from 'zod'

import { listConnections, renameConnection, syncAll } from '#/server/bank'
import { applyRules, createRule, listUncategorized } from '#/server/classify'
import { isConfigured, listAspsps, startAuth } from '#/server/enablebanking'
import { requireOrg } from '#/server/org'
import { requireSession } from '#/server/session'

export const STATE_COOKIE = 'eb_state'

export const listAspspsFn = createServerFn({ method: 'GET' })
  .validator(z.object({ country: z.string().length(2) }))
  .handler(async ({ data }) => {
    await requireSession()
    if (!isConfigured()) return { configured: false as const, aspsps: [] }
    return { configured: true as const, aspsps: await listAspsps(data.country) }
  })

export const listConnectionsFn = createServerFn({ method: 'GET' }).handler(async () =>
  listConnections((await requireOrg()).id),
)

export const startBankAuthFn = createServerFn({ method: 'POST' })
  .validator(z.object({ name: z.string().min(1), country: z.string().length(2) }))
  .handler(async ({ data }) => {
    await requireSession()
    const state = randomUUID()
    setCookie(STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
      maxAge: 15 * 60,
    })
    const { url } = await startAuth({
      ...data,
      state,
      redirectUrl: `${process.env.APP_URL}/api/enablebanking/callback`,
    })
    return { url }
  })

export const syncBankFn = createServerFn({ method: 'POST' }).handler(async () =>
  syncAll((await requireOrg()).id),
)

export const applyRulesFn = createServerFn({ method: 'POST' }).handler(async () => ({
  classified: applyRules((await requireOrg()).id),
}))

export const renameConnectionFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string().min(1), label: z.string().trim().max(40) }))
  .handler(async ({ data }) => {
    const changed = renameConnection((await requireOrg()).id, data.id, data.label || null)
    if (changed === 0) throw new Response('Not found', { status: 404 })
    return { ok: true }
  })

export const listUncategorizedFn = createServerFn({ method: 'GET' }).handler(async () =>
  listUncategorized((await requireOrg()).id),
)

export const createRuleFn = createServerFn({ method: 'POST' })
  .validator(
    z
      .object({
        pattern: z.string().trim().toLowerCase().min(2).max(120),
        merchantName: z.string().trim().min(1).max(60),
        categoryId: z.string().min(1).optional(),
        newCategory: z.string().trim().min(1).max(40).optional(),
      })
      .refine((v) => v.categoryId || v.newCategory, { message: 'Pick or create a category' }),
  )
  .handler(async ({ data }) => ({
    classified: createRule((await requireOrg()).id, data),
  }))

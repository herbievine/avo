import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { z } from 'zod'

import { auth } from '#/lib/auth'
import { isMember, listProfiles, requireOrg, slugify } from '#/server/org'
import { requireSession } from '#/server/session'

export const getProfilesFn = createServerFn({ method: 'GET' }).handler(async () => {
  const [profiles, active] = await Promise.all([listProfiles(), requireOrg()])
  return { profiles, active }
})

export const switchProfileFn = createServerFn({ method: 'POST' })
  .validator(z.object({ organizationId: z.string().min(1) }))
  .handler(async ({ data }) => {
    if (!(await isMember(data.organizationId))) throw new Response('Forbidden', { status: 403 })
    await auth.api.setActiveOrganization({
      headers: getRequest().headers,
      body: { organizationId: data.organizationId },
    })
    return { ok: true }
  })

export const createProfileFn = createServerFn({ method: 'POST' })
  .validator(z.object({ name: z.string().trim().min(1).max(40) }))
  .handler(async ({ data }) => {
    await requireSession()
    const headers = getRequest().headers
    const base = slugify(data.name)
    // Slugs are global; suffix until free.
    let slug = base
    for (let i = 2; ; i++) {
      const taken = await auth.api.checkOrganizationSlug({ headers, body: { slug } }).then(
        () => false,
        () => true,
      )
      if (!taken) break
      slug = `${base}-${i}`
    }
    const org = await auth.api.createOrganization({ headers, body: { name: data.name, slug } })
    if (!org) throw new Response('Could not create profile', { status: 500 })
    await auth.api.setActiveOrganization({ headers, body: { organizationId: org.id } })
    return { id: org.id, name: org.name, slug: org.slug }
  })

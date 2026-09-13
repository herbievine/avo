import { createServerOnlyFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { and, asc, eq } from 'drizzle-orm'

import { nanoid } from 'nanoid'

import { db } from '#/db'
import { member, organization } from '#/db/schema'
import { auth } from '#/lib/auth'
import { requireSession } from './session'

export type Profile = { id: string; name: string; slug: string }

/** Every profile (organization) the signed-in user belongs to. */
export const listProfiles = createServerOnlyFn(async (): Promise<Profile[]> => {
  const { user } = await requireSession()
  return db
    .select({ id: organization.id, name: organization.name, slug: organization.slug })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(eq(member.userId, user.id))
    .orderBy(asc(organization.createdAt))
    .all()
})

/**
 * The active profile for this session. Falls back to the user's first profile
 * (and marks it active) so data queries always have an organization to scope to.
 */
export const requireOrg = createServerOnlyFn(async (): Promise<Profile> => {
  const { session, user } = await requireSession()
  let profiles = await listProfiles()
  const active = profiles.find((p) => p.id === session.activeOrganizationId)
  if (active) return active
  if (profiles.length === 0) {
    // Brand-new account: give it a Personal profile so every query has a scope.
    const id = nanoid()
    db.insert(organization)
      .values({
        id,
        name: 'Personal',
        slug: `personal-${id.slice(0, 6).toLowerCase()}`,
        createdAt: new Date(),
      })
      .run()
    db.insert(member)
      .values({
        id: nanoid(),
        organizationId: id,
        userId: user.id,
        role: 'owner',
        createdAt: new Date(),
      })
      .run()
    profiles = await listProfiles()
  }
  await auth.api.setActiveOrganization({
    headers: getRequest().headers,
    body: { organizationId: profiles[0].id },
  })
  return profiles[0]
})

/** Is the user a member of this profile? Used before switching. */
export const isMember = createServerOnlyFn(async (organizationId: string) => {
  const { user } = await requireSession()
  const row = db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.userId, user.id), eq(member.organizationId, organizationId)))
    .get()
  return Boolean(row)
})

export function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'profile'
  )
}

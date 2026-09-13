// Remove an account and everything it owns alone (sessions, credentials, memberships,
// profiles with no other member). `bun run delete-user <email>`
import { config } from 'dotenv'

config({ path: ['.env.local', '.env'] })
const { and, eq, inArray, notInArray } = await import('drizzle-orm')
const { db } = await import('../src/db/index.ts')
const { account, member, organization, session, user } = await import('../src/db/schema.ts')

const email = process.argv[2]
if (!email) throw new Error('usage: delete-user <email>')
const u = db.select().from(user).where(eq(user.email, email)).get()
if (!u) throw new Error(`no user with email ${email}`)

db.transaction((tx) => {
  const orgIds = tx
    .select({ id: member.organizationId })
    .from(member)
    .where(eq(member.userId, u.id))
    .all()
    .map((r) => r.id)
  tx.delete(member).where(eq(member.userId, u.id)).run()
  // Profiles left with no members go too (cascades to their data).
  const orphaned = orgIds.length
    ? tx
        .select({ id: organization.id })
        .from(organization)
        .where(
          and(
            inArray(organization.id, orgIds),
            notInArray(organization.id, tx.select({ id: member.organizationId }).from(member)),
          ),
        )
        .all()
        .map((r) => r.id)
    : []
  if (orphaned.length) tx.delete(organization).where(inArray(organization.id, orphaned)).run()
  tx.delete(session).where(eq(session.userId, u.id)).run()
  tx.delete(account).where(eq(account.userId, u.id)).run()
  tx.delete(user).where(eq(user.id, u.id)).run()
  console.log(`deleted ${email}; removed ${orphaned.length} orphaned profile(s)`)
})

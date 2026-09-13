// Move a connected bank account (and its transactions) to another profile.
//   bun run move-account <iban-or-account-uid> <target-profile-slug>
import { config } from 'dotenv'

config({ path: ['.env.local', '.env'] })
const { and, eq, or } = await import('drizzle-orm')
const { db } = await import('../src/db/index.ts')
const { bankConnections, organization, transactions } = await import('../src/db/schema.ts')
const { applyRules } = await import('../src/server/classify.ts')

const [account, slug] = process.argv.slice(2)
if (!account || !slug) throw new Error('usage: move-account <iban-or-account-uid> <profile-slug>')

const target = db.select().from(organization).where(eq(organization.slug, slug)).get()
if (!target) throw new Error(`no profile with slug "${slug}"`)

const conn = db
  .select()
  .from(bankConnections)
  .where(or(eq(bankConnections.iban, account), eq(bankConnections.accountUid, account)))
  .get()
if (!conn) throw new Error(`no connected account matching "${account}"`)
if (conn.organizationId === target.id) {
  console.log('already in that profile')
  process.exit(0)
}

db.transaction((tx) => {
  tx.update(bankConnections)
    .set({ organizationId: target.id })
    .where(eq(bankConnections.id, conn.id))
    .run()
  // Merchant rules are per profile, so drop the old classification and re-run the target's.
  const moved = tx
    .update(transactions)
    .set({ organizationId: target.id, merchantId: null })
    .where(
      and(
        eq(transactions.organizationId, conn.organizationId),
        eq(transactions.accountUid, conn.accountUid),
      ),
    )
    .run()
  console.log(`moved "${conn.name}" and ${moved.changes} transactions to ${target.name}`)
})
console.log(`classified ${applyRules(target.id)} transactions in ${target.name}`)

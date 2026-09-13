// Pull transactions for every profile's connected accounts, then push ntfy alerts for
// budgets that crossed 80% / 100% because of what was imported. `bun run sync`
// Runs on a schedule on marvin (see the `sync` service in docker-compose.pi.yml).
import { config } from 'dotenv'

config({ path: ['.env.local', '.env'] })
const { syncAll } = await import('../src/server/bank.ts')
const { budgetSnapshot, notifyBudgetCrossings, isNtfyConfigured } =
  await import('../src/server/alerts.ts')
const { db } = await import('../src/db/index.ts')
const { organization } = await import('../src/db/schema.ts')

const month = new Date().toISOString().slice(0, 7)
for (const org of db.select().from(organization).all()) {
  const before = budgetSnapshot(org.id, month)
  try {
    const result = await syncAll(org.id)
    const after = budgetSnapshot(org.id, month)
    const alerts = await notifyBudgetCrossings(org.name, before, after)
    console.log(new Date().toISOString(), org.name, { ...result, alerts })
  } catch (e) {
    console.error(
      new Date().toISOString(),
      org.name,
      'sync failed:',
      e instanceof Error ? e.message : e,
    )
  }
}
if (!isNtfyConfigured()) console.log('ntfy not configured (NTFY_URL / NTFY_TOPIC); alerts skipped')

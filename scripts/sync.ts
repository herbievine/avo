// Pull transactions for every connected account from the command line. `bun run sync`
import { config } from 'dotenv'

config({ path: ['.env.local', '.env'] })
const { syncAll } = await import('../src/server/bank.ts')
const { db } = await import('../src/db/index.ts')
const { organization } = await import('../src/db/schema.ts')
for (const org of db.select().from(organization).all()) {
  console.log(org.name, await syncAll(org.id))
}

// One-off, idempotent: introduce profiles (Better Auth organizations) and move every
// existing row into a default "Joint" profile owned by the first user.
// SQLite can't add NOT NULL columns or change unique constraints in place, so each
// app table is rebuilt from the drizzle-generated definition. `bun run migrate:orgs`
import { config } from 'dotenv'
import Database from 'better-sqlite3'
import { nanoid } from 'nanoid'

config({ path: ['.env.local', '.env'] })
const db = new Database(process.env.DATABASE_URL!)

const APP_TABLES: Record<string, { create: string; indexes: string[]; columns: string[] }> = {
  categories: {
    create:
      'CREATE TABLE `categories` (`id` text PRIMARY KEY NOT NULL, `organization_id` text NOT NULL, `name` text NOT NULL, `budget_cents` integer, `excluded` integer DEFAULT false NOT NULL, FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade)',
    indexes: [
      'CREATE UNIQUE INDEX IF NOT EXISTS `categories_org_name` ON `categories` (`organization_id`,`name`)',
    ],
    columns: ['id', 'name', 'budget_cents', 'excluded'],
  },
  merchants: {
    create:
      'CREATE TABLE `merchants` (`id` text PRIMARY KEY NOT NULL, `organization_id` text NOT NULL, `name` text NOT NULL, `category_id` text, FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null)',
    indexes: [
      'CREATE UNIQUE INDEX IF NOT EXISTS `merchants_org_name` ON `merchants` (`organization_id`,`name`)',
    ],
    columns: ['id', 'name', 'category_id'],
  },
  merchant_rules: {
    create:
      'CREATE TABLE `merchant_rules` (`id` text PRIMARY KEY NOT NULL, `organization_id` text NOT NULL, `pattern` text NOT NULL, `merchant_id` text NOT NULL, FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE cascade)',
    indexes: [
      'CREATE UNIQUE INDEX IF NOT EXISTS `merchant_rules_org_pattern` ON `merchant_rules` (`organization_id`,`pattern`)',
    ],
    columns: ['id', 'pattern', 'merchant_id'],
  },
  transactions: {
    create:
      "CREATE TABLE `transactions` (`id` text PRIMARY KEY NOT NULL, `organization_id` text NOT NULL, `external_id` text NOT NULL, `booking_date` text NOT NULL, `amount_cents` integer NOT NULL, `currency` text NOT NULL, `merchant` text NOT NULL, `description` text, `merchant_id` text, `payer` text, `kind` text, `status` text DEFAULT 'BOOK' NOT NULL, `account_uid` text, `created_at` integer DEFAULT (unixepoch()) NOT NULL, FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE set null)",
    indexes: [
      'CREATE INDEX IF NOT EXISTS `transactions_booking_date_idx` ON `transactions` (`organization_id`,`booking_date`)',
      'CREATE UNIQUE INDEX IF NOT EXISTS `transactions_org_external` ON `transactions` (`organization_id`,`external_id`)',
    ],
    columns: [
      'id',
      'external_id',
      'booking_date',
      'amount_cents',
      'currency',
      'merchant',
      'description',
      'merchant_id',
      'payer',
      'kind',
      'status',
      'account_uid',
      'created_at',
    ],
  },
  bank_connections: {
    create:
      'CREATE TABLE `bank_connections` (`id` text PRIMARY KEY NOT NULL, `organization_id` text NOT NULL, `session_id` text NOT NULL, `account_uid` text NOT NULL, `name` text NOT NULL, `iban` text, `currency` text NOT NULL, `aspsp` text NOT NULL, `valid_until` text NOT NULL, `last_synced_at` integer, `created_at` integer DEFAULT (unixepoch()) NOT NULL, FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade)',
    indexes: [
      'CREATE UNIQUE INDEX IF NOT EXISTS `bank_connections_org_account` ON `bank_connections` (`organization_id`,`account_uid`)',
    ],
    columns: [
      'id',
      'session_id',
      'account_uid',
      'name',
      'iban',
      'currency',
      'aspsp',
      'valid_until',
      'last_synced_at',
      'created_at',
    ],
  },
}

const hasColumn = (table: string, column: string) =>
  (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).some(
    (c) => c.name === column,
  )
const hasTable = (table: string) =>
  Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table))

db.pragma('foreign_keys = OFF')
db.exec('BEGIN')
try {
  // 1. Auth plugin tables.
  db.exec(`
    CREATE TABLE IF NOT EXISTS \`organization\` (\`id\` text PRIMARY KEY NOT NULL, \`name\` text NOT NULL, \`slug\` text NOT NULL, \`logo\` text, \`created_at\` integer NOT NULL, \`metadata\` text);
    CREATE UNIQUE INDEX IF NOT EXISTS \`organization_slug_unique\` ON \`organization\` (\`slug\`);
    CREATE UNIQUE INDEX IF NOT EXISTS \`organization_slug_uidx\` ON \`organization\` (\`slug\`);
    CREATE TABLE IF NOT EXISTS \`member\` (\`id\` text PRIMARY KEY NOT NULL, \`organization_id\` text NOT NULL, \`user_id\` text NOT NULL, \`role\` text DEFAULT 'member' NOT NULL, \`created_at\` integer NOT NULL, FOREIGN KEY (\`organization_id\`) REFERENCES \`organization\`(\`id\`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (\`user_id\`) REFERENCES \`user\`(\`id\`) ON UPDATE no action ON DELETE cascade);
    CREATE INDEX IF NOT EXISTS \`member_organizationId_idx\` ON \`member\` (\`organization_id\`);
    CREATE INDEX IF NOT EXISTS \`member_userId_idx\` ON \`member\` (\`user_id\`);
    CREATE TABLE IF NOT EXISTS \`invitation\` (\`id\` text PRIMARY KEY NOT NULL, \`organization_id\` text NOT NULL, \`email\` text NOT NULL, \`role\` text, \`status\` text DEFAULT 'pending' NOT NULL, \`expires_at\` integer NOT NULL, \`created_at\` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL, \`inviter_id\` text NOT NULL, FOREIGN KEY (\`organization_id\`) REFERENCES \`organization\`(\`id\`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (\`inviter_id\`) REFERENCES \`user\`(\`id\`) ON UPDATE no action ON DELETE cascade);
    CREATE INDEX IF NOT EXISTS \`invitation_organizationId_idx\` ON \`invitation\` (\`organization_id\`);
    CREATE INDEX IF NOT EXISTS \`invitation_email_idx\` ON \`invitation\` (\`email\`);
  `)
  if (!hasColumn('session', 'active_organization_id')) {
    db.exec('ALTER TABLE `session` ADD COLUMN `active_organization_id` text')
  }

  // 2. Default profile for existing users.
  let org = db.prepare('SELECT id FROM organization ORDER BY created_at LIMIT 1').get() as
    | { id: string }
    | undefined
  const users = db.prepare('SELECT id FROM user ORDER BY created_at').all() as Array<{ id: string }>
  if (!org && users.length > 0) {
    org = { id: nanoid() }
    db.prepare('INSERT INTO organization (id, name, slug, created_at) VALUES (?, ?, ?, ?)').run(
      org.id,
      'Joint',
      'joint',
      Date.now(),
    )
    users.forEach((u, i) =>
      db
        .prepare(
          'INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)',
        )
        .run(nanoid(), org!.id, u.id, i === 0 ? 'owner' : 'member', Date.now()),
    )
    db.prepare('UPDATE session SET active_organization_id = ?').run(org.id)
    console.log('created default profile "Joint" for', users.length, 'user(s)')
  }

  // 3. Rebuild app tables that predate profiles.
  for (const [table, def] of Object.entries(APP_TABLES)) {
    if (!hasTable(table)) {
      db.exec(def.create)
      def.indexes.forEach((i) => db.exec(i))
      console.log(`${table}: created`)
      continue
    }
    if (hasColumn(table, 'organization_id')) continue
    const count = (db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n
    if (count > 0 && !org) throw new Error(`${table} has rows but there is no user to own them`)
    db.exec(def.create.replace(`\`${table}\``, `\`__new_${table}\``))
    const cols = def.columns.map((c) => `\`${c}\``).join(', ')
    db.prepare(
      `INSERT INTO \`__new_${table}\` (\`organization_id\`, ${cols}) SELECT ?, ${cols} FROM \`${table}\``,
    ).run(org?.id ?? null)
    db.exec(`DROP TABLE \`${table}\``)
    db.exec(`ALTER TABLE \`__new_${table}\` RENAME TO \`${table}\``)
    def.indexes.forEach((i) => db.exec(i))
    console.log(`${table}: rebuilt with ${count} row(s)`)
  }

  db.exec('COMMIT')
} catch (e) {
  db.exec('ROLLBACK')
  throw e
} finally {
  db.pragma('foreign_keys = ON')
}
const violations = db.prepare('PRAGMA foreign_key_check').all()
if (violations.length > 0) throw new Error(`foreign key violations: ${JSON.stringify(violations)}`)
console.log('done')

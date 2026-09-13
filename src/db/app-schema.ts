import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { nanoid } from 'nanoid'

import { organization } from './auth-schema.ts'

const id = () =>
  text()
    .primaryKey()
    .$defaultFn(() => nanoid())

// Every row belongs to a profile (Better Auth organization): Personal, Joint, ...
const orgId = () =>
  text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' })

export const categories = sqliteTable(
  'categories',
  {
    id: id(),
    organizationId: orgId(),
    name: text().notNull(),
    // Monthly budget in minor units (cents). Null = no budget set.
    budgetCents: integer('budget_cents'),
    // Excluded categories (e.g. transfers between our own accounts) don't count as spending.
    excluded: integer({ mode: 'boolean' }).notNull().default(false),
  },
  (t) => [uniqueIndex('categories_org_name').on(t.organizationId, t.name)],
)

// A normalised merchant ("Carrefour") that many raw counterparty strings map to.
export const merchants = sqliteTable(
  'merchants',
  {
    id: id(),
    organizationId: orgId(),
    name: text().notNull(),
    categoryId: text('category_id').references(() => categories.id, { onDelete: 'set null' }),
  },
  (t) => [uniqueIndex('merchants_org_name').on(t.organizationId, t.name)],
)

// Case-insensitive substring of the raw counterparty name -> merchant.
export const merchantRules = sqliteTable(
  'merchant_rules',
  {
    id: id(),
    organizationId: orgId(),
    pattern: text().notNull(),
    merchantId: text('merchant_id')
      .notNull()
      .references(() => merchants.id, { onDelete: 'cascade' }),
  },
  (t) => [uniqueIndex('merchant_rules_org_pattern').on(t.organizationId, t.pattern)],
)

export const transactions = sqliteTable(
  'transactions',
  {
    id: id(),
    organizationId: orgId(),
    // Bank-side id, used to dedupe imports.
    externalId: text('external_id').notNull(),
    // ISO date, YYYY-MM-DD.
    bookingDate: text('booking_date').notNull(),
    // Signed minor units: negative = money out.
    amountCents: integer('amount_cents').notNull(),
    currency: text().notNull(),
    // Raw counterparty name as the bank sent it.
    merchant: text().notNull(),
    description: text(),
    // Set by merchant rules; null = unclassified.
    merchantId: text('merchant_id').references(() => merchants.id, { onDelete: 'set null' }),
    // Who paid (debtor name for card payments), so joint spend can be split.
    payer: text(),
    // Bank transaction code, e.g. CARD_PAYMENT, TRANSFER.
    kind: text(),
    // BOOK or PDNG. Pending rows are imported and flipped once booked.
    status: text().notNull().default('BOOK'),
    // Enable Banking account uid; null for seeded/manual rows.
    accountUid: text('account_uid'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .default(sql`(unixepoch())`)
      .notNull(),
  },
  (t) => [
    index('transactions_booking_date_idx').on(t.organizationId, t.bookingDate),
    uniqueIndex('transactions_org_external').on(t.organizationId, t.externalId),
  ],
)

// One row per bank account authorised through Enable Banking.
export const bankConnections = sqliteTable(
  'bank_connections',
  {
    id: id(),
    organizationId: orgId(),
    sessionId: text('session_id').notNull(),
    accountUid: text('account_uid').notNull(),
    // Name as the bank reports it, and an optional label the user chose instead.
    name: text().notNull(),
    label: text(),
    iban: text(),
    currency: text().notNull(),
    aspsp: text().notNull(),
    // RFC3339; PSD2 consent expiry. Re-authorise after this.
    validUntil: text('valid_until').notNull(),
    lastSyncedAt: integer('last_synced_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .default(sql`(unixepoch())`)
      .notNull(),
  },
  (t) => [uniqueIndex('bank_connections_org_account').on(t.organizationId, t.accountUid)],
)

export type Category = typeof categories.$inferSelect
export type Merchant = typeof merchants.$inferSelect
export type Transaction = typeof transactions.$inferSelect
export type BankConnection = typeof bankConnections.$inferSelect

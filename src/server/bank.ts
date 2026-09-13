import { createHash } from 'node:crypto'
import { createServerOnlyFn } from '@tanstack/react-start'
import { and, asc, eq, inArray } from 'drizzle-orm'

import { db } from '#/db'
import { bankConnections, transactions } from '#/db/schema'
import { applyRules } from './classify'
import { createSession, fetchTransactions, type EbTransaction } from './enablebanking'

export const listConnections = createServerOnlyFn((orgId: string) =>
  db
    .select()
    .from(bankConnections)
    .where(eq(bankConnections.organizationId, orgId))
    .orderBy(asc(bankConnections.name))
    .all(),
)

/** Exchange the callback code for a session and upsert one connection per account. */
export const completeAuth = createServerOnlyFn(async (orgId: string, code: string) => {
  const session = await createSession(code)
  for (const a of session.accounts) {
    const row = {
      organizationId: orgId,
      sessionId: session.session_id,
      accountUid: a.uid,
      name: a.name ?? a.product ?? a.account_id?.iban ?? a.uid,
      iban: a.account_id?.iban ?? null,
      currency: a.currency,
      aspsp: session.aspsp.name,
      validUntil: session.access.valid_until,
    }
    db.insert(bankConnections)
      .values(row)
      .onConflictDoUpdate({
        target: [bankConnections.organizationId, bankConnections.accountUid],
        set: row,
      })
      .run()
  }
  return session.accounts.length
})

function toRow(
  orgId: string,
  t: EbTransaction,
  accountUid: string,
): typeof transactions.$inferInsert | null {
  const bookingDate = t.booking_date ?? t.value_date ?? t.transaction_date
  if (!bookingDate) return null
  const debit = t.credit_debit_indicator !== 'CRDT'
  const cents = Math.round(Number(t.transaction_amount.amount) * 100)
  const counterparty = debit ? t.creditor?.name : t.debtor?.name
  const description = t.remittance_information?.join(' ').trim() || null
  const externalId =
    t.entry_reference ??
    t.transaction_id ??
    createHash('sha1')
      .update([accountUid, bookingDate, cents, counterparty, description].join('|'))
      .digest('hex')
  return {
    organizationId: orgId,
    externalId,
    bookingDate,
    amountCents: debit ? -cents : cents,
    currency: t.transaction_amount.currency,
    merchant: counterparty ?? description ?? 'Unknown',
    description,
    payer: t.debtor?.name ?? null,
    kind: t.bank_transaction_code?.code ?? null,
    status: t.status === 'PDNG' ? 'PDNG' : 'BOOK',
    accountUid,
  }
}

/**
 * Pull the last 90 days for every connection. New rows are inserted (pending included);
 * known rows get their status/date/amount refreshed so pending -> booked is reflected.
 * Then merchant rules run over anything still unclassified.
 */
export const syncAll = createServerOnlyFn(async (orgId: string) => {
  const since = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString().slice(0, 10)
  let imported = 0
  for (const c of listConnections(orgId)) {
    const fetched = await fetchTransactions(c.accountUid, since)
    const rows = fetched
      .map((t) => toRow(orgId, t, c.accountUid))
      .filter((r): r is NonNullable<typeof r> => r !== null)
    if (rows.length > 0) {
      const known = new Set(
        db
          .select({ externalId: transactions.externalId })
          .from(transactions)
          .where(
            and(
              eq(transactions.organizationId, orgId),
              inArray(
                transactions.externalId,
                rows.map((r) => r.externalId),
              ),
            ),
          )
          .all()
          .map((r) => r.externalId),
      )
      imported += rows.filter((r) => !known.has(r.externalId)).length
      for (const r of rows) {
        db.insert(transactions)
          .values(r)
          .onConflictDoUpdate({
            target: [transactions.organizationId, transactions.externalId],
            set: { status: r.status, bookingDate: r.bookingDate, amountCents: r.amountCents },
          })
          .run()
      }
    }
    db.update(bankConnections)
      .set({ lastSyncedAt: new Date() })
      .where(eq(bankConnections.id, c.id))
      .run()
  }
  const classified = applyRules(orgId)
  return { imported, classified }
})

export const renameConnection = createServerOnlyFn(
  (orgId: string, id: string, label: string | null) =>
    db
      .update(bankConnections)
      .set({ label })
      .where(and(eq(bankConnections.id, id), eq(bankConnections.organizationId, orgId)))
      .run().changes,
)

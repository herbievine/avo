// Server-only Enable Banking client. Signs each request with the app's RSA key.
// Docs: https://enablebanking.com/docs/api/reference/
import { createPrivateKey, sign, type KeyObject } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createServerOnlyFn } from '@tanstack/react-start'

const API = 'https://api.enablebanking.com'

let cachedKey: KeyObject | undefined
function privateKey() {
  cachedKey ??= createPrivateKey(readFileSync(process.env.ENABLE_BANKING_KEY_PATH!))
  return cachedKey
}

export const isConfigured = createServerOnlyFn(() =>
  Boolean(process.env.ENABLE_BANKING_APP_ID && process.env.ENABLE_BANKING_KEY_PATH),
)

function b64url(input: Buffer | string) {
  return Buffer.from(input).toString('base64url')
}

function jwt() {
  const iat = Math.floor(Date.now() / 1000)
  const header = b64url(
    JSON.stringify({ typ: 'JWT', alg: 'RS256', kid: process.env.ENABLE_BANKING_APP_ID }),
  )
  const payload = b64url(
    JSON.stringify({
      iss: 'enablebanking.com',
      aud: 'api.enablebanking.com',
      iat,
      exp: iat + 3600,
    }),
  )
  const signature = b64url(sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), privateKey()))
  return `${header}.${payload}.${signature}`
}

async function eb<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${jwt()}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
  if (!res.ok) {
    throw new Error(`Enable Banking ${res.status} ${path}: ${await res.text()}`)
  }
  return res.json() as Promise<T>
}

export type Aspsp = { name: string; country: string; logo: string }

export type EbAccount = {
  uid: string
  name?: string
  product?: string
  currency: string
  account_id?: { iban?: string }
}

export type EbTransaction = {
  entry_reference?: string
  transaction_id?: string
  booking_date?: string
  value_date?: string
  transaction_date?: string
  transaction_amount: { amount: string; currency: string }
  credit_debit_indicator: 'CRDT' | 'DBIT' | 'DBTR'
  creditor?: { name?: string }
  debtor?: { name?: string }
  remittance_information?: string[]
  status?: 'BOOK' | 'PDNG' | string
  merchant_category_code?: string | null
  bank_transaction_code?: { code?: string | null } | null
}

export const listAspsps = createServerOnlyFn(async (country: string) => {
  const { aspsps } = await eb<{ aspsps: Aspsp[] }>(`/aspsps?country=${country}&psu_type=personal`)
  return aspsps
})

export const startAuth = createServerOnlyFn(
  (input: { name: string; country: string; redirectUrl: string; state: string }) => {
    const validUntil = new Date(Date.now() + 180 * 24 * 3600 * 1000).toISOString()
    return eb<{ url: string; authorization_id: string }>('/auth', {
      method: 'POST',
      body: JSON.stringify({
        access: { valid_until: validUntil },
        aspsp: { name: input.name, country: input.country },
        state: input.state,
        redirect_url: input.redirectUrl,
        psu_type: 'personal',
      }),
    })
  },
)

export const createSession = createServerOnlyFn((code: string) =>
  eb<{
    session_id: string
    accounts: EbAccount[]
    aspsp: { name: string; country: string }
    access: { valid_until: string }
  }>('/sessions', { method: 'POST', body: JSON.stringify({ code }) }),
)

export const fetchTransactions = createServerOnlyFn(
  async (accountUid: string, dateFrom: string) => {
    const all: EbTransaction[] = []
    let continuationKey: string | undefined
    do {
      const params = new URLSearchParams({ date_from: dateFrom })
      if (continuationKey) params.set('continuation_key', continuationKey)
      const page = await eb<{ transactions: EbTransaction[]; continuation_key?: string }>(
        `/accounts/${accountUid}/transactions?${params}`,
      )
      all.push(...page.transactions)
      continuationKey = page.continuation_key
    } while (continuationKey)
    return all
  },
)

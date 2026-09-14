import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { organization } from 'better-auth/plugins'
import { tanstackStartCookies } from 'better-auth/tanstack-start'

import { nanoid } from 'nanoid'

import { db } from '#/db'

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'sqlite' }),
  advanced: {
    // Other herbievine.com apps also use Better Auth and set a domain-wide cookie with the
    // default name; a distinct prefix keeps Avo's session cookie from being shadowed by it.
    cookiePrefix: 'avo',
    database: {
      generateId: () => nanoid(),
    },
    // Behind Cloudflare -> cloudflared -> Caddy every request comes from Caddy's Docker IP.
    // Read the real client IP so rate limits are per visitor, not shared by everyone.
    ipAddress: {
      ipAddressHeaders: ['cf-connecting-ip', 'x-forwarded-for'],
    },
  },
  emailAndPassword: {
    enabled: true,
    // Single-household app: every account sees all data, so sign-up is closed
    // unless ALLOW_SIGNUP=true (set it briefly to add a partner's account).
    disableSignUp: process.env.ALLOW_SIGNUP !== 'true',
  },
  plugins: [organization(), tanstackStartCookies()],
})

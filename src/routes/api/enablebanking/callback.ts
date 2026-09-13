import { createFileRoute } from '@tanstack/react-router'
import { deleteCookie, getCookie } from '@tanstack/react-start/server'

import { STATE_COOKIE } from '#/fns/bank'
import { completeAuth, syncAll } from '#/server/bank'
import { requireOrg } from '#/server/org'
import { getSession } from '#/server/session'

export const Route = createFileRoute('/api/enablebanking/callback')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await getSession())) return new Response('Unauthorized', { status: 401 })

        const url = new URL(request.url)
        const code = url.searchParams.get('code')
        const state = url.searchParams.get('state')
        const expected = getCookie(STATE_COOKIE)
        deleteCookie(STATE_COOKIE, { path: '/' })

        if (!code || !state || state !== expected) {
          return new Response('Invalid authorization callback', { status: 400 })
        }

        const org = await requireOrg()
        await completeAuth(org.id, code)
        const { imported } = await syncAll(org.id)
        // Response.redirect() has immutable headers, which breaks Start's cookie merging.
        return new Response(null, {
          status: 302,
          headers: { Location: `${process.env.APP_URL}/connect?imported=${imported}` },
        })
      },
    },
  },
})

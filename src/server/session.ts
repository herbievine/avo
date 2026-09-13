import { createServerOnlyFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'

import { auth } from '#/lib/auth'

export const getSession = createServerOnlyFn(async () => {
  const session = await auth.api.getSession({ headers: getRequest().headers })
  return session
})

export const requireSession = createServerOnlyFn(async () => {
  const session = await getSession()
  if (!session) throw new Response('Unauthorized', { status: 401 })
  return session
})

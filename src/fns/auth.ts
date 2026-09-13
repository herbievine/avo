import { createServerFn } from '@tanstack/react-start'

import { getSession } from '#/server/session'

export const getSessionFn = createServerFn({ method: 'GET' }).handler(() => getSession())

export const getAuthOptionsFn = createServerFn({ method: 'GET' }).handler(() => ({
  signupOpen: process.env.ALLOW_SIGNUP === 'true',
}))

import { useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'

import { getAuthOptionsFn } from '#/fns/auth'
import { authClient } from '#/lib/auth-client'
import { Logo } from '#/components/logo'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'

export const Route = createFileRoute('/login')({
  validateSearch: z.object({
    mode: z.enum(['signin', 'signup']).catch('signin'),
    redirect: z.string().optional().catch(undefined),
  }),
  loader: () => getAuthOptionsFn(),
  component: LoginPage,
})

function LoginPage() {
  const { mode: requested, redirect } = Route.useSearch()
  const { signupOpen } = Route.useLoaderData()
  const mode = signupOpen ? requested : 'signin'
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const f = new FormData(e.currentTarget)
    const email = String(f.get('email'))
    const password = String(f.get('password'))

    const res =
      mode === 'signup'
        ? await authClient.signUp.email({ email, password, name: String(f.get('name')) })
        : await authClient.signIn.email({ email, password })

    setBusy(false)
    if (res.error) {
      setError(res.error.message ?? 'Something went wrong')
      return
    }
    void navigate({ href: redirect ?? '/' })
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="mb-6 flex items-center gap-2">
        <Logo className="size-8" />
        <span className="text-lg font-semibold tracking-tight">Avo</span>
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{mode === 'signup' ? 'Create account' : 'Sign in'}</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            {mode === 'signup' && (
              <div className="space-y-1">
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" required />
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" minLength={8} required />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy}>
              {mode === 'signup' ? 'Sign up' : 'Sign in'}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {mode === 'signup' ? (
              <Link to="/login" search={{ mode: 'signin', redirect }}>
                Have an account? Sign in
              </Link>
            ) : (
              <Link to="/login" search={{ mode: 'signup', redirect }}>
                No account? Sign up
              </Link>
            )}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

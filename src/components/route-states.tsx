import { Link, useRouter, type ErrorComponentProps } from '@tanstack/react-router'

import { Button } from '#/components/ui/button'
import { Logo } from '#/components/logo'

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <Logo className="size-10" />
      <div className="space-y-2">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <div className="text-sm text-muted-foreground">{children}</div>
      </div>
    </div>
  )
}

export function NotFound() {
  return (
    <Shell title="Page not found">
      <p>That page doesn't exist.</p>
      <Button asChild variant="outline" className="mt-4">
        <Link to="/" search={{}}>
          Back to overview
        </Link>
      </Button>
    </Shell>
  )
}

export function RouteError({ error, reset }: ErrorComponentProps) {
  const router = useRouter()
  return (
    <Shell title="Something went wrong">
      <p className="break-words">{error instanceof Error ? error.message : String(error)}</p>
      <div className="mt-4 flex justify-center gap-2">
        <Button
          variant="outline"
          onClick={() => {
            reset()
            void router.invalidate()
          }}
        >
          Try again
        </Button>
        <Button asChild>
          <Link to="/" search={{}}>
            Overview
          </Link>
        </Button>
      </div>
    </Shell>
  )
}

export function Pending() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="size-5 animate-spin rounded-full border-2 border-muted border-t-foreground" />
    </div>
  )
}

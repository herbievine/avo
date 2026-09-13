import { useState } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { Pencil, RefreshCw } from 'lucide-react'
import { z } from 'zod'

import {
  listAspspsFn,
  listConnectionsFn,
  renameConnectionFn,
  startBankAuthFn,
  syncBankFn,
} from '#/fns/bank'
import type { BankConnection } from '#/db/schema'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'

const COUNTRIES = ['FR', 'BE', 'GB', 'IE', 'DE', 'NL', 'ES', 'IT', 'PT', 'LT']

export const Route = createFileRoute('/_authed/connect')({
  validateSearch: z.object({
    country: z.string().length(2).toUpperCase().catch('FR'),
    imported: z.number().int().nonnegative().optional().catch(undefined),
  }),
  loaderDeps: ({ search }) => ({ country: search.country }),
  loader: async ({ deps }) => {
    const [connections, banks] = await Promise.all([
      listConnectionsFn(),
      listAspspsFn({ data: deps }),
    ])
    return { connections, ...banks }
  },
  component: ConnectPage,
})

function ConnectPage() {
  const { connections, configured, aspsps } = Route.useLoaderData()
  const { country, imported } = Route.useSearch()
  const router = useRouter()
  const startAuth = useServerFn(startBankAuthFn)
  const sync = useServerFn(syncBankFn)
  const [renaming, setRenaming] = useState<BankConnection | null>(null)
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(
    imported === undefined ? null : `Imported ${imported} new transactions.`,
  )

  const visible = aspsps.filter((a) => a.name.toLowerCase().includes(filter.toLowerCase()))

  return (
    <div className="space-y-10">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Banks</h1>
        <p className="text-sm text-muted-foreground">
          Read-only access through Enable Banking. Consent lasts 180 days.
        </p>
      </header>

      {message && <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">{message}</p>}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">Connected accounts</h2>
          {connections.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                try {
                  const res = await sync()
                  setMessage(
                    `Imported ${res.imported} new transactions, classified ${res.classified}.`,
                  )
                  await router.invalidate()
                } catch (e) {
                  setMessage(e instanceof Error ? e.message : 'Sync failed')
                } finally {
                  setBusy(false)
                }
              }}
            >
              <RefreshCw className={busy ? 'animate-spin' : ''} />
              {busy ? 'Syncing…' : 'Sync now'}
            </Button>
          )}
        </div>
        {connections.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            No accounts connected yet.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {connections.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium">{c.label ?? c.name}</span>
                    <button
                      type="button"
                      aria-label="Rename account"
                      onClick={() => setRenaming(c)}
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                  </div>
                  {c.label && (
                    <div className="truncate text-xs text-muted-foreground">{c.name}</div>
                  )}
                  <div className="truncate text-xs text-muted-foreground">
                    {c.aspsp}
                    {c.currency && c.currency !== 'XXX' ? ` · ${c.currency}` : ''}
                    {c.iban ? ` · ${c.iban}` : ''}
                  </div>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <div>Consent until {c.validUntil.slice(0, 10)}</div>
                  <div>
                    Synced {c.lastSyncedAt ? new Date(c.lastSyncedAt).toLocaleString() : 'never'}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Add a bank</h2>
        {!configured ? (
          <p className="text-sm text-destructive">
            Set ENABLE_BANKING_APP_ID and ENABLE_BANKING_KEY_PATH in .env.local to enable this.
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select
                value={country}
                onValueChange={(v) =>
                  void router.navigate({ to: '/connect', search: { country: v } })
                }
              >
                <SelectTrigger className="w-full sm:w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="Filter banks…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="sm:max-w-xs"
              />
            </div>
            <ul className="max-h-[28rem] divide-y overflow-y-auto rounded-lg border">
              {visible.map((a) => (
                <li key={a.name} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-white p-0.5 ring-1 ring-border">
                    <img src={a.logo} alt="" className="size-full object-contain" />
                  </span>
                  <span className="flex-1 truncate text-sm">{a.name}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true)
                      try {
                        const { url } = await startAuth({ data: { name: a.name, country } })
                        window.location.assign(url)
                      } catch (e) {
                        setMessage(e instanceof Error ? e.message : 'Could not start authorization')
                        setBusy(false)
                      }
                    }}
                  >
                    Connect
                  </Button>
                </li>
              ))}
              {visible.length === 0 && (
                <li className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No banks match.
                </li>
              )}
            </ul>
          </>
        )}
      </section>

      <RenameDialog connection={renaming} onClose={() => setRenaming(null)} />
    </div>
  )
}

function RenameDialog({
  connection,
  onClose,
}: {
  connection: BankConnection | null
  onClose: () => void
}) {
  const router = useRouter()
  const rename = useServerFn(renameConnectionFn)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!connection) return
    setBusy(true)
    try {
      const label = String(new FormData(e.currentTarget).get('label') ?? '')
      await rename({ data: { id: connection.id, label } })
      await router.invalidate()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={connection !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        {connection && (
          <form key={connection.id} onSubmit={submit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Rename account</DialogTitle>
              <DialogDescription>
                Shown instead of the bank's name. Leave empty to use “{connection.name}”.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="account-label">Label</Label>
              <Input
                id="account-label"
                name="label"
                defaultValue={connection.label ?? ''}
                placeholder="Joint CA"
                maxLength={40}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

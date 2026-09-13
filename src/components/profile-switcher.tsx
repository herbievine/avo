import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { Check, ChevronsUpDown, Plus } from 'lucide-react'

import { createProfileFn, switchProfileFn } from '#/fns/org'
import type { Profile } from '#/server/org'
import { Logo } from '#/components/logo'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { SidebarMenuButton } from '#/components/ui/sidebar'

/**
 * Profile (organization) switcher: Personal, Joint, Professional… Each profile has
 * its own banks, categories and transactions. `variant="sidebar"` renders as a
 * sidebar menu button; `"compact"` as a small pill for the phone header.
 */
export function ProfileSwitcher({
  profiles,
  active,
  variant,
}: {
  profiles: Profile[]
  active: Profile
  variant: 'sidebar' | 'compact'
}) {
  const router = useRouter()
  const switchProfile = useServerFn(switchProfileFn)
  const createProfile = useServerFn(createProfileFn)
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function select(id: string) {
    if (id === active.id) return
    await switchProfile({ data: { organizationId: id } })
    await router.invalidate()
  }

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const name = String(new FormData(e.currentTarget).get('name') ?? '').trim()
    if (!name) return
    setBusy(true)
    setError(null)
    try {
      await createProfile({ data: { name } })
      setCreating(false)
      await router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create profile')
    } finally {
      setBusy(false)
    }
  }

  const trigger =
    variant === 'sidebar' ? (
      <SidebarMenuButton
        size="lg"
        className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
      >
        <Logo className="size-8" />
        <span className="grid flex-1 text-left leading-tight">
          <span className="truncate text-sm font-semibold">{active.name}</span>
          <span className="truncate text-xs text-muted-foreground">Profile</span>
        </span>
        <ChevronsUpDown className="ml-auto size-4" />
      </SidebarMenuButton>
    ) : (
      <button
        type="button"
        className="flex h-8 items-center gap-1.5 rounded-full border bg-background px-3 text-sm font-medium"
      >
        <span className="max-w-32 truncate">{active.name}</span>
        <ChevronsUpDown className="size-3.5 text-muted-foreground" />
      </button>
    )

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          side={variant === 'sidebar' ? 'right' : 'bottom'}
          className="min-w-56"
        >
          <DropdownMenuLabel className="text-xs text-muted-foreground">Profiles</DropdownMenuLabel>
          {profiles.map((p) => (
            <DropdownMenuItem key={p.id} onClick={() => void select(p.id)}>
              <span className="flex size-6 items-center justify-center rounded-md border text-xs font-medium">
                {p.name.charAt(0).toUpperCase()}
              </span>
              <span className="flex-1 truncate">{p.name}</span>
              {p.id === active.id && <Check className="size-4" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setCreating(true)}>
            <span className="flex size-6 items-center justify-center rounded-md border border-dashed">
              <Plus className="size-3.5" />
            </span>
            New profile
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-sm">
          <form onSubmit={create} className="space-y-4">
            <DialogHeader>
              <DialogTitle>New profile</DialogTitle>
              <DialogDescription>
                A profile keeps its own banks, categories and transactions. For example Personal,
                Joint or Professional.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="profile-name">Name</Label>
              <Input id="profile-name" name="name" placeholder="Personal" autoFocus required />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreating(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? 'Creating…' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

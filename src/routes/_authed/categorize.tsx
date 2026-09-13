import { useState } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { Check } from 'lucide-react'

import { createRuleFn, listUncategorizedFn } from '#/fns/bank'
import { listCategoriesFn } from '#/fns/transactions'
import { formatCents, suggestPattern, titleCase } from '#/lib/money'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'

export const Route = createFileRoute('/_authed/categorize')({
  loader: async () => {
    const [groups, categories] = await Promise.all([listUncategorizedFn(), listCategoriesFn()])
    return { groups, categories }
  },
  component: CategorizePage,
})

type Group = Awaited<ReturnType<typeof listUncategorizedFn>>[number]
type Category = Awaited<ReturnType<typeof listCategoriesFn>>[number]

const NEW = '__new__'

function CategorizePage() {
  const { groups, categories } = Route.useLoaderData()
  const total = groups.reduce((s, g) => s + g.count, 0)

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">To categorize</h1>
        <p className="text-sm text-muted-foreground">
          {total === 0
            ? 'Everything is categorized.'
            : `${total} transactions across ${groups.length} merchants. Each save adds a rule, so future imports are sorted automatically.`}
        </p>
      </header>

      {groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed px-6 py-12 text-center">
          <Check className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium">All sorted</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {groups.map((g) => (
            <GroupRow key={g.merchant} group={g} categories={categories} />
          ))}
        </ul>
      )}
    </div>
  )
}

function GroupRow({ group, categories }: { group: Group; categories: Category[] }) {
  const router = useRouter()
  const createRule = useServerFn(createRuleFn)
  const [category, setCategory] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const suggested = suggestPattern(group.merchant)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setBusy(true)
    setError(null)
    try {
      await createRule({
        data: {
          pattern: String(f.get('pattern')),
          merchantName: String(f.get('name')),
          categoryId: category && category !== NEW ? category : undefined,
          newCategory: category === NEW ? String(f.get('newCategory')) : undefined,
        },
      })
      await router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
      setBusy(false)
    }
  }

  return (
    <li className="rounded-2xl border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="min-w-0 flex-1 truncate font-mono text-sm" title={group.merchant}>
          {group.merchant}
        </p>
        <p className="text-sm text-muted-foreground tabular-nums">
          {group.count} × · {formatCents(group.totalCents)} · last {group.lastDate}
          {group.kind ? ` · ${group.kind.toLowerCase().replace('_', ' ')}` : ''}
        </p>
      </div>
      <form onSubmit={submit} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
        <Input
          name="name"
          defaultValue={titleCase(suggested)}
          placeholder="Merchant name"
          required
        />
        <Input
          name="pattern"
          defaultValue={suggested}
          placeholder="text to match (lowercase)"
          required
          className="font-mono text-xs"
        />
        <div className="grid gap-2">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger>
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                  {c.excluded ? ' (excluded)' : ''}
                </SelectItem>
              ))}
              <SelectSeparator />
              <SelectItem value={NEW}>New category…</SelectItem>
            </SelectContent>
          </Select>
          {category === NEW && (
            <Input name="newCategory" placeholder="Category name" required autoFocus />
          )}
        </div>
        <Button type="submit" disabled={busy || !category}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </form>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </li>
  )
}

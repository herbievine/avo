import { useState } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { Plus, Trash2 } from 'lucide-react'

import {
  createCategoryFn,
  deleteCategoryFn,
  listCategoriesWithStatsFn,
  updateCategoryFn,
} from '#/fns/categories'
import { formatCents } from '#/lib/money'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'

export const Route = createFileRoute('/_authed/categories')({
  loader: () => listCategoriesWithStatsFn(),
  component: CategoriesPage,
})

type Category = Awaited<ReturnType<typeof listCategoriesWithStatsFn>>[number]

function CategoriesPage() {
  const categories = Route.useLoaderData()
  const router = useRouter()
  const create = useServerFn(createCategoryFn)
  const [busy, setBusy] = useState(false)
  const budgeted = categories.filter((c) => !c.excluded && c.budgetCents)
  const totalBudget = budgeted.reduce((s, c) => s + (c.budgetCents ?? 0), 0)

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Categories</h1>
        <p className="text-sm text-muted-foreground">
          {budgeted.length > 0
            ? `${formatCents(totalBudget)} budgeted per month across ${budgeted.length} categories.`
            : 'Set a monthly budget to track categories on the overview.'}{' '}
          Excluded categories (transfers, savings) never count as spending.
        </p>
      </header>

      <ul className="divide-y overflow-hidden rounded-2xl border">
        {categories.map((c) => (
          <CategoryRow key={c.id} category={c} />
        ))}
      </ul>

      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault()
          const form = e.currentTarget
          const name = String(new FormData(form).get('name') ?? '').trim()
          if (!name) return
          setBusy(true)
          try {
            await create({ data: { name } })
            form.reset()
            await router.invalidate()
          } finally {
            setBusy(false)
          }
        }}
      >
        <Input name="name" placeholder="New category" className="max-w-xs" required />
        <Button type="submit" variant="outline" disabled={busy}>
          <Plus />
          Add
        </Button>
      </form>
    </div>
  )
}

function CategoryRow({ category: c }: { category: Category }) {
  const router = useRouter()
  const update = useServerFn(updateCategoryFn)
  const remove = useServerFn(deleteCategoryFn)
  const [saving, setSaving] = useState(false)

  async function save(patch: { name?: string; budgetCents?: number | null; excluded?: boolean }) {
    setSaving(true)
    try {
      await update({ data: { ...patch, id: c.id } })
      await router.invalidate()
    } finally {
      setSaving(false)
    }
  }

  return (
    <li
      className={`grid gap-3 px-4 py-3 sm:grid-cols-[1fr_10rem_auto_auto] sm:items-center ${c.excluded ? 'bg-muted/30' : ''}`}
    >
      <div className="min-w-0">
        <Input
          defaultValue={c.name}
          aria-label="Category name"
          className="h-8 border-transparent bg-transparent px-1 font-medium shadow-none hover:border-input focus-visible:border-input"
          onBlur={(e) => {
            const name = e.target.value.trim()
            if (name && name !== c.name) void save({ name })
          }}
        />
        <p className="px-1 text-xs text-muted-foreground">
          {c.merchantCount} merchant{c.merchantCount === 1 ? '' : 's'}
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">€</span>
        <Input
          type="number"
          inputMode="decimal"
          min={0}
          step={1}
          placeholder="No budget"
          aria-label="Monthly budget"
          defaultValue={c.budgetCents ? c.budgetCents / 100 : ''}
          disabled={c.excluded}
          className="h-8 tabular-nums"
          onBlur={(e) => {
            const v = e.target.value.trim()
            const cents = v === '' ? null : Math.round(Number(v) * 100)
            if (cents !== c.budgetCents) void save({ budgetCents: cents })
          }}
        />
        <span className="text-xs text-muted-foreground">/mo</span>
      </label>

      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          className="size-4 accent-foreground"
          checked={c.excluded}
          onChange={(e) => void save({ excluded: e.target.checked })}
        />
        Excluded
      </label>

      <Button
        variant="ghost"
        size="icon"
        aria-label={`Delete ${c.name}`}
        disabled={saving}
        className="size-8 text-muted-foreground hover:text-destructive"
        onClick={async () => {
          if (
            !confirm(`Delete "${c.name}"? Its ${c.merchantCount} merchant(s) become uncategorized.`)
          )
            return
          await remove({ data: { id: c.id } })
          await router.invalidate()
        }}
      >
        <Trash2 />
      </Button>
    </li>
  )
}

import { useState } from 'react'
import { Link, createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import {
  columnVisibilityFeature,
  createColumnHelper,
  flexRender,
  tableFeatures,
  useTable,
  type ColumnDef,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ArrowUpDown, Search, Settings2, Sparkles } from 'lucide-react'
import { z } from 'zod'

import { applyRulesFn, listConnectionsFn } from '#/fns/bank'
import { setMerchantCategoryFn } from '#/fns/categories'
import { isoDateSchema, listCategoriesFn, listTransactionsFn } from '#/fns/transactions'
import { monthRange } from '#/lib/dates'
import { accountLabel, firstName, formatCents } from '#/lib/money'
import { DateRangePicker } from '#/components/date-range-picker'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'

const searchSchema = z.object({
  from: isoDateSchema.catch(() => monthRange().from),
  to: isoDateSchema.catch(() => monthRange().to),
  // A category id, or 'none' for transactions without one.
  categoryId: z.string().min(1).optional().catch(undefined),
  // A bank account uid.
  accountUid: z.string().min(1).optional().catch(undefined),
  q: z.string().trim().min(1).optional().catch(undefined),
  page: z.number().int().positive().catch(1),
  sort: z.enum(['date', 'amount']).catch('date'),
  dir: z.enum(['asc', 'desc']).catch('desc'),
})

export const Route = createFileRoute('/_authed/transactions')({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const [result, categories, accounts] = await Promise.all([
      listTransactionsFn({ data: deps }),
      listCategoriesFn(),
      listConnectionsFn(),
    ])
    return { ...result, categories, accounts }
  },
  // Fully server-rendered: the table is plain HTML, so phones get content on first paint.
  component: TransactionsPage,
})

type Row = Awaited<ReturnType<typeof listTransactionsFn>>['rows'][number]
type Sort = z.infer<typeof searchSchema>['sort']

const features = tableFeatures({ columnVisibilityFeature })
const col = createColumnHelper<typeof features, Row>()

function SortHeader({
  label,
  sortKey,
  sort,
  dir,
  right,
  onToggle,
}: {
  label: string
  sortKey: Sort
  sort: Sort
  dir: 'asc' | 'desc'
  right?: boolean
  onToggle: (key: Sort) => void
}) {
  const active = sort === sortKey
  const Icon = active ? (dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown
  return (
    <Button
      variant="ghost"
      size="sm"
      className={`-mx-2 h-8 ${right ? 'ml-auto flex' : ''}`}
      onClick={() => onToggle(sortKey)}
    >
      {label}
      <Icon className={active ? '' : 'text-muted-foreground'} />
    </Button>
  )
}

/** Badge that opens a category select; changes apply to the merchant (all its transactions). */
function CategoryPicker({
  merchantId,
  categoryId,
  label,
  categories,
}: {
  merchantId: string
  categoryId: string | null
  label: string | null
  categories: Array<{ id: string; name: string }>
}) {
  const router = useRouter()
  const setCategory = useServerFn(setMerchantCategoryFn)
  return (
    <Select
      value={categoryId ?? 'none'}
      onValueChange={async (v) => {
        await setCategory({ data: { merchantId, categoryId: v === 'none' ? null : v } })
        await router.invalidate()
      }}
    >
      <SelectTrigger
        size="sm"
        aria-label="Change category"
        className="h-7 w-auto gap-1 rounded-full border-transparent bg-secondary px-2.5 text-xs font-normal shadow-none hover:border-input [&>svg]:size-3"
      >
        <SelectValue placeholder="—">{label ?? '—'}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {categories.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.name}
          </SelectItem>
        ))}
        <SelectSeparator />
        <SelectItem value="none">No category</SelectItem>
      </SelectContent>
    </Select>
  )
}

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })

function TransactionsPage() {
  const { rows, total, pageSize, categories, accounts } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const router = useRouter()
  const applyRules = useServerFn(applyRulesFn)
  const [busy, setBusy] = useState(false)
  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  const go = (patch: Partial<typeof search>) =>
    void navigate({ search: { ...search, page: 1, ...patch } })

  const toggleSort = (key: Sort) =>
    go({ sort: key, dir: search.sort === key && search.dir === 'desc' ? 'asc' : 'desc' })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- column value types vary per column
  const columns: ColumnDef<typeof features, Row, any>[] = [
    col.accessor('bookingDate', {
      header: () => (
        <SortHeader
          label="Date"
          sortKey="date"
          sort={search.sort}
          dir={search.dir}
          onToggle={toggleSort}
        />
      ),
      cell: (c) => (
        <span className="whitespace-nowrap text-muted-foreground">{shortDate(c.getValue())}</span>
      ),
      enableHiding: false,
    }),
    col.accessor('merchant', {
      header: 'Merchant',
      cell: (c) => (
        <div className="min-w-0">
          <div className="truncate font-medium">{c.getValue()}</div>
          {c.row.original.rawMerchant !== c.getValue() && (
            <div className="truncate text-xs text-muted-foreground">
              {c.row.original.rawMerchant}
            </div>
          )}
        </div>
      ),
      enableHiding: false,
    }),
    col.accessor('category', {
      header: 'Category',
      cell: (c) =>
        c.row.original.merchantId ? (
          <CategoryPicker
            merchantId={c.row.original.merchantId}
            categoryId={c.row.original.categoryId}
            label={c.getValue()}
            categories={categories}
          />
        ) : (
          <Link
            to="/categorize"
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            Categorize
          </Link>
        ),
    }),
    col.accessor('bank', {
      id: 'account',
      header: 'Account',
      cell: (c) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {accountLabel(c.row.original.accountLabel, c.getValue(), c.row.original.iban)}
        </span>
      ),
    }),
    col.accessor('payer', {
      header: 'Paid by',
      cell: (c) => <span className="text-muted-foreground">{firstName(c.getValue())}</span>,
    }),
    col.accessor('amountCents', {
      header: () => (
        <SortHeader
          label="Amount"
          sortKey="amount"
          sort={search.sort}
          dir={search.dir}
          right
          onToggle={toggleSort}
        />
      ),
      cell: (c) => (
        <span
          className={`flex items-center justify-end gap-2 whitespace-nowrap tabular-nums ${c.getValue() < 0 ? '' : 'text-emerald-600 dark:text-emerald-400'}`}
        >
          {c.row.original.status === 'PDNG' && (
            <Badge variant="outline" className="font-normal text-muted-foreground">
              pending
            </Badge>
          )}
          {formatCents(c.getValue(), c.row.original.currency)}
        </span>
      ),
      enableHiding: false,
    }),
  ]

  const table = useTable<typeof features, Row>({ features, columns, data: rows })

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Transactions</h1>
          <p className="text-sm text-muted-foreground">{total} in this range</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try {
              await applyRules()
              await router.invalidate()
            } finally {
              setBusy(false)
            }
          }}
        >
          <Sparkles />
          {busy ? 'Applying…' : 'Apply rules'}
        </Button>
      </header>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <DateRangePicker
          value={{ from: search.from, to: search.to }}
          onChange={(r) => go(r)}
          className="w-full sm:w-auto"
        />
        <Select
          value={search.categoryId ?? 'all'}
          onValueChange={(v) => go({ categoryId: v === 'all' ? undefined : v })}
        >
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            <SelectItem value="none">Uncategorized</SelectItem>
            <SelectSeparator />
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {accounts.length > 1 && (
          <Select
            value={search.accountUid ?? 'all'}
            onValueChange={(v) => go({ accountUid: v === 'all' ? undefined : v })}
          >
            <SelectTrigger className="w-full sm:w-52">
              <SelectValue placeholder="Account" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All accounts</SelectItem>
              <SelectSeparator />
              {accounts.map((a) => (
                <SelectItem key={a.accountUid} value={a.accountUid}>
                  {accountLabel(a.label, a.aspsp, a.iban)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <form
          className="relative flex-1 sm:max-w-xs"
          onSubmit={(e) => {
            e.preventDefault()
            const q = String(new FormData(e.currentTarget).get('q')).trim()
            go({ q: q || undefined })
          }}
        >
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            key={search.q ?? ''}
            name="q"
            placeholder="Search merchants…"
            defaultValue={search.q ?? ''}
            className="pl-8"
          />
        </form>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="hidden sm:ml-auto sm:inline-flex">
              <Settings2 />
              View
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Columns</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {table
              .getAllLeafColumns()
              .filter((c) => c.getCanHide())
              .map((c) => (
                <DropdownMenuCheckboxItem
                  key={c.id}
                  className="capitalize"
                  checked={c.getIsVisible()}
                  onCheckedChange={(v) => c.toggleVisibility(!!v)}
                >
                  {c.id === 'payer' ? 'Paid by' : c.id}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Mobile: card list */}
      <ul className="divide-y rounded-lg border md:hidden">
        {rows.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-muted-foreground">
            No transactions for this filter.
          </li>
        )}
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{r.merchant}</div>
              <div className="truncate text-xs text-muted-foreground">
                {shortDate(r.bookingDate)}
                {r.category ? ` · ${r.category}` : ' · uncategorized'}
                {r.bank ? ` · ${accountLabel(r.accountLabel, r.bank, r.iban)}` : ''}
              </div>
            </div>
            <div className="text-right">
              <div
                className={`text-sm tabular-nums ${r.amountCents < 0 ? '' : 'text-emerald-600 dark:text-emerald-400'}`}
              >
                {formatCents(r.amountCents, r.currency)}
              </div>
              {r.status === 'PDNG' && <div className="text-xs text-muted-foreground">pending</div>}
            </div>
          </li>
        ))}
      </ul>

      {/* Desktop: data table */}
      <div className="hidden overflow-hidden rounded-lg border md:block">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="hover:bg-transparent">
                {hg.headers.map((h) => (
                  <TableHead key={h.id} className="h-10 text-xs">
                    {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={table.getVisibleLeafColumns().length}
                  className="h-24 text-center text-muted-foreground"
                >
                  No transactions for this filter.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((r) => (
                <TableRow key={r.id}>
                  {r.getVisibleCells().map((c) => (
                    <TableCell key={c.id} className="py-2.5">
                      {flexRender(c.column.columnDef.cell, c.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          Page {search.page} of {pageCount}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={search.page <= 1}
            onClick={() => void navigate({ search: { ...search, page: search.page - 1 } })}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={search.page >= pageCount}
            onClick={() => void navigate({ search: { ...search, page: search.page + 1 } })}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  )
}

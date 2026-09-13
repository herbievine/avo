import { Link, linkOptions, useNavigate, useRouterState } from '@tanstack/react-router'
import { Landmark, LayoutDashboard, LogOut, ReceiptText, Tags } from 'lucide-react'

import { authClient } from '#/lib/auth-client'
import { defaultTransactionsSearch } from '#/lib/dates'
import { Logo } from '#/components/logo'
import { ProfileSwitcher } from '#/components/profile-switcher'
import type { Profile } from '#/server/org'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'

type User = { name: string; email: string; image?: string | null }

export const NAV = [
  {
    title: 'Overview',
    link: linkOptions({ to: '/', search: {} }),
    icon: LayoutDashboard,
    exact: true,
  },
  {
    title: 'Transactions',
    link: linkOptions({ to: '/transactions', search: defaultTransactionsSearch() }),
    icon: ReceiptText,
    exact: false,
  },
  {
    title: 'To categorize',
    link: linkOptions({ to: '/categorize' }),
    icon: Tags,
    exact: false,
  },
  {
    title: 'Banks',
    link: linkOptions({ to: '/connect', search: { country: 'FR' } }),
    icon: Landmark,
    exact: false,
  },
]

export function useActivePath() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  return (to: string, exact: boolean) => (exact ? pathname === to : pathname.startsWith(to))
}

/** Top bar for phones: brand on the left, account menu on the right. */
export function MobileHeader({
  user,
  profiles,
  active,
}: {
  user: User
  profiles: Profile[]
  active: Profile
}) {
  const navigate = useNavigate()
  const initial = user.name?.charAt(0).toUpperCase() || 'U'
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b bg-background/85 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-md md:hidden">
      <div className="flex h-14 items-center gap-2">
        <Logo className="size-6" />
        <ProfileSwitcher profiles={profiles} active={active} variant="compact" />
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Account"
          className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-medium"
        >
          {user.image ? <img src={user.image} alt="" className="size-8 rounded-full" /> : initial}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuLabel className="font-normal">
            <div className="grid text-sm leading-tight">
              <span className="truncate font-medium">{user.name}</span>
              <span className="truncate text-xs text-muted-foreground">{user.email}</span>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={async () => {
              await authClient.signOut()
              void navigate({ to: '/login', search: { mode: 'signin' } })
            }}
          >
            <LogOut />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}

/** Bottom tab bar for phones, padded for the iPhone home indicator. */
export function MobileTabBar() {
  const isActive = useActivePath()
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
    >
      <ul className="grid grid-cols-4">
        {NAV.map((item) => {
          const active = isActive(item.link.to, item.exact)
          return (
            <li key={item.link.to}>
              <Link
                {...item.link}
                className={`flex h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${active ? 'text-foreground' : 'text-muted-foreground'}`}
              >
                <item.icon className="size-5" strokeWidth={active ? 2.25 : 1.75} />
                {item.title}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

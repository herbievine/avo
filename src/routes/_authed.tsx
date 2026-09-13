import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'

import { getSessionFn } from '#/fns/auth'
import { getProfilesFn } from '#/fns/org'
import { AppSidebar } from '#/components/app-sidebar'
import { MobileHeader, MobileTabBar } from '#/components/mobile-nav'
import { SidebarInset, SidebarProvider } from '#/components/ui/sidebar'

export const Route = createFileRoute('/_authed')({
  beforeLoad: async ({ location }) => {
    const session = await getSessionFn()
    if (!session) {
      throw redirect({ to: '/login', search: { mode: 'signin', redirect: location.href } })
    }
    const { profiles, active } = await getProfilesFn()
    return { user: session.user, profiles, active }
  },
  component: AuthedLayout,
})

function AuthedLayout() {
  const { user, profiles, active } = Route.useRouteContext()
  return (
    <SidebarProvider>
      <AppSidebar user={user} profiles={profiles} active={active} />
      <SidebarInset className="min-h-dvh">
        <MobileHeader user={user} profiles={profiles} active={active} />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-5 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:px-6 md:pb-10 lg:px-8 lg:pt-10">
          <Outlet />
        </main>
        <MobileTabBar />
      </SidebarInset>
    </SidebarProvider>
  )
}

import { Outlet } from 'react-router-dom'
import { useEnsureValidJournal } from '@/permissions/hooks'
import { CommandPalette } from './CommandPalette'
import { MobileNav, Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

export function AppLayout() {
  useEnsureValidJournal()
  return (
    <div className="flex h-screen overflow-hidden bg-page">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[200] focus:rounded focus:bg-surface focus:px-3 focus:py-2">Skip to content</a>
      <Sidebar />
      <MobileNav />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main id="main" tabIndex={-1} className="flex-1 overflow-y-auto p-6 outline-none">
          <Outlet />
        </main>
      </div>
      <CommandPalette />
    </div>
  )
}

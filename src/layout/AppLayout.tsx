import { Outlet } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { useEnsureValidJournal, useRole } from '@/permissions/hooks'
import { CommandPalette } from './CommandPalette'
import { MobileNav, Sidebar } from './Sidebar'
import { SectionTabs } from './SectionTabs'
import { Topbar } from './Topbar'

export function AppLayout() {
  useEnsureValidJournal()
  const role = useRole()
  return (
    <div className="relative flex h-screen overflow-hidden bg-page">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[200] focus:rounded focus:bg-surface focus:px-3 focus:py-2">Skip to content</a>
      <Sidebar />
      <MobileNav />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main id="main" tabIndex={-1} className="relative flex-1 overflow-y-auto p-6 outline-none">
          {(role === 'reviewer' || role === 'panel_member') && (
            <p role="note" className="mb-5 flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-900"><ShieldCheck size={16} className="shrink-0" aria-hidden /> Double Blind Peer Review (Anonymous)</p>
          )}
          <SectionTabs />
          <Outlet />
        </main>
      </div>
      <CommandPalette />
    </div>
  )
}

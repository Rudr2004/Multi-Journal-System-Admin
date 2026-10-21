import type { ReactNode } from 'react'
import { Loader2, ShieldCheck } from 'lucide-react'
import { Logo } from '@/layout/Sidebar'
import { cn } from '@/lib/utils'

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,600px)]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-slate-900 p-12 text-white lg:flex">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-indigo-500/20 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-indigo-400/10 blur-3xl" />
        <div className="relative flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent"><svg width="18" height="18" viewBox="0 0 32 32" fill="none" aria-hidden><path d="M7 9h18M7 16h18M7 23h11" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg></div>
          <div className="leading-tight"><div className="text-sm font-semibold">Journal Admin</div><div className="text-xs text-slate-400">EdTech Publishers Pvt. Ltd.</div></div>
        </div>
        <div className="relative max-w-md">
          <h2 className="text-[34px] font-semibold leading-[1.15] tracking-tight">One workspace for every journal you publish.</h2>
          <p className="mt-4 text-base text-slate-300">Screen submissions, assign reviews, verify payments, publish issues and keep authors informed — across IJMAT, JIMRT, IJCSD, IJECM and IJFRD.</p>
          <ul className="mt-8 space-y-3 text-sm text-slate-300">
            {['Role-based access per journal', 'Automated 08:45 author dispatch', 'DOI, Crossref and GST invoicing built in'].map((t) => (
              <li key={t} className="flex items-center gap-3"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500/25 text-indigo-300"><ShieldCheck size={12} aria-hidden /></span>{t}</li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-slate-500">Staff access only. Authors and readers do not sign in here.</p>
      </aside>
      <main className="flex flex-col items-center justify-center bg-page px-5 py-10">
        <div className="mb-6 lg:hidden"><Logo /></div>
        <div className="w-full max-w-[440px]">
          <div className="card p-7">
            <h1 className="text-[24px] font-semibold tracking-tight">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
            <div className="mt-6">{children}</div>
          </div>
          {footer && <div className="mt-4 text-center text-sm text-muted">{footer}</div>}
        </div>
      </main>
    </div>
  )
}

const TONE = {
  error: 'border-red-200 bg-red-50 text-red-700',
  success: 'border-green-200 bg-green-50 text-green-800',
  info: 'border-indigo-200 bg-indigo-50 text-indigo-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
} as const

/** Inline message above a form. Errors are announced to screen readers; the others are polite. */
export function Notice({ tone = 'error', children, className }: { tone?: keyof typeof TONE; children: ReactNode; className?: string }) {
  return <div role={tone === 'error' ? 'alert' : 'status'} className={cn('rounded-md border px-3 py-2 text-sm', TONE[tone], className)}>{children}</div>
}

/** Shown while the session is restored from the refresh cookie. */
export function SessionLoading() {
  return (
    <div role="status" className="flex min-h-screen items-center justify-center gap-2 bg-page text-sm text-muted">
      <Loader2 size={16} className="animate-spin" aria-hidden /> Restoring your session…
    </div>
  )
}

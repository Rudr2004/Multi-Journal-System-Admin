import { cn } from '@/lib/utils'

export function SectionCard({ title, action, children, className, flush }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string; flush?: boolean }) {
  return (
    <section className={cn('card', className)}>
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 className="text-[16px] font-semibold">{title}</h2>
        {action}
      </header>
      <div className={flush ? '' : 'p-4'}>{children}</div>
    </section>
  )
}

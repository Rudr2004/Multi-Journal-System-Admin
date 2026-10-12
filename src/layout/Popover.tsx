import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Click-outside / Esc dismissable popover. `trigger` receives toggle props. */
export function Popover({
  trigger, children, align = 'left', panelClassName,
}: {
  trigger: (p: { open: boolean; toggle: () => void; props: { 'aria-haspopup': 'menu'; 'aria-expanded': boolean } }) => ReactNode
  children: (close: () => void) => ReactNode
  align?: 'left' | 'right'
  panelClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', down)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('mousedown', down)
      document.removeEventListener('keydown', key)
    }
  }, [open])
  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => setOpen((o) => !o), props: { 'aria-haspopup': 'menu', 'aria-expanded': open } })}
      {open && (
        <div className={cn('absolute top-full z-50 mt-1.5 rounded-lg border border-line bg-surface shadow-overlay', align === 'right' ? 'right-0' : 'left-0', panelClassName)}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BaseProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children?: ReactNode
  footer?: ReactNode
}

/** Native <dialog>: focus trap, Esc to close and aria-modal come for free. */
function useDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  useEffect(() => {
    const d = ref.current
    if (!d) return
    const handler = () => onClose()
    d.addEventListener('close', handler)
    return () => d.removeEventListener('close', handler)
  }, [onClose])
  return ref
}

export function Dialog({ open, onClose, title, description, children, footer, width = 480 }: BaseProps & { width?: number }) {
  const ref = useDialog(open, onClose)
  return (
    <dialog
      ref={ref}
      aria-labelledby="dlg-title"
      className="m-auto rounded-lg border border-line bg-surface p-0 text-ink shadow-overlay backdrop:bg-slate-900/40"
      style={{ width, maxWidth: 'calc(100vw - 2rem)' }}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      {open && (
        <div>
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <h2 id="dlg-title" className="text-lg font-semibold">{title}</h2>
              {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
            </div>
            <button aria-label="Close" className="btn-ghost -mr-2 h-8 w-8 px-0" onClick={onClose}><X size={18} strokeWidth={1.5} /></button>
          </div>
          <div className="px-5 py-4">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  )
}

/** Irreversible or public actions: states the consequences before proceeding. */
export function ConfirmDialog({
  open, onClose, onConfirm, title, consequences, confirmLabel = 'Confirm', danger,
}: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; consequences: string[]; confirmLabel?: string; danger?: boolean }) {
  return (
    <Dialog
      open={open} onClose={onClose} title={title}
      footer={<>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={() => { onConfirm(); onClose() }}>{confirmLabel}</button>
      </>}
    >
      <p className="mb-2 text-sm text-muted">This will:</p>
      <ul className="list-disc space-y-1 pl-5 text-sm">{consequences.map((c) => <li key={c}>{c}</li>)}</ul>
    </Dialog>
  )
}

/** Side drawer for quick previews (messages, payments, log entries). */
export function Drawer({ open, onClose, title, children, width = 480 }: Omit<BaseProps, 'footer' | 'description'> & { width?: number }) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  return (
    <div className={cn('fixed inset-0 z-40', open ? '' : 'pointer-events-none')} aria-hidden={!open}>
      <div className={cn('absolute inset-0 bg-slate-900/30 transition-opacity', open ? 'opacity-100' : 'opacity-0')} onClick={onClose} />
      <aside role="dialog" aria-modal="true" aria-label={title} style={{ width, maxWidth: '100vw' }}
        className={cn('absolute right-0 top-0 flex h-full flex-col border-l border-line bg-surface shadow-overlay transition-transform', open ? 'translate-x-0' : 'translate-x-full')}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button aria-label="Close" className="btn-ghost h-8 w-8 px-0" onClick={onClose}><X size={18} strokeWidth={1.5} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{open && children}</div>
      </aside>
    </div>
  )
}

import { create } from 'zustand'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'

type ToastKind = 'success' | 'error' | 'info'
interface Toast { id: number; kind: ToastKind; message: string; action?: { label: string; onClick: () => void } }

interface ToastState {
  toasts: Toast[]
  push: (kind: ToastKind, message: string, action?: Toast['action']) => void
  dismiss: (id: number) => void
}

let seq = 0
export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (kind, message, action) => {
    const id = ++seq
    set((s) => ({ toasts: [...s.toasts, { id, kind, message, action }] }))
    setTimeout(() => get().dismiss(id), action ? 8000 : 4500)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

export const toast = {
  success: (m: string, action?: Toast['action']) => useToasts.getState().push('success', m, action),
  error: (m: string) => useToasts.getState().push('error', m),
  info: (m: string) => useToasts.getState().push('info', m),
}

const ICON = { success: CheckCircle2, error: AlertCircle, info: Info }
const TONE = { success: 'text-green-600', error: 'text-red-600', info: 'text-blue-600' }

export function ToastViewport() {
  const { toasts, dismiss } = useToasts()
  return (
    <div aria-live="polite" role="status" className="pointer-events-none fixed bottom-16 right-4 z-[100] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map((t) => {
        const Icon = ICON[t.kind]
        return (
          <div key={t.id} className="pointer-events-auto flex items-start gap-3 rounded-lg border border-line bg-surface p-3 shadow-overlay">
            <Icon size={18} strokeWidth={1.5} className={`mt-0.5 shrink-0 ${TONE[t.kind]}`} aria-hidden />
            <p className="flex-1 text-sm text-ink">{t.message}</p>
            {t.action && (
              <button className="text-sm font-medium text-accent hover:underline" onClick={() => { t.action!.onClick(); dismiss(t.id) }}>
                {t.action.label}
              </button>
            )}
            <button aria-label="Dismiss notification" className="text-faint hover:text-ink" onClick={() => dismiss(t.id)}>
              <X size={16} strokeWidth={1.5} />
            </button>
          </div>
        )
      })}
    </div>
  )
}

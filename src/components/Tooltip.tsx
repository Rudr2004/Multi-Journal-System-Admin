import { cloneElement, useId, type ReactElement } from 'react'
import { cn } from '@/lib/utils'

/** CSS tooltip that also works on disabled buttons (wrapper receives the hover). */
export function Tooltip({ text, children, className }: { text?: string; children: ReactElement<{ 'aria-describedby'?: string }>; className?: string }) {
  const id = useId()
  if (!text) return children
  return (
    <span className={cn('group/tt relative inline-flex', className)}>
      {cloneElement(children, { 'aria-describedby': id })}
      <span
        id={id}
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-50 mt-1.5 hidden w-max max-w-[260px] -translate-x-1/2 rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-normal text-white shadow-overlay group-hover/tt:block group-focus-within/tt:block"
      >
        {text}
      </span>
    </span>
  )
}

/** Button that is disabled with an explanatory tooltip when the user lacks permission. */
export function GuardedButton({
  allowed, why, className = 'btn-secondary', children, ...rest
}: { allowed: boolean; why?: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const btn = <button {...rest} className={className} disabled={!allowed || rest.disabled} aria-disabled={!allowed || rest.disabled}>{children}</button>
  return allowed ? btn : <Tooltip text={why}>{btn}</Tooltip>
}

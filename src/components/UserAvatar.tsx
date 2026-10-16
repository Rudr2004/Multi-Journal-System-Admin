import { cn, initials } from '@/lib/utils'

/** Profile photo when there is one, otherwise the person's initials. */
export function UserAvatar({ name, photo, size = 32, tone = 'light', className }: { name: string; photo?: string; size?: number; tone?: 'light' | 'dark'; className?: string }) {
  const style = { width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.36)) }
  if (photo) return <img src={photo} alt="" aria-hidden className={cn('shrink-0 rounded-full object-cover', className)} style={style} />
  return (
    <span aria-hidden style={style} className={cn('flex shrink-0 items-center justify-center rounded-full font-semibold', tone === 'dark' ? 'bg-indigo-500/30 text-indigo-100' : 'bg-accent-soft text-accent', className)}>
      {initials(name)}
    </span>
  )
}

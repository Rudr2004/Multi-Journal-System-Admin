import { formatDateTime, formatRelative } from '@/shared/formatters'

/** Relative time in lists ("2 h ago") with the exact time on hover. */
export function RelativeTime({ value }: { value: string }) {
  return <time dateTime={value} title={formatDateTime(value)}>{formatRelative(value)}</time>
}

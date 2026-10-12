import clsx, { type ClassValue } from 'clsx'

export const cn = (...v: ClassValue[]) => clsx(v)

export const initials = (name: string) =>
  name.replace(/^(Dr\.|Prof\.)\s*/i, '').split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase()

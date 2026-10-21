import { z } from 'zod'

/** The server's rules: 12 to 128 characters, not a commonly used one. No digit or symbol rules. The server has the last word. */
export const PASSWORD_MIN = 12
export const PASSWORD_MAX = 128
export const PASSWORD_HINT = `Use ${PASSWORD_MIN} to ${PASSWORD_MAX} characters. Avoid common passwords; a few unrelated words make a strong one.`

export const newPasswordSchema = z
  .string()
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`)
  .max(PASSWORD_MAX, `Use at most ${PASSWORD_MAX} characters.`)

/** `password` + `confirm` fields that must match. */
export const passwordPairSchema = z
  .object({ password: newPasswordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'The passwords do not match.' })

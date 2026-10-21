import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
import { isApiError } from './errors'

/**
 * Shows a VALIDATION_ERROR's `details.fields` next to the inputs. `fieldMap` lists the server paths the form can show and the
 * form field each one belongs to (for example `{ newPassword: 'password' }`). Returns true when at least one message was
 * placed; when it returns false the caller shows the error's message instead, so nothing is lost silently.
 */
export function applyServerFieldErrors<T extends FieldValues>(error: unknown, setError: UseFormSetError<T>, fieldMap: Partial<Record<string, Path<T>>>): boolean {
  if (!isApiError(error) || error.code !== 'VALIDATION_ERROR') return false
  let placed = false
  for (const [path, message] of Object.entries(error.fieldErrors)) {
    const field = fieldMap[path]
    if (!field) continue
    setError(field, { type: 'server', message })
    placed = true
  }
  return placed
}

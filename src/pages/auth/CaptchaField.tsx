import type { UseFormRegisterReturn } from 'react-hook-form'
import { FormField } from '@/components/Form'

/**
 * The server asks for a captcha after repeated failures. No captcha provider is wired up yet (the server's mock driver
 * accepts `test-pass`), so this is a plain token input; replace the input with the provider's widget when one is chosen.
 */
export function CaptchaField({ error, registration }: { error?: string; registration: UseFormRegisterReturn }) {
  return (
    <FormField label="Verification token" required error={error} hint={import.meta.env.DEV ? 'Development server: use test-pass.' : 'Complete the verification to continue.'}>
      {(a) => <input {...a} autoComplete="off" className="input" {...registration} />}
    </FormField>
  )
}

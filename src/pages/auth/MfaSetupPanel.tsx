import { useEffect, useRef, useState } from 'react'
import { Check, Copy, Download } from 'lucide-react'
import { FormField } from '@/components/Form'
import { toast } from '@/components/Toasts'
import { enableMfa, startMfaSetup } from '@/lib/api/auth'
import { errorMessage, isApiError } from '@/lib/api/errors'
import type { MfaSetup, SessionGrant } from '@/lib/api/types'
import { Notice } from './AuthShell'

/** The manual-entry key is the `secret` parameter of the otpauth URL. */
const secretOf = (otpauthUrl: string): string | undefined => {
  try { return new URL(otpauthUrl).searchParams.get('secret') ?? undefined } catch { return undefined }
}

/**
 * Two-step setup in three moments: scan the QR code, confirm with the first code, save the recovery codes (shown once).
 * With `mfaToken` it is the forced setup at sign-in (the answer also holds the session); without, a signed-in person sets up.
 * `onDone` runs when the person confirms they saved the codes.
 */
export function MfaSetupPanel({ mfaToken, onDone }: { mfaToken?: string; onDone: (session?: SessionGrant) => void }) {
  const [setup, setSetup] = useState<MfaSetup>()
  const [loadError, setLoadError] = useState<{ message: string; retry: boolean }>()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ codes: string[]; session?: SessionGrant }>()
  const [saved, setSaved] = useState(false)
  const started = useRef(false)

  const load = () => {
    setLoadError(undefined)
    startMfaSetup(mfaToken).then(setSetup, (e: unknown) => {
      if (isApiError(e) && e.is('FEATURE_DISABLED')) setLoadError({ message: 'Two-step sign-in is not switched on for this server yet.', retry: false })
      else if (isApiError(e) && e.is('MFA_ALREADY_ENABLED')) setLoadError({ message: 'Two-step sign-in is already on for this account.', retry: false })
      else setLoadError({ message: errorMessage(e), retry: true })
    })
  }
  // Every call replaces the pending secret, so it must run once (React StrictMode runs effects twice in development).
  useEffect(() => {
    if (started.current) return
    started.current = true
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!/^\d{6}$/.test(code)) return setError('Enter the 6-digit code from your authenticator app.')
    setBusy(true)
    setError(undefined)
    try {
      const out = await enableMfa({ code, mfaToken })
      setResult({ codes: out.recoveryCodes, session: out.session })
    } catch (err) {
      setError(isApiError(err) && err.is('MFA_CODE_INVALID') ? 'That code is not correct. Check the time on your phone and try the next code.' : isApiError(err) && err.is('MFA_TOKEN_INVALID') ? 'This setup expired. Go back and sign in again.' : errorMessage(err))
    } finally { setBusy(false) }
  }

  if (result) return <RecoveryCodes codes={result.codes} saved={saved} onSaved={setSaved} onContinue={() => onDone(result.session)} />

  if (loadError) return <div className="space-y-3"><Notice>{loadError.message}</Notice>{loadError.retry && <button type="button" className="btn-secondary" onClick={load}>Try again</button>}</div>
  if (!setup) return <div role="status" className="py-8 text-center text-sm text-muted">Preparing your authenticator setup…</div>

  const key = secretOf(setup.otpauthUrl)
  return (
    <form onSubmit={confirm} className="space-y-4" noValidate>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
        <li>Open an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…).</li>
        <li>Scan this code, or enter the key by hand.</li>
        <li>Type the 6-digit code it shows.</li>
      </ol>
      <div className="flex flex-col items-center gap-2 rounded-lg border border-line p-3">
        <img src={setup.qrDataUrl} alt="QR code to add this account to your authenticator app" width={176} height={176} className="h-44 w-44" />
        {key && <p className="break-all text-center text-xs text-muted">Key: <span className="font-mono text-ink">{key}</span></p>}
      </div>
      {error && <Notice>{error}</Notice>}
      <FormField label="Code from the app" required>
        {(a) => <input {...a} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="input text-center text-lg tracking-[0.5em]" />}
      </FormField>
      <button className="btn-primary w-full" disabled={busy}>{busy ? 'Checking…' : 'Turn on two-step sign-in'}</button>
    </form>
  )
}

function RecoveryCodes({ codes, saved, onSaved, onContinue }: { codes: string[]; saved: boolean; onSaved: (v: boolean) => void; onContinue: () => void }) {
  const [copied, setCopied] = useState(false)
  const text = codes.join('\n')
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { toast.error('Copy is blocked in this browser. Select the codes and copy them by hand.') }
  }
  const download = () => {
    const url = URL.createObjectURL(new Blob([`Journal Admin recovery codes\nEach code works once.\n\n${text}\n`], { type: 'text/plain' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'journal-admin-recovery-codes.txt'
    a.click()
    URL.revokeObjectURL(url)
  }
  return (
    <div className="space-y-4">
      <Notice tone="warning"><strong>Save these recovery codes now.</strong> They are shown only once. Each one signs you in once if you lose your phone.</Notice>
      <ul aria-label="Recovery codes" className="grid grid-cols-1 gap-1.5 rounded-lg border border-line bg-subtle p-3 font-mono text-sm sm:grid-cols-2">
        {codes.map((c) => <li key={c}>{c}</li>)}
      </ul>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary" onClick={copy}>{copied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />} {copied ? 'Copied' : 'Copy'}</button>
        <button type="button" className="btn-secondary" onClick={download}><Download size={15} aria-hidden /> Download .txt</button>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={saved} onChange={(e) => onSaved(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[rgb(79,70,229)]" />
        I saved these codes somewhere safe.
      </label>
      <button type="button" className="btn-primary w-full" disabled={!saved} onClick={onContinue}>Continue</button>
    </div>
  )
}

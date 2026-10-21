import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ImagePlus, LogOut, ShieldCheck, Trash2 } from 'lucide-react'
import { PageHeader } from '@/layout/PageHeader'
import { SectionCard } from '@/components/Card'
import { Badge } from '@/components/Badges'
import { DescriptionList } from '@/components/Form'
import { toast } from '@/components/Toasts'
import { UserAvatar } from '@/components/UserAvatar'
import { errorMessage } from '@/lib/api/errors'
import { reloadMe, signOut } from '@/lib/api/session'
import { useCurrentUser } from '@/permissions/hooks'
import { ROLE_META } from '@/permissions/roles'
import { ChangePasswordForm } from '@/pages/auth/PasswordPages'
import { useSession } from '@/mock/store'
import { setProfilePhoto } from '@/mock/api/account'
import { SecurityCard } from './SecurityCard'

function PhotoCard() {
  const user = useCurrentUser()!
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const save = async (photo: string | null, ok: string) => {
    setBusy(true)
    try { await setProfilePhoto(photo); toast.success(ok) } catch (e) { toast.error(errorMessage(e)) } finally { setBusy(false) }
  }
  const pick = (f?: File) => {
    if (!f) return
    if (!/^image\/(png|jpe?g|webp)$/.test(f.type)) return toast.error('Choose a PNG, JPG or WebP image.')
    if (f.size > 2 * 1024 * 1024) return toast.error('The photo must be smaller than 2 MB.')
    const r = new FileReader()
    r.onload = () => void save(String(r.result), 'Profile photo updated')
    r.readAsDataURL(f)
  }
  return (
    <SectionCard title="Profile photo">
      <div className="flex items-center gap-4">
        <UserAvatar name={user.name} photo={user.photo} size={88} />
        <div>
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Upload profile photo" tabIndex={-1} onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }} />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => input.current?.click()}><ImagePlus size={15} strokeWidth={1.5} aria-hidden /> {user.photo ? 'Change photo' : 'Upload photo'}</button>
            {user.photo && <button type="button" className="btn-ghost" disabled={busy} onClick={() => void save(null, 'Profile photo removed')}><Trash2 size={15} strokeWidth={1.5} aria-hidden /> Remove</button>}
          </div>
          <p className="mt-2 text-xs text-muted">Square PNG, JPG or WebP, up to 2 MB. Your initials are shown if there is no photo. The photo is kept for this browser session only: the server has no profile photo yet.</p>
        </div>
      </div>
    </SectionCard>
  )
}

/** Name, email and phone are changed by a Super Admin (the server has no self-edit endpoint). */
function DetailsCard() {
  const me = useSession((s) => s.me)
  if (!me) return null
  return (
    <SectionCard title="Personal details">
      <DescriptionList items={[
        { label: 'Full name', value: me.fullName },
        { label: 'Registered email', value: me.email },
        { label: 'Phone number', value: me.phone ?? 'Not set' },
      ]} />
      <div className="mt-5 border-t border-line pt-4">
        <p className="label">Your roles</p>
        {me.isSuperAdmin && <p className="mb-2"><Badge tone="accent">Super Admin · all journals</Badge></p>}
        <ul className="flex flex-wrap gap-2">
          {me.journals.flatMap((j) => j.roles.map((r) => <li key={`${j.code}-${r}`}><Badge tone="neutral">{j.code} · {ROLE_META[r].label}</Badge></li>))}
        </ul>
        <p className="mt-2 text-xs text-muted">Your details and roles are managed by a Super Admin.</p>
      </div>
    </SectionCard>
  )
}

function PasswordCard() {
  return (
    <SectionCard title="Password">
      <p className="mb-4 text-sm text-muted">Changing your password signs you out of every other device.</p>
      <ChangePasswordForm onChanged={() => { toast.success('Password changed. Your other sessions were signed out.'); void reloadMe().catch((e: unknown) => toast.error(errorMessage(e))) }} />
    </SectionCard>
  )
}

export function ProfilePage() {
  const navigate = useNavigate()
  const me = useSession((s) => s.me)
  const user = useCurrentUser()
  if (!me || !user) return null
  return (
    <>
      <PageHeader title="My profile" description="Your details, password and two-step sign-in."
        actions={<button className="btn-secondary" onClick={() => void signOut().then(() => navigate('/login'))}><LogOut size={15} strokeWidth={1.5} aria-hidden /> Sign out</button>} />
      <div className="grid items-start gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <DetailsCard />
          <PasswordCard />
          <SecurityCard me={me} />
        </div>
        <div className="space-y-5">
          <PhotoCard />
          <SectionCard title="Account status">
            <div className="flex items-center gap-2 text-sm"><ShieldCheck size={16} strokeWidth={1.5} className="text-green-600" aria-hidden /> <Badge tone="success">Active</Badge></div>
            <p className="mt-2 text-xs text-muted">If a Super Admin disables your account you are signed out and cannot sign in again until it is enabled.</p>
          </SectionCard>
        </div>
      </div>
    </>
  )
}

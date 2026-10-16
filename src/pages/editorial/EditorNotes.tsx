import { useMemo, useState } from 'react'
import { StickyNote } from 'lucide-react'
import { Dialog } from '@/components/Dialog'
import { FormField } from '@/components/Form'
import { RelativeTime } from '@/components/Time'
import { toast } from '@/components/Toasts'
import { addEditorNote } from '@/mock/api/assignments'
import { useNotesStore, type EditorNote } from '@/mock/stores/notes'

export function useEditorNotes(paperId: string): EditorNote[] {
  const all = useNotesStore((s) => s.notes[paperId])
  return useMemo(() => all ?? [], [all])
}

/** The Editor writes an editing instruction for the Associate Editor. */
export function AddNoteDialog({ paperId, title, onClose }: { paperId: string | null; title?: string; onClose: () => void }) {
  return (
    <Dialog open={!!paperId} onClose={onClose} width={520} title="Add note for the Associate Editor" description={paperId ? `${paperId}${title ? ` · ${title}` : ''}` : undefined}
      footer={<><button className="btn-secondary" type="button" onClick={onClose}>Cancel</button><button className="btn-primary" type="submit" form="editor-note-form">Add note</button></>}>
      {paperId && <NoteForm paperId={paperId} onClose={onClose} />}
    </Dialog>
  )
}

function NoteForm({ paperId, onClose }: { paperId: string; onClose: () => void }) {
  const [text, setText] = useState('')
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const ok = text.trim().length >= 5
  return (
    <form id="editor-note-form" noValidate className="space-y-3" onSubmit={async (e) => {
      e.preventDefault(); setTouched(true)
      if (!ok) return
      setBusy(true)
      try { await addEditorNote(paperId, text); toast.success('Note added. The Associate Editor sees it under this Paper ID.'); onClose() } catch (err) { toast.error(err instanceof Error ? err.message : 'Could not add the note.') } finally { setBusy(false) }
    }}>
      <FormField label="Editing instructions" required error={touched && !ok ? 'Write the instruction (at least 5 characters).' : undefined} hint="For example: fix the table 2 caption, use the journal reference style, check the author affiliations.">
        {(a) => <textarea {...a} rows={5} autoFocus className="input !h-auto py-2" value={text} disabled={busy} onChange={(e) => setText(e.target.value)} onBlur={() => setTouched(true)} />}
      </FormField>
    </form>
  )
}

/** Notes already added for a paper, newest first. */
export function NotesList({ notes, empty }: { notes: EditorNote[]; empty?: string }) {
  if (notes.length === 0) return <p className="text-sm text-muted">{empty ?? 'No notes yet.'}</p>
  return (
    <ul className="space-y-2">
      {notes.map((n) => (
        <li key={n.id} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <p className="flex items-center gap-1.5 text-xs font-medium text-amber-800"><StickyNote size={13} aria-hidden /> {n.by} · <RelativeTime value={n.at} /></p>
          <p className="mt-0.5 whitespace-pre-wrap leading-6">{n.text}</p>
        </li>
      ))}
    </ul>
  )
}

/** Banner at the top of the production workspace with the Editor's instructions for this paper. */
export function EditorNotesBanner({ paperId }: { paperId: string }) {
  const notes = useEditorNotes(paperId)
  if (notes.length === 0) return null
  return (
    <section aria-label="Notes from the Editor" className="mb-5">
      <h2 className="mb-2 text-sm font-semibold">Notes from the Editor</h2>
      <NotesList notes={notes} />
    </section>
  )
}

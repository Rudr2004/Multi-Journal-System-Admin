import { Download, Printer } from 'lucide-react'
import { toast } from '@/components/Toasts'
import { formatDate } from '@/shared/formatters'
import { journalByCode } from '@/mock/data/core'
import { SCORE_CRITERIA, averageScore, recommendationMeta, type ReviewRecord } from '@/mock/data/editorial'

/**
 * Formatted review report, shown as a PDF-style page.
 * `forAuthor` hides the confidential comments to the editor and the reviewer's identity.
 */
export function ReviewReport({ review, paperTitle, forAuthor, showDownload = true }: {
  review: ReviewRecord; paperTitle: string; forAuthor?: boolean; showDownload?: boolean
}) {
  const j = journalByCode(review.journal)
  const rec = recommendationMeta(review.recommendation)
  return (
    <div>
      {showDownload && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted">Review-Report-{review.paperId}.pdf · generated {formatDate(review.submittedAt)}</span>
          <div className="flex gap-2">
            <button className="btn-secondary !h-8" onClick={() => toast.info('Sending the report to the printer is not available in the prototype.')}><Printer size={14} strokeWidth={1.5} aria-hidden /> Print</button>
            <button className="btn-primary !h-8" onClick={() => toast.success(`Review-Report-${review.paperId}.pdf downloaded`)}><Download size={14} strokeWidth={1.5} aria-hidden /> Download PDF</button>
          </div>
        </div>
      )}
      <article aria-label={`Review report for ${review.paperId}`} className="rounded-lg border border-line bg-white p-8 text-[13px] leading-6 text-slate-800 shadow-sm">
        <header className="border-b border-slate-300 pb-4 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">{j.name}</p>
          <h3 className="mt-2 font-serif text-xl font-semibold text-slate-900">Peer Review Report</h3>
        </header>
        <dl className="mt-4 grid grid-cols-[110px_1fr] gap-x-4 gap-y-1">
          <dt className="text-slate-500">Paper ID</dt><dd className="font-medium">{review.paperId}</dd>
          <dt className="text-slate-500">Title</dt><dd>{paperTitle}</dd>
          {!forAuthor && <><dt className="text-slate-500">Reviewer</dt><dd>{review.reviewerName} · {review.reviewerKind === 'panel' ? 'Review Panel Member' : 'In-house reviewer'}</dd></>}
          <dt className="text-slate-500">Submitted</dt><dd>{formatDate(review.submittedAt)} · round {review.round}</dd>
          <dt className="text-slate-500">Recommendation</dt><dd className="font-semibold">{rec.label}</dd>
        </dl>

        <h4 className="mt-5 border-b border-slate-200 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Scores</h4>
        <table className="mt-2 w-full">
          <tbody>
            {SCORE_CRITERIA.map((c) => (
              <tr key={c.key}>
                <td className="py-0.5">{c.label}</td>
                <td className="w-40 py-0.5">
                  <span className="flex items-center gap-0.5" aria-hidden>{[1, 2, 3, 4, 5].map((n) => <span key={n} className={`h-2 w-6 rounded-sm ${n <= review.scores[c.key] ? 'bg-slate-700' : 'bg-slate-200'}`} />)}</span>
                </td>
                <td className="w-10 py-0.5 text-right font-medium">{review.scores[c.key]}/5</td>
              </tr>
            ))}
            <tr className="border-t border-slate-200"><td className="py-1 font-medium">Average</td><td /><td className="py-1 text-right font-semibold">{averageScore(review.scores)}</td></tr>
          </tbody>
        </table>

        <h4 className="mt-5 border-b border-slate-200 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Comments to the author</h4>
        <p className="mt-2 whitespace-pre-wrap">{review.commentsToAuthor}</p>

        {!forAuthor && (
          <>
            <h4 className="mt-5 border-b border-slate-200 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Confidential comments to the editor</h4>
            <p className="mt-2 whitespace-pre-wrap">{review.commentsToEditor || 'None provided.'}</p>
          </>
        )}
        <footer className="mt-6 border-t border-slate-200 pt-2 text-[11px] text-slate-500">Confidential peer-review document. Do not distribute.</footer>
      </article>
    </div>
  )
}

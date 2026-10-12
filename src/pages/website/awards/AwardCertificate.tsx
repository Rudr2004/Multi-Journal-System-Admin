import { Award, Star } from 'lucide-react'
import { formatDate } from '@/shared/formatters'
import { journalByCode } from '@/mock/data/core'
import { AWARD_TYPE_LABEL, type AwardCycle, type Nomination } from '@/mock/data/website'

const year = (c: AwardCycle) => c.periodEnd.slice(0, 4)

/** Award certificate preview. The issued PDF uses the same layout. */
export function AwardCertificate({ cycle, winner }: { cycle: AwardCycle; winner: Nomination }) {
  const j = journalByCode(cycle.journal)
  const reason = cycle.type === 'best_paper' && winner.paperTitle
    ? <>for the paper “{winner.paperTitle}”, published in {j.code}.</>
    : <>for outstanding mentoring of early-career researchers published in {j.code}.</>
  return (
    <div role="img" aria-label={`${AWARD_TYPE_LABEL[cycle.type]} award certificate for ${winner.name}`}
      className="relative aspect-[1.414/1] w-full overflow-hidden rounded-lg border-4 border-double border-amber-300 bg-white p-6 text-center shadow-sm">
      <div className="absolute inset-x-0 top-0 h-1.5 bg-amber-400" />
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">{j.name}</p>
      <Award size={26} strokeWidth={1.25} aria-hidden className="mx-auto mt-2 text-amber-500" />
      <h3 className="mt-1 font-serif text-2xl font-semibold text-slate-900">Certificate of Excellence</h3>
      <p className="font-serif text-sm italic text-slate-600">{AWARD_TYPE_LABEL[cycle.type]} Award {year(cycle)}</p>
      <p className="mt-3 text-xs text-slate-500">is proudly presented to</p>
      <p className="mt-1 font-serif text-xl font-semibold text-slate-900">{winner.name}</p>
      <p className="text-xs text-slate-500">{winner.affiliation}</p>
      <p className="mx-auto mt-2 max-w-[85%] text-xs leading-5 text-slate-600">{reason}</p>
      <div className="absolute inset-x-6 bottom-4 flex items-end justify-between text-[10px] text-slate-500">
        <div className="text-left"><p>Awarded on {formatDate(cycle.approvedAt ?? cycle.createdAt)}</p><p>Period {formatDate(cycle.periodStart)} to {formatDate(cycle.periodEnd)}</p></div>
        <div className="text-center"><div className="mx-auto mb-0.5 h-px w-28 bg-slate-400" /><p className="font-medium text-slate-700">{cycle.approvedBy ?? 'Publishing Director'}</p><p>Edtech Publishers</p></div>
      </div>
    </div>
  )
}

/** Round badge shown beside the winner on the Awards page. */
export function AwardBadge({ cycle, size = 120 }: { cycle: AwardCycle; size?: number }) {
  return (
    <div role="img" aria-label={`${AWARD_TYPE_LABEL[cycle.type]} ${year(cycle)} badge for ${cycle.journal}`}
      className="relative flex shrink-0 flex-col items-center justify-center rounded-full border-4 border-amber-400 bg-gradient-to-b from-amber-50 to-amber-100 text-center shadow-sm"
      style={{ width: size, height: size }}>
      <span className="absolute inset-1.5 rounded-full border border-dashed border-amber-400" aria-hidden />
      <Star size={size * 0.2} fill="currentColor" className="text-amber-500" aria-hidden />
      <p className="mt-0.5 px-3 text-[10px] font-bold uppercase leading-tight tracking-wide text-amber-900">{AWARD_TYPE_LABEL[cycle.type]}</p>
      <p className="text-sm font-bold text-amber-900">{year(cycle)}</p>
      <p className="text-[9px] font-semibold tracking-widest text-amber-800">{cycle.journal}</p>
    </div>
  )
}

import type { JournalCode, Paper, PaperEvent, PaperStatus, StaffUser } from '@/shared/types'
import { STATUS_META } from '@/shared/statuses'
import { formatDate } from '@/shared/formatters'
import { SEED_USERS, journalByCode } from './core'
import { nextDispatch } from './papers'

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */
export type Recommendation = 'accept' | 'minor_revision' | 'major_revision' | 'reject'
export const RECOMMENDATIONS: { value: Recommendation; label: string; tone: 'success' | 'info' | 'warning' | 'danger' }[] = [
  { value: 'accept', label: 'Accept', tone: 'success' },
  { value: 'minor_revision', label: 'Minor revision', tone: 'info' },
  { value: 'major_revision', label: 'Major revision', tone: 'warning' },
  { value: 'reject', label: 'Reject', tone: 'danger' },
]
export const recommendationMeta = (r: Recommendation) => RECOMMENDATIONS.find((x) => x.value === r)!

export const SCORE_CRITERIA = [
  { key: 'originality', label: 'Originality', hint: 'Does the work add something new to the field?' },
  { key: 'methodology', label: 'Methodology', hint: 'Are the design, data and analysis sound?' },
  { key: 'clarity', label: 'Clarity', hint: 'Is the paper well organised and clearly written?' },
  { key: 'significance', label: 'Significance', hint: 'Will the findings matter to readers of the journal?' },
  { key: 'references', label: 'References', hint: 'Is prior work cited accurately and sufficiently?' },
] as const
export type ScoreKey = (typeof SCORE_CRITERIA)[number]['key']
export type ReviewScores = Record<ScoreKey, number>

export type ReviewerKind = 'in_house' | 'panel'

export interface ReviewRecord {
  id: string
  paperId: string
  journal: JournalCode
  reviewerId: string
  reviewerName: string
  reviewerKind: ReviewerKind
  round: number
  scores: ReviewScores
  commentsToAuthor: string
  commentsToEditor: string
  recommendation: Recommendation
  submittedAt: string
}

export type DecisionKind = 'accepted' | 'accepted_without_review' | 'changes_requested' | 'rejected'
export const DECISION_META: Record<DecisionKind, { label: string; tone: 'success' | 'warning' | 'danger' | 'accent' }> = {
  accepted: { label: 'Approved', tone: 'success' },
  accepted_without_review: { label: 'Accepted without review report', tone: 'accent' },
  changes_requested: { label: 'Changes requested', tone: 'warning' },
  rejected: { label: 'Rejected', tone: 'danger' },
}

export interface DecisionRecord {
  id: string
  paperId: string
  kind: DecisionKind
  reason: string
  by: string
  at: string
  round: number
}

export interface FileVersion {
  id: string
  paperId: string
  version: number
  name: string
  kind: 'manuscript' | 'supplementary'
  format: 'docx' | 'pdf'
  sizeKb: number
  uploadedAt: string
  note?: string
}

export interface ReviewDraft {
  scores: Partial<ReviewScores>
  commentsToAuthor: string
  commentsToEditor: string
  recommendation?: Recommendation
  savedAt: string
}

export interface ReminderState {
  count: number
  lastAt?: string
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */
export const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)
const pick = <T,>(arr: T[], h: number) => arr[h % arr.length]
const lerpTime = (a: string, b: string, f: number) => {
  const ta = new Date(a).getTime()
  const tb = Math.max(ta + 3_600_000, new Date(b).getTime())
  return new Date(ta + (tb - ta) * f).toISOString()
}

export const userName = (id: string | undefined, users: StaffUser[] = SEED_USERS) => users.find((u) => u.id === id)?.name

/* ------------------------------------------------------------------ */
/* Subject taxonomy, expertise and matching                             */
/* ------------------------------------------------------------------ */
/** Expertise tags per in-house reviewer / Review Panel Member. */
export const EXPERTISE: Record<string, string[]> = {
  'u-reviewer': ['Manufacturing', 'Materials science', 'Education technology', 'Automation', 'Agriculture'],
  'u-rev-cs': ['Machine learning', 'Natural language processing', 'Distributed systems', 'Software engineering', 'Electronics', 'Energy systems'],
  'u-rev-mgmt': ['Organisational behaviour', 'Entrepreneurship', 'Marketing', 'Innovation management', 'Banking', 'Financial inclusion'],
  'u-panel': ['Civil engineering', 'Materials science', 'Mechanical design', 'Energy systems', 'Electronics', 'Environmental engineering'],
  'u-panel-2': ['Environmental engineering', 'Sustainability', 'Climate & development', 'Econometrics', 'Capital markets', 'Security & fraud', 'Public policy', 'Higher education'],
}

/** A paper is "outside in-house expertise" when no in-house reviewer matches at least this share of its subjects. */
export const IN_HOUSE_MATCH_THRESHOLD = 40

export function matchScore(paperSubjects: string[], expertise: string[] = []) {
  const matched = paperSubjects.filter((s) => expertise.includes(s))
  return { score: paperSubjects.length ? Math.round((matched.length / paperSubjects.length) * 100) : 0, matched }
}

interface TopicEntry {
  match: string
  subjects: string[]
  keywords: string[]
  context: string
  method: string
  finding: string
  implication: string
}

const TOPICS: TopicEntry[] = [
  { match: 'smart-material adoption', subjects: ['Manufacturing', 'Materials science', 'Innovation management'], keywords: ['smart materials', 'technology adoption', 'MSME', 'manufacturing'],
    context: 'Small manufacturing units are under pressure to adopt shape-memory alloys and self-healing composites, yet uptake remains uneven and poorly documented.',
    method: 'We surveyed {n} owner-managers across three industrial clusters and complemented the survey with 14 plant visits to trace adoption decisions.',
    finding: 'Perceived retrofit cost and the lack of local testing facilities explained most of the variation in adoption, while firm size had only a modest effect (adjusted R² = 0.{p}).',
    implication: 'Shared testing infrastructure and staged retrofit financing would lower the main barriers faced by small units.' },
  { match: 'digital twins', subjects: ['Manufacturing', 'Automation', 'Software engineering'], keywords: ['digital twin', 'process monitoring', 'Industry 4.0', 'anomaly detection'],
    context: 'Digital twins promise earlier detection of process drift on production lines, but most published work validates them only in simulation.',
    method: 'We built a twin of a batch-processing line from {n} hours of sensor logs and compared its alerts against operator-recorded stoppages over a twelve-week deployment.',
    finding: 'The twin flagged {p}% of unplanned stoppages at least 20 minutes before they occurred, with a false-alarm rate that operators judged acceptable.',
    implication: 'Even a lightweight twin can support maintenance planning, provided sensor calibration is audited on a fixed schedule.' },
  { match: 'additive manufacturing', subjects: ['Manufacturing', 'Materials science', 'Supply chain'], keywords: ['additive manufacturing', '3D printing', 'supply chain', 'lead time'],
    context: 'Additive manufacturing is reshaping how spare parts are sourced, but the effect on supplier networks has rarely been quantified.',
    method: 'Using procurement records from {n} spare-part orders at four engineering firms, we compare lead times and inventory holding before and after on-demand printing was introduced.',
    finding: 'Median lead time fell by {p}% for low-volume parts, whereas high-volume parts showed no meaningful gain once material costs were included.',
    implication: 'Firms should treat additive manufacturing as a complement to, not a replacement for, conventional supply contracts.' },
  { match: 'blended learning', subjects: ['Education technology', 'Higher education', 'Engineering education'], keywords: ['blended learning', 'engineering education', 'learning analytics', 'student engagement'],
    context: 'Engineering colleges adopted blended learning platforms rapidly after 2020, but evidence on learning outcomes in laboratory-heavy courses is thin.',
    method: 'We followed {n} second-year students across two semesters, combining platform usage logs, examination scores and structured interviews with eight faculty members.',
    finding: 'Students who completed at least {p}% of the online pre-lab modules scored markedly higher in practical assessments, an effect that persisted after controlling for prior grades.',
    implication: 'Platform design should prioritise pre-laboratory preparation over lecture capture, and instructors need dashboards that surface disengagement early.' },
  { match: 'sensor networks', subjects: ['Agriculture', 'Automation', 'Electronics'], keywords: ['wireless sensor network', 'precision agriculture', 'soil moisture', 'IoT'],
    context: 'Precision agriculture depends on dense, low-power sensing, yet field deployments often fail within a season because of connectivity and maintenance gaps.',
    method: 'We deployed {n} soil-moisture nodes across six smallholder plots and tested two duty-cycling strategies against a fixed-interval baseline.',
    finding: 'Adaptive duty-cycling extended mean node lifetime by {p}% while keeping irrigation-relevant readings within 4% of the baseline.',
    implication: 'Low-cost adaptive sensing is feasible for smallholders, but local servicing arrangements remain the deciding factor for long-term use.' },
  { match: 'water purification', subjects: ['Environmental engineering', 'Materials science', 'Public health'], keywords: ['water purification', 'low-cost filtration', 'rural water', 'ceramic membranes'],
    context: 'Access to safe drinking water remains limited in many rural settlements where centralised treatment is not economical.',
    method: 'We fabricated ceramic-membrane filters from locally sourced clay and tested {n} litres of groundwater and surface water samples against national drinking-water standards.',
    finding: 'The filters removed {p}% of turbidity and more than 99% of coliform counts at a unit cost under ₹600, though flow rate declined after six weeks without back-flushing.',
    implication: 'Community-level maintenance routines are as important as the filter material for sustained performance.' },
  { match: 'employee retention', subjects: ['Organisational behaviour', 'Human resources', 'Innovation management'], keywords: ['employee retention', 'hybrid work', 'organisational commitment', 'HRM'],
    context: 'Hybrid work arrangements have changed what employees expect from their employers, and retention strategies built for office-based teams may no longer fit.',
    method: 'We analysed responses from {n} employees at 21 service-sector firms and ran moderated regressions on commitment, manager support and remote-work flexibility.',
    finding: 'Perceived manager support was the strongest predictor of intent to stay, and flexibility mattered mainly for employees with more than two years of tenure (β = 0.{p}).',
    implication: 'Retention programmes should focus on manager capability and predictable flexibility rules rather than on blanket perks.' },
  { match: 'startup funding', subjects: ['Entrepreneurship', 'Banking', 'Regional development'], keywords: ['startups', 'venture funding', 'tier-2 cities', 'angel networks'],
    context: 'Funding for early-stage startups is concentrated in a few metropolitan hubs, leaving founders in tier-2 cities dependent on informal networks.',
    method: 'We mapped investor–founder ties for {n} funded ventures and interviewed 18 founders and nine angel investors across five cities.',
    finding: 'Founders with a single warm introduction were {p}% more likely to close a first round than those pitching cold, regardless of sector.',
    implication: 'City-level angel syndicates and mentoring programmes could widen access to capital more effectively than new subsidy schemes.' },
  { match: 'leadership styles', subjects: ['Organisational behaviour', 'Innovation management', 'Human resources'], keywords: ['leadership', 'team innovation', 'psychological safety', 'R&D teams'],
    context: 'Leadership style is widely assumed to shape team innovation, but the mechanisms linking the two are contested.',
    method: 'Drawing on a two-wave survey of {n} members of 46 product-development teams, we test whether psychological safety mediates the effect of transformational and transactional leadership.',
    finding: 'Transformational leadership raised team innovation through psychological safety, whereas transactional leadership showed no reliable indirect effect (indirect effect = 0.{p}).',
    implication: 'Leadership development should target safety-building behaviours such as inviting dissent and responding constructively to errors.' },
  { match: 'consumer trust', subjects: ['Marketing', 'Consumer behaviour', 'Digital commerce'], keywords: ['quick commerce', 'consumer trust', 'repeat purchase', 'mobile apps'],
    context: 'Quick-commerce apps promise delivery in minutes, and their growth depends on whether consumers trust them with perishable and high-frequency purchases.',
    method: 'A structural equation model was estimated on responses from {n} urban app users, with trust, perceived delivery reliability and substitution handling as constructs.',
    finding: 'Perceived delivery reliability and transparent substitution policies together explained {p}% of the variance in repeat-purchase intention.',
    implication: 'Platforms can strengthen trust more cheaply by improving substitution communication than by further compressing delivery times.' },
  { match: 'sustainability reporting', subjects: ['Sustainability', 'Accounting', 'Capital markets'], keywords: ['sustainability reporting', 'mid-size firms', 'disclosure quality', 'BRSR'],
    context: 'Mid-size firms face new sustainability disclosure requirements without the reporting capacity of large listed companies.',
    method: 'We content-analysed {n} sustainability disclosures from mid-size firms and scored them against a 32-item quality checklist, then interviewed 12 finance heads.',
    finding: 'Disclosure quality improved with board-level ownership of the report, while outsourcing preparation to consultants was associated with generic, boilerplate content.',
    implication: 'Regulators could pair mandatory reporting with sector templates to improve comparability for smaller reporters.' },
  { match: 'technology transfer', subjects: ['Innovation management', 'Public policy', 'Higher education'], keywords: ['technology transfer', 'public universities', 'patents', 'industry linkages'],
    context: 'Public universities generate a large share of national research output, yet few inventions reach commercial use.',
    method: 'We examined {n} disclosures filed at technology transfer offices of eight public universities and traced which ones led to licences or industry projects.',
    finding: 'Only {p}% of disclosures were licensed; those with an industry co-sponsor from the outset were roughly three times more likely to be.',
    implication: 'Early industry involvement and simplified licensing templates matter more than further investment in patent filing.' },
  { match: 'transformer models', subjects: ['Natural language processing', 'Machine learning', 'Software engineering'], keywords: ['transformers', 'low-resource languages', 'transfer learning', 'NLP'],
    context: 'Transformer models perform strongly on high-resource languages, but gains do not carry over to languages with little labelled data.',
    method: 'We fine-tune multilingual encoders on {n}k sentences for three Indian languages and compare adapter-based tuning with full fine-tuning and data augmentation by back-translation.',
    finding: 'Adapter tuning with back-translated data closed {p}% of the gap to the high-resource baseline while training only a small fraction of the parameters.',
    implication: 'Parameter-efficient methods offer a practical route to usable language technology for communities with limited compute and annotation budgets.' },
  { match: 'federated learning', subjects: ['Machine learning', 'Distributed systems', 'Security & fraud'], keywords: ['federated learning', 'edge computing', 'communication efficiency', 'privacy'],
    context: 'Federated learning keeps data on devices, but communication cost and heterogeneous clients make convergence slow on real edge hardware.',
    method: 'We implement a client-selection scheme that weights devices by link quality and data freshness, and evaluate it on {n} emulated edge clients with non-uniform data.',
    finding: 'The scheme reached target accuracy in {p}% fewer communication rounds than uniform sampling, with the largest benefit under highly skewed label distributions.',
    implication: 'Edge deployments should monitor client conditions explicitly instead of assuming homogeneous participants.' },
  { match: 'static analysis', subjects: ['Software engineering', 'Security & fraud'], keywords: ['static analysis', 'Python', 'open source', 'software quality'],
    context: 'Open-source Python packages are widely reused, yet automated checks rarely run in the projects that need them most.',
    method: 'We ran four static analysers over {n} popular packages and manually triaged a stratified sample of 600 warnings to estimate precision.',
    finding: 'Precision varied from 31% to {p}% across tools and rule categories, and security-related rules produced the most actionable findings.',
    implication: 'Maintainers benefit most from a small curated rule set integrated into continuous integration rather than from broad default configurations.' },
  { match: 'graph neural networks', subjects: ['Machine learning', 'Security & fraud', 'Banking'], keywords: ['graph neural networks', 'fraud detection', 'transaction graphs', 'imbalanced learning'],
    context: 'Fraud rings leave relational traces that tabular models cannot capture, but graph methods are rarely evaluated on realistically imbalanced payment data.',
    method: 'We train graph neural network variants on a transaction graph of {n}k accounts with a fraud prevalence below 0.4% and compare them with gradient-boosted baselines.',
    finding: 'Neighbourhood-aware models raised recall at a fixed false-positive rate by {p}% over the best tabular baseline, mainly by catching coordinated mule accounts.',
    implication: 'Graph features are a worthwhile addition to production fraud stacks, provided graph construction can keep pace with transaction volumes.' },
  { match: 'serverless', subjects: ['Distributed systems', 'Public policy', 'Software engineering'], keywords: ['serverless', 'e-governance', 'cloud architecture', 'cost modelling'],
    context: 'Public-sector portals face sharp seasonal peaks, which makes elastic serverless architectures attractive but largely untested in e-governance settings.',
    method: 'We re-architected a certificate-issuance workflow as functions and queues and load-tested it against the original VM-based deployment with {n} simulated citizens.',
    finding: 'The serverless version handled peak load with {p}% lower infrastructure cost, though cold-start latency affected first requests after idle periods.',
    implication: 'Departments can adopt serverless incrementally for bursty workflows while keeping latency-sensitive services on warm capacity.' },
  { match: 'api rate limiting', subjects: ['Distributed systems', 'Software engineering'], keywords: ['rate limiting', 'API gateway', 'burst traffic', 'token bucket'],
    context: 'Public APIs must stay available under bursty traffic, and fixed-window rate limits are known to penalise legitimate clients at window boundaries.',
    method: 'We compare token-bucket, sliding-window and adaptive limiters on replayed traffic traces comprising {n}k requests from three production services.',
    finding: 'The adaptive limiter reduced rejected legitimate requests by {p}% relative to fixed windows while holding backend latency within service-level targets.',
    implication: 'Teams should tune limiter parameters against recorded burst profiles rather than average load.' },
  { match: 'fibre-reinforced concrete', subjects: ['Civil engineering', 'Materials science'], keywords: ['fibre-reinforced concrete', 'cyclic loading', 'fatigue', 'steel fibres'],
    context: 'Fibre-reinforced concrete is increasingly specified for pavements and bridge decks, where repeated loading governs service life.',
    method: 'We tested {n} beam specimens with steel and polypropylene fibres at three volume fractions under constant-amplitude cyclic flexure.',
    finding: 'A 1.0% steel-fibre dosage extended fatigue life by {p}% over plain concrete, whereas polypropylene fibres mainly improved crack-width control.',
    implication: 'Fibre type should be chosen against the governing limit state rather than specified generically.' },
  { match: 'thermal management', subjects: ['Energy systems', 'Mechanical design', 'Electronics'], keywords: ['lithium-ion battery', 'thermal management', 'phase-change material', 'battery pack'],
    context: 'Heat build-up limits the safe fast-charging rate of lithium-ion packs, particularly in hot climates.',
    method: 'A coupled electro-thermal model was validated against {n} charge–discharge cycles on a 12-cell pack and used to compare air cooling with phase-change material inserts.',
    finding: 'Phase-change inserts lowered peak cell temperature by {p}% of the rise under 2C charging and reduced the spread across cells to under 3 °C.',
    implication: 'Passive thermal buffering can allow faster charging without the complexity of liquid cooling for small packs.' },
  { match: 'fpga-based', subjects: ['Electronics', 'Signal processing'], keywords: ['FPGA', 'digital filters', 'signal processing', 'fixed-point arithmetic'],
    context: 'Real-time filtering on FPGAs requires careful trade-offs between precision, latency and logic utilisation.',
    method: 'We implement FIR and IIR filter structures in fixed-point arithmetic and synthesise them for a mid-range device, measuring resource use over {n} test configurations.',
    finding: 'A transposed-form FIR with coefficient symmetry used {p}% fewer DSP slices than the direct form with no measurable loss in stop-band attenuation.',
    implication: 'Structure selection at design time yields larger savings than word-length reduction alone.' },
  { match: 'composite lay-up', subjects: ['Materials science', 'Mechanical design', 'Manufacturing'], keywords: ['composites', 'laminate optimisation', 'stacking sequence', 'genetic algorithm'],
    context: 'The stacking sequence of a composite laminate strongly affects stiffness and buckling resistance, but the design space is large.',
    method: 'We couple a finite-element model with a genetic algorithm to search lay-up sequences for a panel under combined loading, validated on {n} coupon tests.',
    finding: 'The optimised sequence improved buckling load by {p}% over a conventional quasi-isotropic lay-up at equal mass.',
    implication: 'Automated lay-up search is a realistic complement to designer experience for mid-volume components.' },
  { match: 'rooftop solar', subjects: ['Energy systems', 'Electronics'], keywords: ['solar inverter', 'reliability', 'rooftop PV', 'failure analysis'],
    context: 'Inverter failures are the leading cause of downtime in rooftop solar installations, yet field reliability data are scarce.',
    method: 'We analysed service records for {n} residential and commercial inverters over five years and fitted Weibull models to time-to-failure by component.',
    finding: 'Electrolytic capacitors accounted for {p}% of failures, with a clear dependence on rooftop ambient temperature.',
    implication: 'Procurement specifications should include thermal derating and capacitor lifetime, not only efficiency.' },
  { match: 'vibration damping', subjects: ['Mechanical design', 'Manufacturing'], keywords: ['vibration damping', 'machine tools', 'chatter', 'structural design'],
    context: 'Chatter limits the achievable productivity of machine tools, and the bed structure plays a decisive role in damping.',
    method: 'We compare cast iron, polymer concrete and a sandwich-filled bed through modal testing and {n} cutting trials at varying depths of cut.',
    finding: 'The polymer-concrete bed raised the stable depth of cut by {p}% and damping ratio by a factor of two relative to cast iron.',
    implication: 'Filled sandwich designs are a cost-effective upgrade path for existing machine-tool families.' },
  { match: 'upi adoption', subjects: ['Financial inclusion', 'Banking', 'Econometrics'], keywords: ['UPI', 'household savings', 'digital payments', 'financial inclusion'],
    context: 'Digital payments have spread rapidly, but whether they change how households save is unclear.',
    method: 'Using a panel of {n} households across 120 districts, we estimate fixed-effects models of savings rates on district-level UPI transaction intensity.',
    finding: 'Higher UPI intensity was associated with a {p}% relative rise in formal-account balances, concentrated among lower-income households.',
    implication: 'Payment access appears to complement, rather than substitute for, formal savings products, and should be bundled with them.' },
  { match: 'volatility spillovers', subjects: ['Capital markets', 'Econometrics'], keywords: ['volatility spillover', 'emerging markets', 'DCC-GARCH', 'equity markets'],
    context: 'Emerging equity markets are increasingly exposed to shocks originating in advanced economies.',
    method: 'We estimate a connectedness framework on daily returns for {n} trading days across twelve markets, separating crisis and non-crisis windows.',
    finding: 'Net spillovers from the United States rose by {p}% during stress episodes, with regional markets acting as secondary transmitters.',
    implication: 'Portfolio diversification across emerging markets offers less protection precisely when it is most needed.' },
  { match: 'credit scoring', subjects: ['Banking', 'Machine learning', 'Financial inclusion'], keywords: ['credit scoring', 'thin-file borrowers', 'alternative data', 'lending'],
    context: 'Borrowers without formal credit histories are routinely declined, even when their repayment capacity is adequate.',
    method: 'We evaluate scorecards that add utility-payment and mobile-wallet signals, using a sample of {n}k first-time borrowers from two lenders.',
    finding: 'Alternative data improved discrimination (AUC) from 0.61 to 0.{p} for thin-file applicants, with stable performance across gender and region.',
    implication: 'Lenders can expand access responsibly when alternative data are paired with regular fairness monitoring.' },
  { match: 'esg disclosure', subjects: ['Capital markets', 'Sustainability', 'Econometrics'], keywords: ['ESG disclosure', 'cost of capital', 'listed firms', 'panel data'],
    context: 'Investors are said to reward firms with stronger environmental, social and governance disclosure, but evidence for emerging markets is mixed.',
    method: 'We construct a disclosure index for {n} listed firm-years and relate it to the implied cost of equity with industry and year fixed effects.',
    finding: 'A one-standard-deviation increase in the index was associated with a {p}-basis-point lower cost of equity, driven by governance rather than environmental items.',
    implication: 'Firms may gain more from credible governance disclosure than from broad but thin ESG reporting.' },
  { match: 'microfinance repayment', subjects: ['Financial inclusion', 'Climate & development', 'Banking'], keywords: ['microfinance', 'repayment', 'climate shocks', 'rainfall'],
    context: 'Microfinance borrowers in rainfed regions are directly exposed to climate variability, which can disrupt repayment.',
    method: 'We link loan-level repayment records for {n} borrowers with district rainfall data and estimate repayment hazards around drought and flood events.',
    finding: 'Drought months raised the probability of delayed repayment by {p}%, and flexible rescheduling clauses nearly eliminated the effect.',
    implication: 'Climate-contingent repayment terms can protect both borrowers and lenders at modest cost.' },
  { match: 'bank mergers', subjects: ['Banking', 'Econometrics', 'Public policy'], keywords: ['bank mergers', 'deposit pricing', 'market concentration', 'competition'],
    context: 'Consolidation among public-sector banks has raised questions about competition and the prices customers face.',
    method: 'Using branch-level deposit rates for {n} branches before and after recent mergers, we apply a difference-in-differences design with unmerged banks as controls.',
    finding: 'Deposit rates at merged banks fell by {p} basis points relative to controls in concentrated districts, but not in districts with many competitors.',
    implication: 'Merger approvals should weigh local market structure, not only national balance-sheet metrics.' },
]

const FALLBACK_BY_JOURNAL: Record<JournalCode, string[]> = {
  IJMAT: ['Manufacturing', 'Automation'], JIMRT: ['Organisational behaviour', 'Innovation management'],
  IJCSD: ['Software engineering', 'Machine learning'], IJECM: ['Mechanical design', 'Materials science'], IJFRD: ['Banking', 'Econometrics'],
}

function topicFor(p: Paper): TopicEntry {
  const t = p.title.toLowerCase()
  return (
    TOPICS.find((e) => t.includes(e.match)) ?? {
      match: '', subjects: FALLBACK_BY_JOURNAL[p.journal], keywords: ['empirical study', 'emerging economies'],
      context: `This paper examines ${p.title.toLowerCase()} in the context of ${journalByCode(p.journal).name}.`,
      method: 'We combine survey data from {n} respondents with structured interviews.',
      finding: 'Results indicate a statistically significant relationship in {p}% of the tested specifications.',
      implication: 'The findings have practical implications for practitioners and policy makers.',
    }
  )
}

const fill = (s: string, p: Paper) => {
  const h = hash(p.id)
  const n = 120 + (h % 380)
  return s.replace(/\{n\}/g, String(n)).replace(/\{p\}/g, String(18 + (h % 41)))
}

export const paperSubjects = (p: Paper) => topicFor(p).subjects
export const keywordsFor = (p: Paper) => topicFor(p).keywords
export function abstractFor(p: Paper): string {
  const t = topicFor(p)
  const h = hash(p.id)
  const closing = p.articleType === 'Review article'
    ? 'We conclude by outlining open questions for future research.'
    : p.articleType === 'Case study'
      ? 'We discuss the transferability of the case to comparable settings.'
      : p.articleType === 'Short communication'
        ? 'We report these preliminary results to invite replication.'
        : 'Limitations and directions for future work are discussed.'
  const intro = p.articleType === 'Review article' ? `${t.context} This review synthesises the evidence published over the last decade.` : t.context
  return fill(`${intro} ${t.method} ${t.finding} ${t.implication} ${h % 2 ? closing : ''}`.trim(), p)
}
export const wordCountFor = (p: Paper) => (p.articleType === 'Short communication' ? 2400 : p.articleType === 'Review article' ? 7800 : 5200) + (hash(p.id) % 1300)

export const CONFERENCES = ['None', 'ICAMT 2026 · Pune', 'NCMR 2026 · Hyderabad', 'ICCSD 2026 · Bengaluru']
export const conferenceFor = (p: Paper) => (hash(p.id) % 7 === 0 ? CONFERENCES[1 + (hash(p.id) % 3)] : 'None')

const MENTORS = ['Prof. Sunita Rao · IIT Madras', 'Dr. Prakash Menon · NIT Calicut', 'Prof. Anil Deshpande · COEP Pune', 'Dr. Farah Siddiqui · AMU Aligarh']
export const mentorFor = (p: Paper) => (hash(p.id) % 4 === 0 ? pick(MENTORS, hash(p.id) >> 3) : undefined)
const REFERRERS = ['Divya Joshi', 'Siddharth Jain', 'Kavya Rao', 'Pooja Bhatt']
export function referralFor(p: Paper): { code: string; referrer: string } | undefined {
  const h = hash(p.id)
  return h % 5 === 0 ? { code: `REF-${String.fromCharCode(65 + (h % 26))}${String.fromCharCode(65 + ((h >> 4) % 26))}${1000 + (h % 8999)}`, referrer: pick(REFERRERS, h >> 2) } : undefined
}

/* ------------------------------------------------------------------ */
/* Reviewer pool + matching                                             */
/* ------------------------------------------------------------------ */
export interface ReviewerCandidate {
  user: StaffUser
  kind: ReviewerKind
  score: number
  matched: string[]
  expertise: string[]
}

export const reviewerKindOf = (user: StaffUser | undefined, journal: JournalCode): ReviewerKind =>
  user?.assignments[journal] === 'panel_member' ? 'panel' : 'in_house'

/** All active reviewers / panel members for a journal, with subject-match scores for the paper. */
export function candidatesFor(paper: Paper, users: StaffUser[], reviewPanelOn: boolean) {
  const subjects = paperSubjects(paper)
  const build = (role: 'reviewer' | 'panel_member'): ReviewerCandidate[] =>
    users
      .filter((u) => u.status === 'active' && u.assignments[paper.journal] === role)
      .map((user) => {
        const m = matchScore(subjects, EXPERTISE[user.id])
        return { user, kind: role === 'reviewer' ? ('in_house' as const) : ('panel' as const), score: m.score, matched: m.matched, expertise: EXPERTISE[user.id] ?? [] }
      })
      .sort((a, b) => b.score - a.score)
  const inHouse = build('reviewer')
  const best = inHouse[0]?.score ?? 0
  const outside = best < IN_HOUSE_MATCH_THRESHOLD
  const panel = reviewPanelOn && outside ? build('panel_member') : []
  return { inHouse, panel, outside, subjects, best }
}

/* ------------------------------------------------------------------ */
/* Review text                                                          */
/* ------------------------------------------------------------------ */
const AUTHOR_COMMENTS: Record<Recommendation, string[]> = {
  accept: [
    'The manuscript addresses a clearly defined problem and the argument is easy to follow. The methodology is appropriate for the question asked, and the results are reported with enough detail to be reproduced. I only suggest tightening two paragraphs in the discussion and making sure all figures have self-contained captions.',
    'This is a well-executed study. The literature review is balanced, the data collection is described transparently and the limitations section is honest about the constraints. A few typographical errors remain in the reference list; otherwise I recommend publication.',
  ],
  minor_revision: [
    'The paper makes a useful contribution, but several points need attention before publication. Please justify the sample size, explain how missing observations were handled, and state which software and versions were used. The conclusion currently claims slightly more than the evidence supports.',
    'The study is sound in its overall design. Please clarify the inclusion criteria in the methods section, add confidence intervals to the main results table, and update the references to include work from the last three years.',
  ],
  major_revision: [
    'The topic is relevant, but the current analysis does not yet support the central claim. The comparison group is not well matched, the robustness checks are limited to a single alternative specification, and the discussion does not engage with contradictory findings in the literature. I would be glad to see a substantially revised version.',
    'The manuscript needs significant work on the methods section: key variables are not defined, the sampling frame is unclear and several results cannot be reproduced from the information given. The writing also needs careful editing for clarity.',
  ],
  reject: [
    'Unfortunately the manuscript does not meet the journal’s standards in its current form. The research question is not clearly motivated, the methodology has fundamental flaws and the conclusions are not supported by the data presented. I encourage the authors to rework the study design before resubmitting elsewhere.',
  ],
}
const EDITOR_COMMENTS: Record<Recommendation, string[]> = {
  accept: ['No ethical or originality concerns. Happy for this to go ahead once the minor edits are made.'],
  minor_revision: ['I would be comfortable accepting after a light check of the revised version; a second review round should not be necessary.'],
  major_revision: ['I would like to see the revised version again before a final decision. The core idea has merit but the evidence is currently thin.'],
  reject: ['The overlap with the authors’ earlier work should be checked by the editorial office. In my view the paper is not suitable for this journal.'],
}
const SCORE_BASE: Record<Recommendation, number> = { accept: 4, minor_revision: 3, major_revision: 2, reject: 1 }

function reviewScores(rec: Recommendation, h: number): ReviewScores {
  const base = SCORE_BASE[rec]
  const j = (i: number) => Math.max(1, Math.min(5, rec === 'accept' ? 4 + ((h >> i) % 2) : base + ((h >> i) % 3) - 1))
  return { originality: j(1), methodology: j(3), clarity: j(5), significance: j(7), references: j(9) }
}

export const averageScore = (s: ReviewScores) => Math.round((Object.values(s).reduce((a, b) => a + b, 0) / 5) * 10) / 10

/* ------------------------------------------------------------------ */
/* Email text for decisions                                             */
/* ------------------------------------------------------------------ */
export function decisionEmail(kind: DecisionKind, paper: Pick<Paper, 'id' | 'title' | 'author' | 'journal'>, reason: string, dispatchAt?: string) {
  const j = journalByCode(paper.journal)
  const sign = `\n\nWith regards,\nEditorial Office\n${j.name}`
  const first = paper.author.split(' ')[0]
  switch (kind) {
    case 'accepted':
    case 'accepted_without_review':
      return {
        template: 'Decision: accepted',
        subject: `Your manuscript ${paper.id} has been accepted`,
        body: `Dear ${first},\n\nWe are pleased to inform you that your manuscript “${paper.title}” (${paper.id}) has been accepted for publication in ${j.name}.${reason ? `\n\nEditor’s note: ${reason}` : ''}\n\nNext step: a payment link for the article processing charge will follow${dispatchAt ? ` with the decision email dispatched on ${formatDate(dispatchAt)} at 08:45 IST` : ''}. Your DOI will be 10.55041/${paper.id}.${sign}`,
      }
    case 'changes_requested':
      return {
        template: 'Decision: changes requested',
        subject: `Revisions requested for ${paper.id}`,
        body: `Dear ${first},\n\nThank you for submitting “${paper.title}” (${paper.id}). After careful evaluation, the editors request revisions before a final decision can be made.\n\nRequested changes:\n${reason}\n\nPlease upload a revised manuscript together with a short note describing how each point was addressed.${sign}`,
      }
    case 'rejected':
      return {
        template: 'Decision: rejected',
        subject: `Decision on your manuscript ${paper.id}`,
        body: `Dear ${first},\n\nThank you for submitting “${paper.title}” (${paper.id}) to ${j.name}. After careful consideration we regret that we are unable to publish it.\n\nReason:\n${reason}\n\nWe appreciate your interest in the journal and wish you success with your research.${sign}`,
      }
  }
}

const TEMPLATE_BODIES: Record<string, (p: Paper) => { subject: string; body: string }> = {
  'Submission received': (p) => ({ subject: `We received your manuscript ${p.id}`, body: `Dear ${p.author.split(' ')[0]},\n\nThank you for submitting “${p.title}”. Your Paper ID is ${p.id}. Our editors will complete the initial screening shortly and keep you informed.\n\nEditorial Office` }),
  'Review assigned': (p) => ({ subject: `Review assigned: ${p.id}`, body: `Dear reviewer,\n\nYou have been assigned the manuscript “${p.title}” (${p.id}). Please submit your structured review by the due date shown in your workspace. The manuscript is anonymised.\n\nEditorial Office` }),
  'Review reminder': (p) => ({ subject: `Reminder: review due for ${p.id}`, body: `Dear reviewer,\n\nThis is a friendly reminder that your review of “${p.title}” (${p.id}) is due soon. If you need more time, reply to this email and the editor will adjust the due date.\n\nEditorial Office` }),
  'Decision: accepted': (p) => decisionEmail('accepted', p, ''),
  'Payment received': (p) => ({ subject: `Payment received for ${p.id}`, body: `Dear ${p.author.split(' ')[0]},\n\nWe have received your article processing charge for ${p.id}. A GST invoice will follow. Your paper now moves to production.\n\nAccounts Team` }),
  'Invoice sent': (p) => ({ subject: `Invoice for ${p.id}`, body: `Dear ${p.author.split(' ')[0]},\n\nPlease find the GST invoice for ${p.id} attached.\n\nAccounts Team` }),
  'Certificate ready': (p) => ({ subject: `Your publication certificate for ${p.id}`, body: `Dear ${p.author.split(' ')[0]},\n\nCertificates for “${p.title}” are ready and can be verified using the QR code printed on them.\n\nEditorial Office` }),
  'Published notice': (p) => ({ subject: `Your article ${p.id} is now online`, body: `Dear ${p.author.split(' ')[0]},\n\nWe are delighted to inform you that “${p.title}” has been published. DOI: 10.55041/${p.id}.\n\nEditorial Office` }),
  'Decision: changes requested': (p) => decisionEmail('changes_requested', p, 'Please see the comments in your author dashboard.'),
  'Decision: rejected': (p) => decisionEmail('rejected', p, 'Please see the editor’s comments.'),
}
export function messageContentFor(template: string, paper: Paper) {
  return (TEMPLATE_BODIES[template] ?? ((p: Paper) => ({ subject: `${template} — ${p.id}`, body: `Regarding your manuscript “${p.title}” (${p.id}).\n\nEditorial Office` })))(paper)
}

/* ------------------------------------------------------------------ */
/* Seed builder                                                         */
/* ------------------------------------------------------------------ */
const PAST_REVIEW: PaperStatus[] = ['decision_pending', 'changes_requested', 'accepted', 'payment_pending', 'paid', 'in_production', 'returned_to_production', 'ready_for_approval', 'published', 'indexed', 'retracted', 'corrected']

const editorOf = (j: JournalCode) => SEED_USERS.find((u) => u.assignments[j] === 'editor')?.name ?? 'Priya Menon'

function reviewerFor(p: Paper): StaffUser | undefined {
  if (p.reviewerId) return SEED_USERS.find((u) => u.id === p.reviewerId)
  const { inHouse, panel } = candidatesFor(p, SEED_USERS, true)
  const pool = inHouse[0] && inHouse[0].score >= IN_HOUSE_MATCH_THRESHOLD ? inHouse : [...panel, ...inHouse]
  return pool[hash(p.id) % Math.max(1, pool.length)]?.user ?? SEED_USERS.find((u) => u.id === 'u-reviewer')
}

export interface EditorialSeed {
  reviews: ReviewRecord[]
  decisions: DecisionRecord[]
  history: PaperEvent[]
  files: Record<string, FileVersion[]>
  reminders: Record<string, ReminderState>
}

export function buildEditorialSeed(papers: Paper[]): EditorialSeed {
  const reviews: ReviewRecord[] = []
  const decisions: DecisionRecord[] = []
  const history: PaperEvent[] = []
  const files: Record<string, FileVersion[]> = {}
  const reminders: Record<string, ReminderState> = {}

  for (const p of papers) {
    const h = hash(p.id)
    const order = STATUS_META[p.status].order
    const editor = editorOf(p.journal)
    const at = (f: number) => lerpTime(p.submittedAt, p.updatedAt, f)
    let ev = 0
    const push = (actor: string, text: string, f: number, note?: string) =>
      history.push({ id: `seed-ev-${p.id}-${ev++}`, paperId: p.id, at: at(f), actor, text, note })

    /* reviews */
    const reviewed = PAST_REVIEW.includes(p.status) || (p.status === 'rejected' && h % 2 === 0)
    const reviewer = reviewed || p.reviewerId ? reviewerFor(p) : undefined
    let rec: Recommendation | undefined
    if (reviewed && reviewer) {
      rec = p.status === 'rejected' ? 'reject' : p.status === 'changes_requested' ? (h % 2 ? 'major_revision' : 'minor_revision') : p.status === 'decision_pending' ? pick(['accept', 'minor_revision', 'accept', 'major_revision'] as Recommendation[], h) : pick(['accept', 'accept', 'minor_revision'] as Recommendation[], h)
      reviews.push({
        id: `rev-${p.id}-1`, paperId: p.id, journal: p.journal, reviewerId: reviewer.id, reviewerName: reviewer.name,
        reviewerKind: reviewerKindOf(reviewer, p.journal), round: 1, scores: reviewScores(rec, h),
        commentsToAuthor: pick(AUTHOR_COMMENTS[rec], h >> 2), commentsToEditor: pick(EDITOR_COMMENTS[rec], h >> 3), recommendation: rec,
        submittedAt: at(0.5),
      })
      // a second reviewer on roughly a third of reviewed papers
      if (h % 3 === 0 && p.status !== 'decision_pending') {
        const pool = [...candidatesFor(p, SEED_USERS, true).inHouse, ...candidatesFor(p, SEED_USERS, true).panel].map((c) => c.user).filter((u) => u.id !== reviewer.id)
        const second = pool[0]
        if (second) {
          const rec2: Recommendation = rec === 'reject' ? 'major_revision' : rec === 'accept' ? 'minor_revision' : rec
          reviews.push({
            id: `rev-${p.id}-2`, paperId: p.id, journal: p.journal, reviewerId: second.id, reviewerName: second.name,
            reviewerKind: reviewerKindOf(second, p.journal), round: 1, scores: reviewScores(rec2, h >> 1),
            commentsToAuthor: pick(AUTHOR_COMMENTS[rec2], h >> 4), commentsToEditor: pick(EDITOR_COMMENTS[rec2], h >> 5), recommendation: rec2,
            submittedAt: at(0.55),
          })
        }
      }
    }

    /* decisions */
    const lastReview = reviews.filter((r) => r.paperId === p.id)
    const decide = (kind: DecisionKind, reason: string, by = editor) =>
      decisions.push({ id: `dec-${p.id}-${decisions.length}`, paperId: p.id, kind, reason, by, at: at(0.7), round: 1 })
    if (p.status === 'changes_requested') {
      decide('changes_requested', 'Both reviewers asked for clarification of the sampling frame and additional robustness checks. Please address each point and upload a revised manuscript with a response note.')
    } else if (order >= STATUS_META.accepted.order && order <= STATUS_META.corrected.order && p.status !== 'rejected' && p.status !== 'withdrawn') {
      if (lastReview.length === 0) decide('accepted_without_review', 'Invited contribution from a conference track; peer-reviewed at the conference stage.')
      else decide('accepted', lastReview.some((r) => r.recommendation === 'minor_revision') ? 'Minor points raised by the reviewer were addressed in the revised file; recommending publication.' : 'Reviewer recommends acceptance; the scope and quality fit the journal.')
    } else if (p.status === 'rejected') {
      decide('rejected', lastReview.length ? 'Reviewer found fundamental flaws in the methodology that cannot be resolved through revision.' : 'Out of scope for the journal. Desk rejection after screening.')
    }

    /* files */
    const base = (v: number, at2: string, note?: string): FileVersion => ({
      id: `file-${p.id}-m${v}`, paperId: p.id, version: v, name: `${p.id}_Manuscript_v${v}.docx`, kind: 'manuscript', format: 'docx',
      sizeKb: 380 + ((h >> v) % 640), uploadedAt: at2, note,
    })
    const list: FileVersion[] = [base(1, p.submittedAt, 'Original submission')]
    const revised = p.status === 'changes_requested' ? false : order >= STATUS_META.accepted.order && h % 3 === 0 && p.status !== 'rejected' && p.status !== 'withdrawn'
    if (revised) list.unshift({ ...base(2, at(0.62), 'Revised after reviewer comments'), name: `${p.id}_Manuscript_v2_revised.docx` })
    list.push({ id: `file-${p.id}-cf`, paperId: p.id, version: 1, name: `${p.id}_Copyright_Form.pdf`, kind: 'supplementary', format: 'pdf', sizeKb: 120 + (h % 90), uploadedAt: p.submittedAt })
    if (h % 4 === 1) list.push({ id: `file-${p.id}-cl`, paperId: p.id, version: 1, name: `${p.id}_Cover_Letter.pdf`, kind: 'supplementary', format: 'pdf', sizeKb: 60 + (h % 40), uploadedAt: p.submittedAt })
    files[p.id] = list

    /* reminders */
    if (p.status === 'under_review' || p.status === 'screening') reminders[p.id] = { count: p.status === 'under_review' ? h % 3 : 0, lastAt: h % 3 ? at(0.9) : undefined }

    /* earlier timeline */
    push(p.author, 'submitted the manuscript', 0, `${p.articleType} · ${wordCountFor(p).toLocaleString('en-IN')} words`)
    push('System', `sent a submission confirmation to ${p.authorEmail}`, 0.01)
    if (p.status === 'withdrawn') {
      push(p.author, 'requested withdrawal of the submission', 0.8, 'Submitted elsewhere on advice of my supervisor.')
      continue
    }
    if (order >= 2 || p.status === 'rejected') push(editor, 'started screening', 0.12)
    if (order >= 3 || (p.status === 'rejected' && lastReview.length)) {
      if (p.status !== 'screening') push(editor, 'completed screening — scope and formatting checks passed', 0.2)
    }
    if (reviewer && (order >= 3 || p.status === 'rejected')) push(editor, `assigned ${reviewer.name} as reviewer`, 0.3, reviewer.assignments[p.journal] === 'panel_member' ? 'Outside in-house expertise — Review Panel Member selected.' : 'Subject match with in-house expertise.')
    for (const r of lastReview) push(r.reviewerName, `submitted a review report — ${recommendationMeta(r.recommendation).label}`, 0.5)
    const d = decisions.find((x) => x.paperId === p.id)
    if (d) push(d.by, `recorded decision: ${DECISION_META[d.kind].label.toLowerCase()}`, 0.7, d.reason)
    if (order >= STATUS_META.accepted.order && order <= STATUS_META.corrected.order && p.status !== 'rejected') {
      push('System', p.status === 'accepted' ? `queued the acceptance email for the ${formatDate(nextDispatch())} 08:45 dispatch` : 'sent the acceptance email at 08:45 dispatch', 0.75)
    }
    if (p.paymentStatus === 'verified') push('System', 'verified the article processing charge', 0.82)
    if (order >= STATUS_META.in_production.order && p.status !== 'rejected') push('System', 'moved the paper to the production queue', 0.88)
    if (order >= STATUS_META.published.order && p.status !== 'rejected') push('System', 'published the article', 0.97)
  }
  return { reviews, decisions, history, files, reminders }
}

/* ------------------------------------------------------------------ */
/* External Review Panel assignments (additive, applied at read time)   */
/* ------------------------------------------------------------------ */
/**
 * The shared papers seed only points IJECM papers at the panel member. So the reviewer's read-only
 * "Review Assignments" list is populated, a few papers that fall outside the in-house reviewer's expertise
 * (and a couple still in screening) are treated as assigned to the external panel member u-panel-2.
 * Read through `panelOverrideFor` in the reviews API; the shared seed is never edited.
 */
export const PANEL_MEMBER_FOR_OVERRIDES = 'u-panel-2'

export function buildPanelOverrides(papers: Paper[]): Record<string, string> {
  const out: Record<string, string> = {}
  const ij = papers.filter((p) => p.journal === 'IJMAT')
  const live = ij.filter((p) => (p.status === 'under_review' || p.status === 'decision_pending') && p.reviewerId === 'u-reviewer')
  const outside = live.filter((p) => matchScore(paperSubjects(p), EXPERTISE['u-reviewer']).score < 50)
  const chosen = (outside.length >= 2 ? outside : [...outside, ...live.filter((p) => !outside.includes(p))]).slice(0, 3)
  for (const p of chosen) out[p.id] = PANEL_MEMBER_FOR_OVERRIDES
  for (const p of ij.filter((x) => x.status === 'screening' && !x.reviewerId).slice(0, 2)) out[p.id] = PANEL_MEMBER_FOR_OVERRIDES
  return out
}

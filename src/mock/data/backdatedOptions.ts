/** Reference lists for the backdated submission form (mirrors the author Submit page on the journal websites). */

export const ARTICLE_TYPES = ['Research article', 'Review article', 'Case study', 'Short communication']

/** Subject area to the branches offered after it is chosen. */
export const SUBJECT_BRANCHES: Record<string, string[]> = {
  'Manufacturing': ['Additive manufacturing', 'Machining and tooling', 'Lean and quality systems', 'Industrial robotics'],
  'Automation': ['Industrial IoT', 'Control systems', 'Robotic process automation', 'Machine vision'],
  'Materials science': ['Composite materials', 'Nanomaterials', 'Metallurgy and alloys', 'Polymers and coatings'],
  'Mechanical design': ['Finite element analysis', 'Machine elements', 'Thermal systems', 'Vibration and acoustics'],
  'Civil engineering': ['Structural engineering', 'Geotechnical engineering', 'Transportation engineering', 'Construction management'],
  'Environmental engineering': ['Water and wastewater treatment', 'Air quality', 'Solid waste management', 'Environmental impact assessment'],
  'Energy systems': ['Solar and wind energy', 'Battery storage', 'Smart grids', 'Energy efficiency'],
  'Electronics': ['Embedded systems', 'VLSI design', 'Power electronics', 'Sensors and instrumentation'],
  'Signal processing': ['Image processing', 'Speech and audio', 'Biomedical signals', 'Communications'],
  'Machine learning': ['Deep learning', 'Reinforcement learning', 'Explainable AI', 'Time-series forecasting'],
  'Natural language processing': ['Language models', 'Machine translation', 'Sentiment analysis', 'Information extraction'],
  'Software engineering': ['Software testing', 'DevOps and delivery', 'Requirements engineering', 'Program analysis'],
  'Distributed systems': ['Cloud computing', 'Edge computing', 'Blockchain', 'Distributed databases'],
  'Security & fraud': ['Cryptography', 'Network security', 'Fraud analytics', 'Privacy engineering'],
  'Education technology': ['Learning analytics', 'Adaptive learning', 'Online assessment', 'Digital classrooms'],
  'Engineering education': ['Curriculum design', 'Project-based learning', 'Outcome-based education', 'Laboratory pedagogy'],
  'Higher education': ['Institutional governance', 'Student outcomes', 'Quality assurance', 'Internationalisation'],
  'Agriculture': ['Precision agriculture', 'Post-harvest technology', 'Agri-supply chains', 'Soil and water management'],
  'Public health': ['Health informatics', 'Occupational health', 'Epidemiology', 'Health systems'],
  'Organisational behaviour': ['Leadership', 'Employee engagement', 'Team dynamics', 'Organisational culture'],
  'Human resources': ['Talent management', 'Compensation and benefits', 'Workplace well-being', 'Learning and development'],
  'Entrepreneurship': ['Start-up ecosystems', 'Family business', 'Social enterprise', 'Venture financing'],
  'Innovation management': ['Open innovation', 'Technology adoption', 'R&D management', 'Digital transformation'],
  'Marketing': ['Brand management', 'Services marketing', 'Digital marketing', 'Pricing strategy'],
  'Consumer behaviour': ['Purchase intention', 'Brand loyalty', 'Online reviews', 'Sustainable consumption'],
  'Digital commerce': ['Platform economics', 'Online marketplaces', 'Digital payments', 'Omnichannel retail'],
  'Supply chain': ['Logistics and distribution', 'Supply chain resilience', 'Procurement', 'Inventory management'],
  'Banking': ['Retail banking', 'Credit risk', 'Bank regulation', 'Mergers and competition'],
  'Financial inclusion': ['Microfinance', 'Mobile money', 'Self-help groups', 'Financial literacy'],
  'Capital markets': ['Asset pricing', 'Corporate governance and disclosure', 'Market microstructure', 'Derivatives'],
  'Accounting': ['Financial reporting', 'Auditing', 'Management accounting', 'Taxation'],
  'Econometrics': ['Panel data methods', 'Time-series econometrics', 'Causal inference', 'Forecasting'],
  'Public policy': ['Fiscal policy', 'Regulation and competition', 'Welfare programmes', 'Urban governance'],
  'Regional development': ['Rural development', 'Urbanisation', 'Infrastructure and growth', 'Regional inequality'],
  'Climate & development': ['Climate adaptation', 'Carbon markets', 'Disaster risk', 'Green finance'],
  'Sustainability': ['ESG reporting', 'Circular economy', 'Sustainable operations', 'Corporate responsibility'],
}

export const SUBJECT_AREAS = Object.keys(SUBJECT_BRANCHES).sort()

export const branchesFor = (subject: string) => SUBJECT_BRANCHES[subject] ?? []

export const COUNTRY_CODES = [
  { code: '+91', label: 'India (+91)' }, { code: '+1', label: 'United States / Canada (+1)' }, { code: '+44', label: 'United Kingdom (+44)' },
  { code: '+61', label: 'Australia (+61)' }, { code: '+65', label: 'Singapore (+65)' }, { code: '+971', label: 'UAE (+971)' },
  { code: '+966', label: 'Saudi Arabia (+966)' }, { code: '+880', label: 'Bangladesh (+880)' }, { code: '+94', label: 'Sri Lanka (+94)' },
  { code: '+977', label: 'Nepal (+977)' }, { code: '+60', label: 'Malaysia (+60)' }, { code: '+49', label: 'Germany (+49)' },
  { code: '+33', label: 'France (+33)' }, { code: '+234', label: 'Nigeria (+234)' }, { code: '+27', label: 'South Africa (+27)' },
  { code: '+86', label: 'China (+86)' }, { code: '+81', label: 'Japan (+81)' },
]

export const COUNTRIES = [
  'India', 'United States', 'United Kingdom', 'Canada', 'Australia', 'Singapore', 'United Arab Emirates', 'Saudi Arabia', 'Bangladesh', 'Sri Lanka',
  'Nepal', 'Malaysia', 'Germany', 'France', 'Nigeria', 'South Africa', 'China', 'Japan', 'Other',
]

export const DECLARATIONS = [
  { key: 'original', label: 'The work is original, has not been published elsewhere and is not under consideration by another journal.' },
  { key: 'ethics', label: 'The research followed the applicable ethical standards, and any approvals or consents are on record.' },
  { key: 'copyright', label: 'All authors have signed the copyright transfer form and agree to the journal’s open-access licence.' },
  { key: 'consent', label: 'All listed authors have approved the manuscript and agree to the order in which they are named.' },
] as const

/** Split "+91 98230 41187" into its dialling code and number. */
export function splitPhone(raw?: string): { code: string; number: string } {
  const m = /^(\+\d{1,3})[\s-]*(.*)$/.exec((raw ?? '').trim())
  return m ? { code: COUNTRY_CODES.some((c) => c.code === m[1]) ? m[1] : '+91', number: m[2] } : { code: '+91', number: (raw ?? '').trim() }
}

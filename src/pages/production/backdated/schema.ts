import { z } from 'zod'
import type { BackdatedSubmission } from '@/mock/data/production'
import { branchesFor } from '@/mock/data/backdatedOptions'

export const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0)
export const ABSTRACT_MIN = 50
export const ABSTRACT_MAX = 350

const fileRef = z.object({ name: z.string(), size: z.number(), uploadedAt: z.string(), data: z.string().optional() })

const author = z.object({
  name: z.string().trim().min(2, 'Enter the author’s full name.'),
  email: z.email('Enter a valid email address.'),
  phoneCode: z.string().min(1, 'Choose a country code.'),
  phone: z.string().trim().regex(/^[0-9][0-9 -]{5,14}$/, 'Enter 6 to 15 digits.'),
  country: z.string().min(1, 'Choose a country.'),
  affiliation: z.string().trim().min(3, 'Enter the institution or organisation.'),
  orcid: z.string().trim().regex(/^$|^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/, 'Use the format 0000-0002-1825-0097.'),
  photo: fileRef.nullable(),
  corresponding: z.boolean(),
})

export const submissionSchema = z.object({
  articleType: z.string().min(1, 'Choose an article type.'),
  subject: z.string().min(1, 'Choose a subject area.'),
  branch: z.string(),
  title: z.string().trim().min(10, 'Enter the full title (at least 10 characters).').max(250, 'Keep the title within 250 characters.'),
  abstract: z.string().refine((v) => wordCount(v) >= ABSTRACT_MIN, `The abstract needs at least ${ABSTRACT_MIN} words.`).refine((v) => wordCount(v) <= ABSTRACT_MAX, `The abstract can have at most ${ABSTRACT_MAX} words.`),
  keywords: z.array(z.string()).min(3, 'Add at least 3 keywords.').max(8, 'Use at most 8 keywords.'),
  authors: z.array(author).min(1, 'Add at least one author.').max(12, 'A submission can list up to 12 authors.')
    .refine((a) => a.filter((x) => x.corresponding).length === 1, 'Mark exactly one author as the corresponding author.')
    .refine((a) => new Set(a.map((x) => x.email.trim().toLowerCase())).size === a.length, 'Each author needs a different email address.'),
  mentorOpen: z.boolean(),
  mentor: z.object({ name: z.string().trim(), email: z.string().trim(), phone: z.string().trim(), institution: z.string().trim() }),
  referralCode: z.string().trim().regex(/^$|^REF-[A-Za-z0-9]{4,10}$/, 'Referral codes look like REF-AB1234.'),
  conference: z.string(),
  manuscript: fileRef.nullable().refine((v): boolean => !!v, 'Upload the manuscript (DOC, DOCX or PDF).'),
  previousManuscripts: z.array(fileRef),
  supplementary: z.array(fileRef),
  copyright: fileRef.nullable().refine((v): boolean => !!v, 'Upload the signed copyright form.'),
  declarations: z.object({
    original: z.boolean().refine((v) => v, 'Confirm this declaration.'),
    ethics: z.boolean().refine((v) => v, 'Confirm this declaration.'),
    copyright: z.boolean().refine((v) => v, 'Confirm this declaration.'),
    consent: z.boolean().refine((v) => v, 'Confirm this declaration.'),
  }),
  generateId: z.boolean(),
  reason: z.string().trim().min(10, 'Record why this article is being re-submitted (at least 10 characters).'),
}).superRefine((v, ctx) => {
  if (branchesFor(v.subject).length > 0 && !v.branch) ctx.addIssue({ code: 'custom', path: ['branch'], message: 'Choose a branch.' })
  if (v.mentorOpen) {
    if (v.mentor.name.length < 3) ctx.addIssue({ code: 'custom', path: ['mentor', 'name'], message: 'Enter the mentor’s name.' })
    if (!z.email().safeParse(v.mentor.email).success) ctx.addIssue({ code: 'custom', path: ['mentor', 'email'], message: 'Enter a valid email address.' })
    if (!/^[+0-9][0-9 +-]{6,17}$/.test(v.mentor.phone)) ctx.addIssue({ code: 'custom', path: ['mentor', 'phone'], message: 'Enter a valid phone number.' })
    if (v.mentor.institution.length < 3) ctx.addIssue({ code: 'custom', path: ['mentor', 'institution'], message: 'Enter the mentor’s institution.' })
  }
})

export type SubmissionValues = z.infer<typeof submissionSchema>

export function toFormValues(s: BackdatedSubmission, articleType: string, title: string): SubmissionValues {
  return {
    articleType, subject: s.subject, branch: s.branch, title, abstract: s.abstract, keywords: s.keywords, authors: s.authors,
    mentorOpen: !!s.mentor, mentor: s.mentor ?? { name: '', email: '', phone: '', institution: '' },
    referralCode: s.referralCode, conference: s.conference, manuscript: s.manuscript, previousManuscripts: s.previousManuscripts,
    supplementary: s.supplementary, copyright: s.copyright, declarations: s.declarations, generateId: false, reason: '',
  }
}

/** Which form fields belong to which step (used to validate a step before moving on). */
export const STEP_FIELDS: Record<number, (keyof SubmissionValues)[]> = {
  0: ['articleType', 'subject', 'branch', 'title', 'abstract', 'keywords'],
  1: ['authors'],
  2: ['mentorOpen', 'mentor', 'referralCode', 'conference'],
  3: ['manuscript', 'supplementary', 'copyright', 'declarations'],
  4: ['generateId', 'reason'],
}

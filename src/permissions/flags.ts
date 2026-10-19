import type { Role } from '@/shared/types'

/**
 * Feature flags. Items that may be outside the original scope sit behind a flag (ON by default in the
 * prototype so the client can see them, each shown with a small badge). Toggle in Journal Settings
 * (Super Admin) or in the Prototype controls panel.
 */
export interface FeatureFlags {
  /** Review Panel Member role (external reviewers) — still under discussion. */
  reviewPanel: boolean
  /** Correction fee + payment link on post-publication corrections. */
  correctionFee: boolean
  /** Newsletter campaigns (compose, schedule, delivery report). */
  newsletterCampaigns: boolean
  /** Email channel in the Communication Inbox. */
  emailInbox: boolean
  /** Website chat channel in the Communication Inbox. */
  websiteChat: boolean
  /** SEO keyword auto-linking. */
  seoAutoLink: boolean
  /** Referral system. Off = paused: no referral code on the submission form and no referral details on Track Status (existing records are kept). */
  referralSystem: boolean
  /** Reviewers can see all submissions in their subject (client sheet says "show all submissions" — to confirm). */
  reviewerSeesAll: boolean
}

export const DEFAULT_FLAGS: FeatureFlags = {
  reviewPanel: true,
  correctionFee: true,
  newsletterCampaigns: true,
  emailInbox: true,
  websiteChat: true,
  seoAutoLink: true,
  reviewerSeesAll: false,
  referralSystem: true,
}

export type FlagBadge = 'Proposed' | 'Under discussion' | 'To confirm'

export const FLAG_META: Record<keyof FeatureFlags, { label: string; description: string; badge: FlagBadge }> = {
  reviewPanel: { label: 'Review Panel Member role', description: 'External reviewers for papers outside in-house expertise.', badge: 'Under discussion' },
  correctionFee: { label: 'Correction fee', description: 'Editor can set a fee and send a payment link for a correction.', badge: 'Proposed' },
  newsletterCampaigns: { label: 'Newsletter campaigns', description: 'Compose, schedule and track newsletters to subscribers.', badge: 'Proposed' },
  emailInbox: { label: 'Email in Communication Inbox', description: 'Show the Mail channel next to WhatsApp.', badge: 'Proposed' },
  websiteChat: { label: 'Website chat in Communication Inbox', description: 'Show the Chat channel from the journal websites.', badge: 'Proposed' },
  seoAutoLink: { label: 'SEO keyword auto-linking', description: 'Link chosen keywords to articles or subject pages automatically.', badge: 'Proposed' },
  referralSystem: { label: 'Referral system', description: 'Switch off to pause referrals: the referral code field and referral details are hidden on the website. Existing referral records are kept.', badge: 'Proposed' },
  reviewerSeesAll: { label: 'Reviewers see all submissions in their subject', description: 'Read-only view beyond assigned papers. Off until confirmed.', badge: 'To confirm' },
}

/** Roles that only exist when a flag is on. */
export const ROLE_FLAG: Partial<Record<Role, keyof FeatureFlags>> = { panel_member: 'reviewPanel' }

import type { PageDef } from '@/app/pageDef'
import { PaymentsPage } from './PaymentsPage'
import { InvoicesPage } from './InvoicesPage'
import { ReferralsPage } from './ReferralsPage'

/** Screens for the finance area. */
export const financePages: PageDef[] = [
  { path: '/payments', area: 'payments', element: <PaymentsPage /> },
  { path: '/invoices', area: 'invoices', element: <InvoicesPage /> },
  { path: '/referrals', area: 'referrals', element: <ReferralsPage /> },
]

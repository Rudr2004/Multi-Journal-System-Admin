import type { PageDef } from '@/app/pageDef'
import { IssuesPage } from './IssuesPage'
import { IssueEditorPage } from './IssueEditorPage'
import { ConferencesPage } from './ConferencesPage'
import { ConferenceEditorPage } from './ConferenceEditorPage'
import { DoiPage } from './DoiPage'
import { CertificatesPage } from './CertificatesPage'

/** Screens for the publishing area. */
export const publishingPages: PageDef[] = [
  { path: '/issues', area: 'issues', element: <IssuesPage /> },
  { path: '/issues/:issueId', area: 'issues', element: <IssueEditorPage /> },
  { path: '/conferences', area: 'conferences', element: <ConferencesPage /> },
  { path: '/conferences/:conferenceId', area: 'conferences', element: <ConferenceEditorPage /> },
  { path: '/doi', area: 'doi', element: <DoiPage /> },
  { path: '/certificates', area: 'certificates', element: <CertificatesPage /> },
]

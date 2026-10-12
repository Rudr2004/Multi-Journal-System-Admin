import type { PageDef } from '@/app/pageDef'

import CmsPage from './cms/CmsPage'
import EntryEditor from './cms/EntryEditor'
import BoardPage from './board/BoardPage'
import AnnouncementsPage from './announcements/AnnouncementsPage'
import AwardsPage from './awards/AwardsPage'
import AwardCyclePage from './awards/AwardCyclePage'
import FormsInboxPage from './forms/FormsInboxPage'

/** Screens for the website area. */
export const websitePages: PageDef[] = [
  { path: '/pages', area: 'cms', element: <CmsPage /> },
  { path: '/pages/:id', area: 'cms', element: <EntryEditor /> },
  { path: '/editorial-board', area: 'board', element: <BoardPage /> },
  { path: '/announcements', area: 'announcements', element: <AnnouncementsPage /> },
  { path: '/awards', area: 'awards', element: <AwardsPage /> },
  { path: '/awards/:cycleId', area: 'awards', element: <AwardCyclePage /> },
  { path: '/forms-inbox', area: 'forms', element: <FormsInboxPage /> },
]

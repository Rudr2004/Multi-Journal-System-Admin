import type { PageDef } from '@/app/pageDef'
import { ProductionQueuePage } from './ProductionQueuePage'
import { WorkspacePage } from './WorkspacePage'
import { FinalApprovalListPage } from './FinalApprovalListPage'
import { FinalApprovalDetailPage } from './FinalApprovalDetailPage'
import { BackdatedPage } from './BackdatedPage'
import { PostPubListPage } from './PostPubListPage'
import { PostPubNewPage } from './PostPubNewPage'
import { PostPubDetailPage } from './PostPubDetailPage'

/** Screens for the production and publication workflow. */
export const productionPages: PageDef[] = [
  { path: '/production', area: 'production', element: <ProductionQueuePage /> },
  { path: '/production/:paperId', area: 'production', element: <WorkspacePage /> },
  { path: '/final-approval', area: 'finalApproval', min: 'approve', element: <FinalApprovalListPage /> },
  { path: '/final-approval/:paperId', area: 'finalApproval', min: 'approve', element: <FinalApprovalDetailPage /> },
  { path: '/backdated', area: 'backdated', element: <BackdatedPage /> },
  { path: '/post-publication', area: 'postPub', element: <PostPubListPage /> },
  { path: '/post-publication/new', area: 'postPub', min: 'work', element: <PostPubNewPage /> },
  { path: '/post-publication/:id', area: 'postPub', element: <PostPubDetailPage /> },
]

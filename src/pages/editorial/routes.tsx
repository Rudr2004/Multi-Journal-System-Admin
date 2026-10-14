import type { PageDef } from '@/app/pageDef'
import { MyReviewsPage } from './MyReviewsPage'
import { PaperDetailPage } from './PaperDetailPage'
import { ReviewAssignmentsPage } from './ReviewAssignmentsPage'
import { ReviewManagementPage } from './ReviewManagementPage'
import { ReviewWorkspacePage } from './ReviewWorkspacePage'
import { SubmissionsPage } from './SubmissionsPage'

/** Screens for the editorial area: submissions, paper detail, review management and the reviewer workspace. */
export const editorialPages: PageDef[] = [
  { path: '/submissions', area: 'submissions', element: <SubmissionsPage /> },
  { path: '/submissions/:paperId', area: 'submissions', element: <PaperDetailPage /> },
  { path: '/review-management', area: 'reviewMgmt', element: <ReviewManagementPage /> },
  { path: '/my-reviews', area: 'myReviews', element: <MyReviewsPage /> },
  { path: '/my-reviews/:paperId', area: 'myReviews', element: <ReviewWorkspacePage /> },
  { path: '/review-assignments', area: 'reviewAssign', element: <ReviewAssignmentsPage /> },
]

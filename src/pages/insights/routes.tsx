import type { PageDef } from '@/app/pageDef'
import { AnalyticsPage } from './AnalyticsPage'
import { ArticleAnalyticsPage } from './ArticleAnalyticsPage'
import { ScholarPage } from './ScholarPage'

/** Screens for the insights area. */
export const insightsPages: PageDef[] = [
  { path: '/analytics', area: 'analytics', element: <AnalyticsPage /> },
  { path: '/analytics/articles/:paperId', area: 'analytics', element: <ArticleAnalyticsPage /> },
  { path: '/scholar-indexing', area: 'scholar', element: <ScholarPage /> },
]

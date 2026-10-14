import { Navigate } from 'react-router-dom'
import type { PageDef } from '@/app/pageDef'
import { ChatbotPage } from './ChatbotPage'
import { CommLogPage } from './CommLogPage'
import { DispatchPage } from './DispatchPage'
import { HelpdeskPage } from './HelpdeskPage'
import { InboxPage } from './InboxPage'
import { NewsletterPage } from './NewsletterPage'
import { NotificationsPage } from './NotificationsPage'
import { TicketDetailPage } from './TicketDetailPage'

/** Screens for the communication area. */
export const communicationPages: PageDef[] = [
  { path: '/dispatch', area: 'dispatch', element: <DispatchPage /> },
  { path: '/communication-log', area: 'commLog', element: <CommLogPage /> },
  { path: '/notifications', area: 'notifications', element: <NotificationsPage /> },
  { path: '/templates', area: 'notifications', element: <Navigate to="/notifications" replace /> },
  { path: '/newsletter', area: 'newsletter', element: <NewsletterPage /> },
  { path: '/inbox', area: 'inbox', element: <InboxPage /> },
  { path: '/whatsapp', area: 'whatsapp', element: <InboxPage /> },
  { path: '/helpdesk', area: 'helpdesk', element: <HelpdeskPage /> },
  { path: '/helpdesk/:ticketId', area: 'helpdesk', element: <TicketDetailPage /> },
  { path: '/chatbot', area: 'chatbot', element: <ChatbotPage /> },
]

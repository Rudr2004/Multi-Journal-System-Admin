import type { PageDef } from '@/app/pageDef'
import { ChatbotPage } from './ChatbotPage'
import { CommLogPage } from './CommLogPage'
import { DispatchPage } from './DispatchPage'
import { HelpdeskPage } from './HelpdeskPage'
import { TemplatesPage } from './TemplatesPage'
import { TicketDetailPage } from './TicketDetailPage'
import { WhatsAppPage } from './WhatsAppPage'

/** Screens for the communication area. */
export const communicationPages: PageDef[] = [
  { path: '/dispatch', area: 'dispatch', element: <DispatchPage /> },
  { path: '/communication-log', area: 'commLog', element: <CommLogPage /> },
  { path: '/templates', area: 'templates', element: <TemplatesPage /> },
  { path: '/whatsapp', area: 'whatsapp', element: <WhatsAppPage /> },
  { path: '/helpdesk', area: 'helpdesk', element: <HelpdeskPage /> },
  { path: '/helpdesk/:ticketId', area: 'helpdesk', element: <TicketDetailPage /> },
  { path: '/chatbot', area: 'chatbot', element: <ChatbotPage /> },
]

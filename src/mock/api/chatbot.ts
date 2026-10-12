import { newId, recordAudit } from '../actions'
import type { BotNode, Faq } from '../data/communication'
import { useCommStore } from '../stores/communication'
import { delay } from './latency'

export const getChatbot = () => {
  const { botTree, faqs } = useCommStore.getState()
  return delay({ tree: botTree, faqs })
}

export const countNodes = (nodes: BotNode[]): number => nodes.reduce((n, x) => n + 1 + countNodes(x.children), 0)

export async function saveBotTree(tree: BotNode[]) {
  useCommStore.getState().patch({ botTree: structuredClone(tree) })
  recordAudit({ journal: 'ALL', action: 'Published chatbot menu', target: 'Chatbot flows', newValue: `${countNodes(tree)} menu nodes` })
  return delay(true, 300, 600)
}

export async function saveFaq(input: Omit<Faq, 'id' | 'updatedAt'> & { id?: string }) {
  const { faqs, patch } = useCommStore.getState()
  const now = new Date().toISOString()
  if (input.id) {
    patch({ faqs: faqs.map((f) => (f.id === input.id ? { ...f, ...input, id: f.id, updatedAt: now } : f)) })
  } else {
    patch({ faqs: [{ ...input, id: newId('faq'), updatedAt: now }, ...faqs] })
  }
  recordAudit({ journal: 'ALL', action: input.id ? 'Edited FAQ' : 'Added FAQ', target: input.question })
  return delay(true, 200, 450)
}

export async function setFaqPublished(id: string, published: boolean) {
  const { faqs, patch } = useCommStore.getState()
  const f = faqs.find((x) => x.id === id)
  patch({ faqs: faqs.map((x) => (x.id === id ? { ...x, published, updatedAt: new Date().toISOString() } : x)) })
  recordAudit({ journal: 'ALL', action: published ? 'Published FAQ' : 'Unpublished FAQ', target: f?.question ?? id })
  return delay(true, 120, 250)
}

export async function deleteFaq(id: string) {
  const { faqs, botTree, patch } = useCommStore.getState()
  const f = faqs.find((x) => x.id === id)
  const clear = (nodes: BotNode[]): BotNode[] =>
    nodes.map((n) => ({ ...n, action: n.action.type === 'faq' && n.action.faqId === id ? { type: 'none' } : n.action, children: clear(n.children) }))
  patch({ faqs: faqs.filter((x) => x.id !== id), botTree: clear(botTree) })
  recordAudit({ journal: 'ALL', action: 'Deleted FAQ', target: f?.question ?? id })
  return delay(true, 200, 400)
}

import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '@/layout/PageHeader'
import { Tabs } from '@/components/Tabs'
import { PostsTab } from './PostsTab'
import { ResourcesTab } from './ResourcesTab'

export default function BlogPage() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'resources' ? 'resources' : 'posts'
  return (
    <>
      <PageHeader title="Blog & Resources" description="Blog posts go through approval before they appear on the journal website. Resources are downloadable templates, guides and checklists." />
      <Tabs value={tab} onChange={(t) => setParams(t === 'resources' ? { tab: 'resources' } : {}, { replace: true })}
        tabs={[
          { id: 'posts', label: 'Blog posts', content: <PostsTab /> },
          { id: 'resources', label: 'Resources', content: <ResourcesTab /> },
        ]} />
    </>
  )
}

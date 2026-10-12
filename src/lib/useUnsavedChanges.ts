import { useEffect } from 'react'
import { useBlocker } from 'react-router-dom'

/** Warns before leaving a page with unsaved edits (tab close and in-app navigation). */
export function useUnsavedChanges(dirty: boolean, message = 'You have unsaved changes. Leave without saving?') {
  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])
  const blocker = useBlocker(dirty)
  useEffect(() => {
    if (blocker.state === 'blocked') {
      if (window.confirm(message)) blocker.proceed()
      else blocker.reset()
    }
  }, [blocker, message])
}

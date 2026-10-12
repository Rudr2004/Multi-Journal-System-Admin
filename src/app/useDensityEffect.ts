import { useEffect } from 'react'
import { useSession } from '@/mock/store'

export function useDensityEffect() {
  const density = useSession((s) => s.density)
  useEffect(() => {
    document.documentElement.dataset.density = density
  }, [density])
}

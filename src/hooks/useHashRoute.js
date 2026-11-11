import { useCallback, useEffect, useState } from 'react'

// Minimal tab routing through the URL hash (#/live, #/records, #/reports),
// so a page refresh or a shared link opens the same tab.
export function useHashRoute(validIds, fallback) {
  const read = useCallback(() => {
    const id = window.location.hash.replace(/^#\/?/, '')
    return validIds.includes(id) ? id : fallback
  }, [validIds, fallback])

  const [route, setRoute] = useState(read)

  useEffect(() => {
    const onHashChange = () => setRoute(read())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [read])

  const navigate = useCallback((id) => {
    window.location.hash = `/${id}`
  }, [])

  return [route, navigate]
}

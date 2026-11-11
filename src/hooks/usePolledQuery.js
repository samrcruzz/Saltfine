import { useEffect, useRef, useState } from 'react'

// Runs an async `fetcher` when `deps` change and, if `intervalMs` is set,
// again on that interval (polling).
//
// `signature(data)` is optional: when it returns the same value as the last
// poll, the result is treated as unchanged and the component does not
// re-render. Use it for lists, e.g. (rows) => `${rows.length}:${rows[0]?.record_id}`.
export function usePolledQuery(fetcher, deps = [], { intervalMs = 0, signature } = {}) {
  const [state, setState] = useState({ data: undefined, loading: true, error: null })
  const fetcherRef = useRef(fetcher)
  const signatureRef = useRef(signature)

  useEffect(() => {
    fetcherRef.current = fetcher
    signatureRef.current = signature
  })

  useEffect(() => {
    let cancelled = false
    let lastSignature = Symbol('none')

    setState((previous) => ({ ...previous, loading: true }))

    async function run() {
      try {
        const data = await fetcherRef.current()
        if (cancelled) return
        const next = signatureRef.current ? signatureRef.current(data) : Symbol('always-new')
        if (next === lastSignature) return
        lastSignature = next
        setState({ data, loading: false, error: null })
      } catch (error) {
        if (!cancelled) setState((previous) => ({ ...previous, loading: false, error }))
      }
    }

    run()
    const id = intervalMs ? setInterval(run, intervalMs) : null

    return () => {
      cancelled = true
      if (id) clearInterval(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, intervalMs])

  return state
}

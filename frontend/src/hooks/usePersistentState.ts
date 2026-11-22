import { useEffect, useState } from 'react'

// useState that survives a page refresh, for small UI settings (tab, checkbox, selection).
// Stored as JSON in localStorage under `saltfine:<key>`; falls back to plain state if storage is blocked.
export function usePersistentState<T>(key: string, initial: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const storageKey = `saltfine:${key}`
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      return raw === null ? initial : (JSON.parse(raw) as T)
    } catch {
      return initial
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(value))
    } catch {
      /* storage full or blocked: keep working in memory */
    }
  }, [storageKey, value])

  return [value, setValue]
}

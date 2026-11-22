// Keeps the Lab Analysis queue on this device so a page refresh does not lose it.
//
// Storage plan (IndexedDB, not localStorage: it stores File objects and has far more room):
//   - analyzed images  -> only the result (~2 KB): counts, grade and the BACKEND image URLs.
//                         The photo itself already lives on the backend (/api/images/...).
//   - queued / failed  -> the original File too, so it can still be analyzed or retried.
//                         It is dropped as soon as the image is analyzed.

const DB_NAME = 'saltfine-lab'
const DB_VERSION = 1
const STORE = 'queue'

export interface StoredLabItem<R> {
  id: string
  /** position in the queue */
  order: number
  /** duplicate check: name::size::lastModified */
  key: string
  name: string
  size: number
  status: 'queued' | 'analyzing' | 'done' | 'failed'
  error?: string
  saved: boolean
  result?: R
  /** only kept while the image still needs analyzing */
  file?: File
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB not available'))
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' })
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    dbPromise.catch(() => {
      dbPromise = null // allow a retry later (e.g. after a private-mode error)
    })
  }
  return dbPromise
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const tx = db.transaction(STORE, mode)
        const req = fn(tx.objectStore(STORE))
        tx.oncomplete = () => resolve(req ? req.result : undefined)
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error)
      }),
  )
}

export const labStore = {
  async load<R>(): Promise<StoredLabItem<R>[]> {
    const all = (await run<StoredLabItem<R>[]>('readonly', (s) => s.getAll())) ?? []
    return all.sort((a, b) => a.order - b.order)
  },
  async put<R>(item: StoredLabItem<R>): Promise<void> {
    await run('readwrite', (s) => s.put(item))
  },
  async remove(id: string): Promise<void> {
    await run('readwrite', (s) => s.delete(id))
  },
  async clear(): Promise<void> {
    await run('readwrite', (s) => s.clear())
  },
  /** Ask the browser not to evict this data when disk space runs low (best effort). */
  async requestPersistence(): Promise<void> {
    try {
      if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist()
    } catch {
      /* not supported */
    }
  },
}

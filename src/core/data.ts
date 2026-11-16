import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

/**
 * Tiny data cache: one entry per key, shared by every component that asks for
 * it. `invalidate()` after a write marks entries stale; components keep
 * showing the old data while the new data loads (no flashing). Also refetches
 * when the tab comes back into focus, so a screen left open does not go stale.
 */
type Entry = { data?: unknown; error?: Error; promise?: Promise<void>; stale: boolean }
const cache = new Map<string, Entry>()
let version = 0
const subs = new Set<() => void>()
const notify = () => { version++; subs.forEach((f) => f()) }
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }

export function invalidate(prefix = '') {
  for (const [k, e] of cache) if (k.startsWith(prefix)) e.stale = true
  notify()
}

if (typeof window !== 'undefined') {
  let last = Date.now()
  window.addEventListener('focus', () => { if (Date.now() - last > 30_000) { last = Date.now(); invalidate() } })
}

function load(key: string, fetcher: () => Promise<unknown>) {
  let e = cache.get(key)
  if (!e) { e = { stale: true }; cache.set(key, e) }
  if (e.promise || !e.stale) return
  const ent = e
  ent.stale = false
  ent.promise = fetcher().then(
    (d) => { ent.data = d; ent.error = undefined },
    (err: Error) => { ent.error = err },
  ).finally(() => { ent.promise = undefined; notify() })
}

export function useData<T>(key: string | null, fetcher: () => Promise<T>) {
  const v = useSyncExternalStore(subscribe, () => version)
  useEffect(() => { if (key) load(key, fetcher) }, [key, v]) // eslint-disable-line react-hooks/exhaustive-deps
  const e = key ? cache.get(key) : undefined
  const reload = useCallback(() => { if (key) invalidate(key) }, [key])
  return {
    data: e?.data as T | undefined,
    error: e?.error,
    /** true only until the first answer arrives */
    loading: !!key && (!e || (e.data === undefined && !e.error)),
    refreshing: !!e?.promise,
    reload,
  }
}

/** Wrap a write: runs it, then refreshes cached reads. Returns [run, busy]. */
export function useAction<A extends unknown[]>(fn: (...a: A) => Promise<void>, opts: { invalidate?: string } = {}) {
  const [busy, setBusy] = useState(false)
  const run = useCallback(async (...a: A) => {
    setBusy(true)
    try {
      await fn(...a)
      invalidate(opts.invalidate ?? '')
    } finally {
      setBusy(false)
    }
  }, [fn, opts.invalidate])
  return [run, busy] as const
}

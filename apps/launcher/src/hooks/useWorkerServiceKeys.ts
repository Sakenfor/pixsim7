import { useCallback, useEffect, useState } from 'react'
import { getWorkerOverview } from '../api/workers'
import { usePollWhenVisible } from './usePollWhenVisible'

/**
 * The set of launcher service keys that are arq worker families, derived live
 * from /workers/overview — the same source WorkerServiceDetailPanel matches its
 * detail against. Replaces the old hardcoded ARQ_WORKER_SERVICE_KEYS allowlist
 * so a new backend WORKER_FAMILIES entry (launcher/core/worker_tasks.py) surfaces
 * its "Worker" panel with no frontend change.
 *
 * The family list is effectively static for a session, so this only needs a slow
 * refresh — enough to recover if /workers/overview was briefly unreachable at
 * mount. Returns a stable Set reference while the membership is unchanged.
 */
export function useWorkerServiceKeys(): Set<string> {
  const [keys, setKeys] = useState<Set<string>>(() => new Set())

  const refresh = useCallback(async () => {
    const overview = await getWorkerOverview()
    if (!overview) return
    setKeys((prev) => {
      const next = new Set(overview.families.map((f) => f.service_key))
      const unchanged = prev.size === next.size && [...next].every((k) => prev.has(k))
      return unchanged ? prev : next
    })
  }, [])

  useEffect(() => { refresh() }, [refresh])
  usePollWhenVisible(refresh, 30000, true)

  return keys
}

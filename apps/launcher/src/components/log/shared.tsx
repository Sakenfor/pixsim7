/**
 * Shared building blocks for the three log viewers (Console, DB Logs, Embedded).
 *
 * Each viewer fetches lines differently but renders the same toolbar controls,
 * routes field-badge clicks the same way, and sticks to the bottom on new lines.
 * These helpers hold that common logic so the viewers stay in sync.
 */

import { useCallback, useRef } from 'react'
import { Play, Pause, Refresh, Trash } from '../icons'

/** Fallback level-filter options when /logs/meta hasn't loaded yet. */
export const LEVEL_OPTIONS = ['', 'ERROR', 'WARNING', 'INFO', 'DEBUG']

/** Fields that open the Trace panel rather than filtering the search box. */
export const TRACEABLE_FIELDS = new Set(['request_id', 'job_id', 'provider_id', 'generation_id', 'user_id', 'submission_id'])

/**
 * Route a clicked field badge: traceable fields (request_id, job_id, …) open
 * the trace panel via `onFieldClick`; everything else filters in-place by
 * setting the search box to `name=value`.
 */
export function routeFieldClick(
  name: string,
  value: string,
  setSearch: (query: string) => void,
  onFieldClick?: (name: string, value: string) => void,
) {
  if (TRACEABLE_FIELDS.has(name) && onFieldClick) onFieldClick(name, value)
  else setSearch(`${name}=${value}`)
}

/**
 * Keep a scroll container pinned to the bottom as new lines arrive — unless the
 * user has scrolled up (within 40px of the bottom counts as "at bottom").
 *
 * Returns the ref to attach to the scroll element, an `onScroll` handler, and
 * `stickToBottom()` to call from an effect keyed on whatever drives new lines.
 */
export function useStickyScroll() {
  const containerRef = useRef<HTMLDivElement>(null)
  const atBottom = useRef(true)

  const stickToBottom = useCallback(() => {
    if (atBottom.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [])

  const onScroll = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }, [])

  return { containerRef, onScroll, stickToBottom }
}

/**
 * Pause / Refresh / (optional) Clear button group shared by the streaming log
 * viewers. Omit `onClear` to hide the clear button.
 */
export function LogControlButtons({ paused, onTogglePause, onRefresh, onClear }: {
  paused: boolean
  onTogglePause: () => void
  onRefresh: () => void
  onClear?: () => void
}) {
  return (
    <div className="flex items-center gap-0.5 mr-1">
      <button onClick={onTogglePause} className={`p-1 rounded ${paused ? 'bg-amber-600 text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-surface-hover'}`} title={paused ? 'Resume' : 'Pause'}>
        {paused ? <Play size={12} /> : <Pause size={12} />}
      </button>
      <button onClick={onRefresh} className="p-1 rounded text-gray-400 hover:text-gray-200 hover:bg-surface-hover" title="Refresh">
        <Refresh size={12} />
      </button>
      {onClear && (
        <button onClick={onClear} className="p-1 rounded text-gray-400 hover:text-gray-200 hover:bg-surface-hover" title="Clear">
          <Trash size={12} />
        </button>
      )}
    </div>
  )
}

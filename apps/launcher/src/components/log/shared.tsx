/**
 * Shared building blocks for the three log viewers (Console, DB Logs, Embedded).
 *
 * Each viewer fetches lines differently but renders the same toolbar controls,
 * routes field-badge clicks the same way, and sticks to the bottom on new lines.
 * These helpers hold that common logic so the viewers stay in sync.
 */

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

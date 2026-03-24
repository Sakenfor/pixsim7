import type { ServiceState } from '../api/client'

const healthDot: Record<string, string> = {
  healthy: 'bg-green-500',
  unhealthy: 'bg-red-500',
  starting: 'bg-yellow-500 animate-pulse',
  stopped: 'bg-gray-500',
  unknown: 'bg-gray-400',
}

const healthLabel: Record<string, string> = {
  healthy: 'Healthy',
  unhealthy: 'Unhealthy',
  starting: 'Starting...',
  stopped: 'Stopped',
  unknown: 'Unknown',
}

interface Props {
  service: ServiceState
  selected: boolean
  onSelect: () => void
  onStart: () => void
  onStop: () => void
  onRestart: () => void
}

export function ServiceCard({ service, selected, onSelect, onStart, onStop, onRestart }: Props) {
  const isRunning = service.status === 'running' || service.status === 'starting'
  const dot = healthDot[service.health] ?? healthDot.unknown

  return (
    <div
      onClick={onSelect}
      className={`
        rounded-lg border px-3 py-2.5 cursor-pointer transition-colors select-none
        ${selected
          ? service.health === 'unhealthy'
            ? 'border-red-500/60 bg-red-500/10'
            : 'border-blue-500/60 bg-blue-500/10'
          : 'border-border bg-surface-secondary hover:bg-surface-hover'
        }
        ${service.health === 'unhealthy' && !selected ? 'border-red-500/40 bg-red-500/5' : ''}
      `}
    >
      {/* Top row: dot + title + status */}
      <div className="flex items-center gap-2.5">
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dot}`} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-gray-100 truncate">{service.title}</div>
          <div className="text-[11px] text-gray-400 truncate">
            {healthLabel[service.health] ?? service.health}
            {service.pid ? ` | PID ${service.pid}` : ''}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {!isRunning ? (
            <button
              onClick={onStart}
              disabled={!service.tool_available}
              className="px-2.5 py-1 text-xs font-medium rounded bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 text-white transition-colors"
            >
              Start
            </button>
          ) : (
            <>
              <button
                onClick={onStop}
                className="px-2.5 py-1 text-xs font-medium rounded bg-red-600 hover:bg-red-500 text-white transition-colors"
              >
                Stop
              </button>
              <button
                onClick={onRestart}
                className="px-2 py-1 text-xs font-medium rounded bg-amber-600 hover:bg-amber-500 text-white transition-colors"
              >
                Restart
              </button>
            </>
          )}
        </div>
      </div>

      {/* Error line */}
      {service.last_error && (
        <div className="mt-1.5 text-[10px] text-red-400 truncate pl-5">
          {service.last_error}
        </div>
      )}

      {/* Tool warning */}
      {!service.tool_available && (
        <div className="mt-1.5 text-[10px] text-yellow-400 truncate pl-5">
          {service.tool_check_message}
        </div>
      )}
    </div>
  )
}

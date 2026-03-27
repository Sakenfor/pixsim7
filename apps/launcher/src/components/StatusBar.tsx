import { useServicesStore } from '../stores/services'
import { useWsStore } from '../stores/websocket'

export function StatusBar() {
  const services = useServicesStore((s) => s.services)
  const connected = useWsStore((s) => s.connected)

  const running = services.filter((s) => s.status === 'running' || s.status === 'starting').length
  const healthy = services.filter((s) => s.health === 'healthy').length

  const isDev = location.port === '3100'

  return (
    <div className="flex items-center gap-3 px-3 py-1 text-[10px] text-gray-400 bg-surface-secondary flex-1">
      <span>
        {running}/{services.length} running ({healthy} healthy)
      </span>
      <div className="flex-1" />
      {isDev && (
        <span className="flex items-center gap-1 text-amber-400">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          DEV
        </span>
      )}
      <span className="flex items-center gap-1">
        <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
        {connected ? 'Live' : 'Disconnected'}
      </span>
      <span className="text-gray-600">
        :{location.port}
      </span>
    </div>
  )
}

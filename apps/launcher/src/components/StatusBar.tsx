import { useEffect, useMemo, useState } from 'react'
import { useServicesStore } from '../stores/services'
import { useWsStore } from '../stores/websocket'
import { getIdentity, type IdentityStatus } from '../api/client'

interface Props {
  onShowSetup?: () => void
}

export function StatusBar({ onShowSetup }: Props) {
  const services = useServicesStore((s) => s.services)
  const connected = useWsStore((s) => s.connected)
  const [identity, setIdentity] = useState<IdentityStatus | null>(null)

  const running = services.filter((s) => s.status === 'running' || s.status === 'starting').length
  const healthy = services.filter((s) => s.health === 'healthy').length

  // Find dev peer for the current host — generic, works for any service pair
  const currentPort = location.port
  const devPeer = useMemo(() => {
    // Find a healthy dev service whose prod peer is serving on our current port
    for (const svc of services) {
      if (!svc.dev_peer_of || svc.health !== 'healthy') continue
      const prodService = services.find((s) => s.key === svc.dev_peer_of)
      if (!prodService?.url) continue
      try {
        const prodPort = new URL(prodService.url).port
        if (prodPort === currentPort) {
          return { devUrl: svc.url, devTitle: svc.title }
        }
      } catch {}
    }
    return null
  }, [services, currentPort])

  // Are we currently ON a dev service?
  const onDevService = useMemo(() => {
    for (const svc of services) {
      if (!svc.dev_peer_of || !svc.url) continue
      try {
        if (new URL(svc.url).port === currentPort) {
          const prodService = services.find((s) => s.key === svc.dev_peer_of)
          return { prodUrl: prodService?.url ?? null, prodTitle: prodService?.title ?? 'Prod' }
        }
      } catch {}
    }
    return null
  }, [services, currentPort])

  useEffect(() => {
    getIdentity().then(setIdentity).catch(() => {})
  }, [])

  return (
    <div className="flex items-center gap-3 px-3 py-1 text-[10px] text-gray-400 bg-surface-secondary flex-1">
      <span>
        {running}/{services.length} running ({healthy} healthy)
      </span>
      <div className="flex-1" />
      {identity?.exists && (
        <button
          onClick={onShowSetup}
          className="flex items-center gap-1 hover:text-gray-200 transition-colors"
          title={`Signed in as ${identity.username}\nKey: ${identity.keypair_id ?? 'none'}${identity.token_valid ? '' : '\nToken expired!'}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${identity.token_valid ? 'bg-blue-400' : 'bg-yellow-400 animate-pulse'}`} />
          {identity.username}
        </button>
      )}
      {identity && !identity.exists && onShowSetup && (
        <button
          onClick={onShowSetup}
          className="text-yellow-400 hover:text-yellow-300 transition-colors"
        >
          Set up account
        </button>
      )}
      {onDevService ? (
        <a
          href={onDevService.prodUrl ?? '#'}
          className="flex items-center gap-1 text-amber-400 hover:text-amber-300 transition-colors"
          title={`Switch to ${onDevService.prodTitle}`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          DEV — switch to prod
        </a>
      ) : devPeer?.devUrl && (
        <a
          href={devPeer.devUrl}
          target="_blank"
          rel="noopener"
          className="flex items-center gap-1 text-gray-500 hover:text-amber-400 transition-colors"
          title={`Open ${devPeer.devTitle}`}
        >
          Open Dev
        </a>
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

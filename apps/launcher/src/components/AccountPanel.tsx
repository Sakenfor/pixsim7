/**
 * Account panel — dock tab showing profile + system info when logged in,
 * or setup/login flow otherwise.
 */
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@pixsim7/shared.ui'
import {
  getSystemInfo,
  refreshToken,
  type SystemInfo,
  type IdentityStatus,
  type BackendStatus,
  type LauncherStatus,
} from '../api/client'
import { StatusDot } from '@pixsim7/shared.ui'
import { ChoiceCard, CreateForm, InfoRow, LinkForm, type FormShell } from './setupShared'
import { CollapsiblePanel } from './CollapsiblePanel'

type Mode = 'choose' | 'create' | 'link'

interface Props {
  /** Called after a successful first-time setup so the app can start loading services. */
  onIdentityCreated?: () => void
}

export function AccountPanel({ onIdentityCreated }: Props) {
  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null)
  const [mode, setMode] = useState<Mode>('choose')

  const reload = useCallback(() => {
    getSystemInfo().then(setSysInfo).catch(() => {})
  }, [])

  useEffect(() => { reload() }, [reload])

  // Re-poll every 30s for live status
  useEffect(() => {
    const id = setInterval(reload, 30_000)
    return () => clearInterval(id)
  }, [reload])

  const handleSetupDone = useCallback(() => {
    reload()
    onIdentityCreated?.()
  }, [reload, onIdentityCreated])

  const identity = sysInfo?.identity
  const loggedIn = identity?.exists

  return (
    <div className="h-full overflow-auto p-4 space-y-5">
      {loggedIn && mode === 'choose' && (
        <>
          <ProfileSection identity={identity!} onRefreshed={reload} />
          {sysInfo && <VersionsSection launcher={sysInfo.launcher} backend={sysInfo.backend} />}
        </>
      )}
      {!loggedIn && mode === 'choose' && <ChooseMode onPick={setMode} />}
      {mode === 'create' && (
        <CreateForm shell={FormShell} onBack={() => setMode('choose')} onComplete={handleSetupDone} />
      )}
      {mode === 'link' && (
        <LinkForm shell={FormShell} onBack={() => setMode('choose')} onComplete={handleSetupDone} />
      )}
    </div>
  )
}

// ── Profile section ──────────────────────────────────────────────

function ProfileSection({ identity, onRefreshed }: { identity: IdentityStatus; onRefreshed: () => void }) {
  const [refreshing, setRefreshing] = useState(false)

  const tokenExpiry = identity.token_expires_at
    ? new Date(identity.token_expires_at * 1000).toLocaleString()
    : 'Unknown'

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await refreshToken()
      onRefreshed()
    } catch {}
    setRefreshing(false)
  }

  return (
    <Section title="Identity">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
          {(identity.username ?? '?')[0].toUpperCase()}
        </div>
        <div>
          <div className="text-xs font-semibold text-gray-100">{identity.username}</div>
          {identity.email && <div className="text-[11px] text-gray-400">{identity.email}</div>}
        </div>
      </div>

      <div className="space-y-1 text-[11px]">
        <InfoRow label="Backend" value={identity.backend_url ?? 'http://localhost:8000'} />
        <InfoRow label="Keypair" value={identity.keypair_id ?? 'Not generated'} mono />
        <div className="flex items-center gap-2">
          <span className="text-gray-500 w-20 shrink-0">Token</span>
          <StatusDot tone={identity.token_valid ? 'success' : 'warning'} />
          <span className={`font-mono ${identity.token_valid ? 'text-green-400' : 'text-yellow-400'}`}>
            {identity.token_valid ? 'Valid' : 'Expired'}
          </span>
          {identity.token_valid && (
            <span className="text-gray-600 ml-1">expires {tokenExpiry}</span>
          )}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="ml-auto text-[10px] text-gray-500 hover:text-gray-300 disabled:opacity-40"
          >
            {refreshing ? 'refreshing...' : 'refresh'}
          </button>
        </div>
      </div>
    </Section>
  )
}

// ── Versions section (compact — health detail lives in service cards) ─

function VersionsSection({ launcher, backend }: { launcher: LauncherStatus; backend: BackendStatus }) {
  return (
    <Section title="System">
      <div className="space-y-1 text-[11px]">
        <InfoRow label="Launcher" value={`${launcher.version}  ·  up ${formatUptime(launcher.uptime_seconds)}`} />
        {backend.reachable && backend.api_version && (
          <InfoRow label="Backend API" value={backend.api_version} />
        )}
        {backend.reachable && backend.build_sha && (
          <InfoRow label="Build" value={backend.build_sha} mono />
        )}
        {!backend.reachable && (
          <div className="flex items-center gap-2">
            <span className="text-gray-500 w-20 shrink-0">Backend</span>
            <StatusDot tone="danger" />
            <span className="text-gray-500">unreachable</span>
          </div>
        )}
      </div>
    </Section>
  )
}

// ── Setup flow (not logged in) ───────────────────────────────────

function ChooseMode({ onPick }: { onPick: (m: Mode) => void }) {
  return (
    <div className="space-y-3 max-w-md">
      <div className="text-xs text-gray-400 mb-4">
        Set up your launcher identity to get started.
      </div>
      <ChoiceCard
        size="sm"
        title="Create Admin Account"
        description="Start fresh — create your admin account on the local backend."
        onClick={() => onPick('create')}
      />
      <ChoiceCard
        size="sm"
        title="Link Existing Backend"
        description="Already have a backend running? Log in to connect this launcher to it."
        onClick={() => onPick('link')}
      />
    </div>
  )
}

// ── Shared UI ────────────────────────────────────────────────────

const FormShell: FormShell = ({ title, onBack, children }) => {
  return (
    <div className="max-w-md">
      <div className="flex items-center gap-3 mb-4">
        <Button variant="ghost" size="sm" onClick={onBack}>&larr; Back</Button>
        <div className="text-sm font-semibold text-gray-100">{title}</div>
      </div>
      {children}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <CollapsiblePanel
      title={title}
      persistKey={`launcher:account:${title.toLowerCase()}`}
      className="rounded-lg"
    >
      {children}
    </CollapsiblePanel>
  )
}

// ── Helpers ──────────────────────────────────────────────────────

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}h ${m}m`
}

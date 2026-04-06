/**
 * Account panel — dock tab showing profile + system info when logged in,
 * or setup/login flow otherwise.
 */
import { useCallback, useEffect, useState } from 'react'
import { Button, Input } from '@pixsim7/shared.ui'
import {
  getSystemInfo,
  refreshToken,
  setupCreate,
  setupLink,
  type SystemInfo,
  type IdentityStatus,
  type BackendStatus,
  type LauncherStatus,
} from '../api/client'

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
        <CreateForm onBack={() => setMode('choose')} onComplete={handleSetupDone} />
      )}
      {mode === 'link' && (
        <LinkForm onBack={() => setMode('choose')} onComplete={handleSetupDone} />
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
        <KV label="Backend" value={identity.backend_url ?? 'http://localhost:8000'} />
        <KV label="Keypair" value={identity.keypair_id ?? 'Not generated'} mono />
        <div className="flex items-center gap-2">
          <span className="text-gray-500 w-20 shrink-0">Token</span>
          <Dot color={identity.token_valid ? 'green' : 'yellow'} />
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
        <KV label="Launcher" value={`${launcher.version}  ·  up ${formatUptime(launcher.uptime_seconds)}`} />
        {backend.reachable && backend.api_version && (
          <KV label="Backend API" value={backend.api_version} />
        )}
        {backend.reachable && backend.build_sha && (
          <KV label="Build" value={backend.build_sha} mono />
        )}
        {!backend.reachable && (
          <div className="flex items-center gap-2">
            <span className="text-gray-500 w-20 shrink-0">Backend</span>
            <Dot color="red" />
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
        title="Create Admin Account"
        description="Start fresh — create your admin account on the local backend."
        onClick={() => onPick('create')}
      />
      <ChoiceCard
        title="Link Existing Backend"
        description="Already have a backend running? Log in to connect this launcher to it."
        onClick={() => onPick('link')}
      />
    </div>
  )
}

function ChoiceCard({ title, description, onClick }: { title: string; description: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-lg border border-[#30363d] bg-[#161b22] px-4 py-3 hover:border-[#58a6ff] hover:bg-[#1c2128] transition-colors group"
    >
      <div className="text-xs font-semibold text-gray-100 group-hover:text-[#58a6ff] transition-colors">{title}</div>
      <div className="text-[11px] text-gray-400 mt-0.5">{description}</div>
    </button>
  )
}

function CreateForm({ onBack, onComplete }: { onBack: () => void; onComplete: () => void }) {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const valid = username.trim().length >= 2 && password.length >= 4 && password === confirm

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid) return
    setError('')
    setLoading(true)
    try {
      await setupCreate({ username: username.trim(), password, email: email.trim() || undefined })
      onComplete()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <FormShell title="Create Admin Account" onBack={onBack}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Username" value={username} onChange={setUsername} autoFocus />
        <Field label="Email" value={email} onChange={setEmail} type="email" placeholder="Optional" />
        <Field label="Password" value={password} onChange={setPassword} type="password" />
        <Field label="Confirm Password" value={confirm} onChange={setConfirm} type="password" />
        {error && <div className="text-xs text-red-400 select-text whitespace-pre-wrap break-words">{error}</div>}
        {password && confirm && password !== confirm && (
          <div className="text-xs text-yellow-400">Passwords don't match</div>
        )}
        <Button variant="primary" className="w-full" loading={loading} disabled={!valid} type="submit">
          Create Account
        </Button>
      </form>
    </FormShell>
  )
}

function LinkForm({ onBack, onComplete }: { onBack: () => void; onComplete: () => void }) {
  const [backendUrl, setBackendUrl] = useState('http://localhost:8000')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const valid = backendUrl.trim().length > 0 && username.trim().length >= 2 && password.length >= 1

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid) return
    setError('')
    setLoading(true)
    try {
      await setupLink({ backend_url: backendUrl.trim(), username: username.trim(), password })
      onComplete()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <FormShell title="Link Existing Backend" onBack={onBack}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Backend URL" value={backendUrl} onChange={setBackendUrl} placeholder="http://localhost:8000" />
        <Field label="Username" value={username} onChange={setUsername} autoFocus />
        <Field label="Password" value={password} onChange={setPassword} type="password" />
        {error && <div className="text-xs text-red-400 select-text whitespace-pre-wrap break-words">{error}</div>}
        <Button variant="primary" className="w-full" loading={loading} disabled={!valid} type="submit">
          Connect
        </Button>
      </form>
    </FormShell>
  )
}

// ── Shared UI ────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-3">
      <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">{title}</div>
      {children}
    </div>
  )
}

function KV({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-gray-500 w-20 shrink-0">{label}</span>
      <span className={`text-gray-300 truncate ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  )
}

function Dot({ color }: { color: 'green' | 'yellow' | 'red' }) {
  const cls = {
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    red: 'bg-red-500',
  }[color]
  return <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${cls}`} />
}

function FormShell({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
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

function Field({
  label, value, onChange, type = 'text', placeholder, autoFocus,
}: {
  label: string; value: string; onChange: (v: string) => void
  type?: string; placeholder?: string; autoFocus?: boolean
}) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        size="sm"
        className="bg-[#0d1117] text-gray-100 border-[#30363d] placeholder-gray-600"
      />
    </div>
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


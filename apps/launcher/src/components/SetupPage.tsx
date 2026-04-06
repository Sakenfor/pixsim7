import { useEffect, useState } from 'react'
import { Button, Input } from '@pixsim7/shared.ui'
import { getIdentity, refreshToken, setupCreate, setupLink, type IdentityStatus } from '../api/client'

type Mode = 'choose' | 'create' | 'link'

interface Props {
  onComplete: () => void
}

export function SetupPage({ onComplete }: Props) {
  const [mode, setMode] = useState<Mode>('choose')
  const [identity, setIdentity] = useState<IdentityStatus | null>(null)

  useEffect(() => {
    getIdentity().then(setIdentity).catch(() => {})
  }, [])

  const loggedIn = identity?.exists

  return (
    <div className="min-h-screen bg-[#0d1117] flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="text-3xl font-bold text-gray-100 mb-1">PixSim</div>
          <div className="text-sm text-gray-400">
            {loggedIn ? `Signed in as ${identity!.username}` : 'Set up your launcher to get started'}
          </div>
        </div>

        {loggedIn && mode === 'choose' && <AccountInfo identity={identity!} onBack={onComplete} />}
        {!loggedIn && mode === 'choose' && <ChooseMode onPick={setMode} />}
        {mode === 'create' && <CreateForm onBack={() => setMode('choose')} onComplete={onComplete} />}
        {mode === 'link' && <LinkForm onBack={() => setMode('choose')} onComplete={onComplete} />}
      </div>
    </div>
  )
}

// ── Account info (when logged in) ─────────────────────────────────

function AccountInfo({ identity: initialIdentity, onBack }: { identity: IdentityStatus; onBack: () => void }) {
  const [identity, setIdentity] = useState(initialIdentity)
  const [refreshing, setRefreshing] = useState(false)

  const tokenExpiry = identity.token_expires_at
    ? new Date(identity.token_expires_at * 1000).toLocaleString()
    : 'Unknown'

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await refreshToken()
      const updated = await getIdentity()
      setIdentity(updated)
    } catch {}
    setRefreshing(false)
  }

  return (
    <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-lg">
          {(identity.username ?? '?')[0].toUpperCase()}
        </div>
        <div>
          <div className="text-sm font-semibold text-gray-100">{identity.username}</div>
          {identity.email && <div className="text-xs text-gray-400">{identity.email}</div>}
        </div>
      </div>

      <div className="space-y-1.5 text-xs">
        <InfoRow label="Backend" value={identity.backend_url ?? 'http://localhost:8000'} />
        <InfoRow label="Keypair" value={identity.keypair_id ?? 'Not generated'} />
        <div className="flex items-center gap-2">
          <span className="text-gray-500 w-16 shrink-0">Token</span>
          <span className={`font-mono ${identity.token_valid ? 'text-green-400' : 'text-yellow-400'}`}>
            {identity.token_valid ? 'Valid' : 'Expired'}
          </span>
          <span className="text-gray-500">
            {identity.token_valid ? `expires ${tokenExpiry}` : ''}
          </span>
        </div>
      </div>

      <div className="pt-2 flex gap-2">
        <Button variant="primary" size="sm" onClick={onBack}>Back to Dashboard</Button>
        <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={refreshing}>
          {refreshing ? 'Refreshing...' : 'Refresh Token'}
        </Button>
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-gray-500 w-16 shrink-0">{label}</span>
      <span className="text-gray-300 font-mono truncate">{value}</span>
    </div>
  )
}

// ── Mode chooser ──────────────────────────────────────────────────

function ChooseMode({ onPick }: { onPick: (m: Mode) => void }) {
  return (
    <div className="space-y-3">
      <Card
        title="Create Admin Account"
        description="Start fresh — create your admin account on the local backend."
        onClick={() => onPick('create')}
      />
      <Card
        title="Link Existing Backend"
        description="Already have a backend running? Log in to connect this launcher to it."
        onClick={() => onPick('link')}
      />
    </div>
  )
}

function Card({ title, description, onClick }: { title: string; description: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-lg border border-[#30363d] bg-[#161b22] px-5 py-4 hover:border-[#58a6ff] hover:bg-[#1c2128] transition-colors group"
    >
      <div className="text-sm font-semibold text-gray-100 group-hover:text-[#58a6ff] transition-colors">{title}</div>
      <div className="text-xs text-gray-400 mt-1">{description}</div>
    </button>
  )
}

// ── Create admin form ─────────────────────────────────────────────

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
      <form onSubmit={submit} className="space-y-4">
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

// ── Link existing form ────────────────────────────────────────────

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
      <form onSubmit={submit} className="space-y-4">
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

// ── Shared UI ─────────────────────────────────────────────────────

function FormShell({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-5">
      <div className="flex items-center gap-3 mb-5">
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

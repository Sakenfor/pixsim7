import { useEffect, useState } from 'react'
import { Button } from '@pixsim7/shared.ui'
import { getIdentity, refreshToken, type IdentityStatus } from '../api/client'
import { ChoiceCard, CreateForm, InfoRow, LinkForm, type FormShell } from './setupShared'

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
        {mode === 'create' && <CreateForm shell={FormShell} formClassName="space-y-4" onBack={() => setMode('choose')} onComplete={onComplete} />}
        {mode === 'link' && <LinkForm shell={FormShell} formClassName="space-y-4" onBack={() => setMode('choose')} onComplete={onComplete} />}
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
        <InfoRow label="Backend" value={identity.backend_url ?? 'http://localhost:8000'} mono labelWidth="w-16" />
        <InfoRow label="Keypair" value={identity.keypair_id ?? 'Not generated'} mono labelWidth="w-16" />
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

// ── Mode chooser ──────────────────────────────────────────────────

function ChooseMode({ onPick }: { onPick: (m: Mode) => void }) {
  return (
    <div className="space-y-3">
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

// ── Shared UI ─────────────────────────────────────────────────────

const FormShell: FormShell = ({ title, onBack, children }) => {
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

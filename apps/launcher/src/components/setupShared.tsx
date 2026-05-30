/**
 * Shared launcher setup/identity UI — consumed by both the full-screen
 * SetupPage and the in-dock AccountPanel. Extracted to kill the near-verbatim
 * CreateForm / LinkForm / Field / card / info-row duplication that lived in both.
 */
import { useState } from 'react'
import { Button, Input } from '@pixsim7/shared.ui'
import { setupCreate, setupLink } from '../api/client'

/** Shell wrapper for a setup form — supplied by each consumer so it can keep
 *  its own framing (bordered card vs. inline header). */
export type FormShell = (props: {
  title: string
  onBack: () => void
  children: React.ReactNode
}) => React.ReactElement

// ── Labelled text input ──────────────────────────────────────────

export function Field({
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

// ── Clickable choice card ────────────────────────────────────────

export function ChoiceCard({
  title, description, onClick, size = 'md',
}: {
  title: string; description: string; onClick: () => void; size?: 'sm' | 'md'
}) {
  const pad = size === 'sm' ? 'px-4 py-3' : 'px-5 py-4'
  const titleSize = size === 'sm' ? 'text-xs' : 'text-sm'
  const descSize = size === 'sm' ? 'text-[11px] mt-0.5' : 'text-xs mt-1'
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-lg border border-[#30363d] bg-[#161b22] ${pad} hover:border-[#58a6ff] hover:bg-[#1c2128] transition-colors group`}
    >
      <div className={`${titleSize} font-semibold text-gray-100 group-hover:text-[#58a6ff] transition-colors`}>{title}</div>
      <div className={`${descSize} text-gray-400`}>{description}</div>
    </button>
  )
}

// ── Label / value info row ───────────────────────────────────────

export function InfoRow({
  label, value, mono = false, labelWidth = 'w-20',
}: {
  label: string; value: string; mono?: boolean; labelWidth?: string
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={`text-gray-500 ${labelWidth} shrink-0`}>{label}</span>
      <span className={`text-gray-300 truncate ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  )
}

// ── Identity setup forms ─────────────────────────────────────────

export function CreateForm({
  shell: Shell, formClassName = 'space-y-3', onBack, onComplete,
}: {
  shell: FormShell; formClassName?: string; onBack: () => void; onComplete: () => void
}) {
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
    <Shell title="Create Admin Account" onBack={onBack}>
      <form onSubmit={submit} className={formClassName}>
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
    </Shell>
  )
}

export function LinkForm({
  shell: Shell, formClassName = 'space-y-3', onBack, onComplete,
}: {
  shell: FormShell; formClassName?: string; onBack: () => void; onComplete: () => void
}) {
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
    <Shell title="Link Existing Backend" onBack={onBack}>
      <form onSubmit={submit} className={formClassName}>
        <Field label="Backend URL" value={backendUrl} onChange={setBackendUrl} placeholder="http://localhost:8000" />
        <Field label="Username" value={username} onChange={setUsername} autoFocus />
        <Field label="Password" value={password} onChange={setPassword} type="password" />
        {error && <div className="text-xs text-red-400 select-text whitespace-pre-wrap break-words">{error}</div>}
        <Button variant="primary" className="w-full" loading={loading} disabled={!valid} type="submit">
          Connect
        </Button>
      </form>
    </Shell>
  )
}

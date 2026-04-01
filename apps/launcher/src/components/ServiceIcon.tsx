/**
 * Inline SVG icons for launcher service cards.
 *
 * Each icon is a 16x16 stroke icon.  The `className` prop controls
 * stroke colour so the card can tint icons by health status.
 */

const svgProps = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

/* ---------- icon paths ---------- */

function Database(p: { className?: string }) {
  return (
    <svg {...svgProps} className={p.className} stroke="currentColor">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" />
      <path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3" />
    </svg>
  )
}

function Server(p: { className?: string }) {
  return (
    <svg {...svgProps} className={p.className} stroke="currentColor">
      <rect x="2" y="2" width="20" height="8" rx="2" />
      <rect x="2" y="14" width="20" height="8" rx="2" />
      <circle cx="6" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="6" cy="18" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

function Globe(p: { className?: string }) {
  return (
    <svg {...svgProps} className={p.className} stroke="currentColor">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  )
}

function Cog(p: { className?: string }) {
  return (
    <svg {...svgProps} className={p.className} stroke="currentColor">
      <path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16z" />
      <path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
      <path d="M12 2v2" /><path d="M12 20v2" />
      <path d="M4.93 4.93l1.41 1.41" /><path d="M17.66 17.66l1.41 1.41" />
      <path d="M2 12h2" /><path d="M20 12h2" />
      <path d="M4.93 19.07l1.41-1.41" /><path d="M17.66 6.34l1.41-1.41" />
    </svg>
  )
}

function Bot(p: { className?: string }) {
  return (
    <svg {...svgProps} className={p.className} stroke="currentColor">
      <rect x="3" y="11" width="18" height="10" rx="2" />
      <circle cx="12" cy="5" r="2" />
      <path d="M12 7v4" />
      <circle cx="8" cy="16" r="1" fill="currentColor" stroke="none" />
      <circle cx="16" cy="16" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

function Sparkles(p: { className?: string }) {
  return (
    <svg {...svgProps} className={p.className} stroke="currentColor">
      <path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3z" />
      <path d="M18 14l.7 2.3L21 17l-2.3.7L18 20l-.7-2.3L15 17l2.3-.7L18 14z" />
    </svg>
  )
}

function Terminal(p: { className?: string }) {
  return (
    <svg {...svgProps} className={p.className} stroke="currentColor">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M6 10l4 2-4 2" />
      <path d="M12 16h4" />
    </svg>
  )
}

function Gamepad(p: { className?: string }) {
  return (
    <svg {...svgProps} className={p.className} stroke="currentColor">
      <path d="M6 11h4" /><path d="M8 9v4" />
      <circle cx="15" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="18" cy="10" r="1" fill="currentColor" stroke="none" />
      <rect x="2" y="6" width="20" height="12" rx="4" />
    </svg>
  )
}

/* ---------- service key -> icon mapping ---------- */

const SERVICE_ICONS: Record<string, (p: { className?: string }) => React.ReactNode> = {
  'db':                Database,
  'main-api':          Server,
  'launcher-api':      Terminal,
  'launcher-dev':      Terminal,
  'frontend':          Globe,
  'worker':            Cog,
  'simulation-worker': Gamepad,
  'generation-api':    Sparkles,
  'ai-client':         Bot,
}

/* ---------- public component ---------- */

interface ServiceIconProps {
  serviceKey: string
  className?: string
}

export function ServiceIcon({ serviceKey, className }: ServiceIconProps) {
  const Icon = SERVICE_ICONS[serviceKey] ?? Server
  return <Icon className={className} />
}

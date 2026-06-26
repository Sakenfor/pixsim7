/**
 * Shared inline-SVG icons for the launcher.
 *
 * One definition per glyph, sized via props so the same component serves both
 * the service cards (18px) and the flexlayout tab bar (14px). Colour comes from
 * `currentColor`, so callers tint via `className` (e.g. health colours).
 *
 * Two groups:
 *   - Service / tab glyphs (stroke icons) + `SERVICE_ICON_MAP` (service key → icon).
 *   - Toolbar controls (Play/Pause/Refresh/Trash) used by the log viewers.
 */

export interface IconProps {
  size?: number
  strokeWidth?: number
  className?: string
}

/** Shared attributes for stroke-style icons. */
function strokeProps({ size = 18, strokeWidth = 1.8 }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
}

export type IconComponent = (p: IconProps) => React.ReactElement

// ── Service / tab glyphs ─────────────────────────────────────────────

export const Database: IconComponent = (p) => (
  <svg {...strokeProps(p)} className={p.className}>
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" />
    <path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3" />
  </svg>
)

export const Server: IconComponent = (p) => (
  <svg {...strokeProps(p)} className={p.className}>
    <rect x="2" y="2" width="20" height="8" rx="2" />
    <rect x="2" y="14" width="20" height="8" rx="2" />
    <circle cx="6" cy="6" r="1" fill="currentColor" stroke="none" />
    <circle cx="6" cy="18" r="1" fill="currentColor" stroke="none" />
  </svg>
)

export const Globe: IconComponent = (p) => (
  <svg {...strokeProps(p)} className={p.className}>
    <circle cx="12" cy="12" r="10" />
    <path d="M2 12h20" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
)

export const Cog: IconComponent = (p) => (
  <svg {...strokeProps(p)} className={p.className}>
    <path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16z" />
    <path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
    <path d="M12 2v2" /><path d="M12 20v2" />
    <path d="M4.93 4.93l1.41 1.41" /><path d="M17.66 17.66l1.41 1.41" />
    <path d="M2 12h2" /><path d="M20 12h2" />
    <path d="M4.93 19.07l1.41-1.41" /><path d="M17.66 6.34l1.41-1.41" />
  </svg>
)

export const Bot: IconComponent = (p) => (
  <svg {...strokeProps(p)} className={p.className}>
    <rect x="3" y="11" width="18" height="10" rx="2" />
    <circle cx="12" cy="5" r="2" />
    <path d="M12 7v4" />
    <circle cx="8" cy="16" r="1" fill="currentColor" stroke="none" />
    <circle cx="16" cy="16" r="1" fill="currentColor" stroke="none" />
  </svg>
)

export const Sparkles: IconComponent = (p) => (
  <svg {...strokeProps(p)} className={p.className}>
    <path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3z" />
    <path d="M18 14l.7 2.3L21 17l-2.3.7L18 20l-.7-2.3L15 17l2.3-.7L18 14z" />
  </svg>
)

export const Terminal: IconComponent = (p) => (
  <svg {...strokeProps(p)} className={p.className}>
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="M6 10l4 2-4 2" />
    <path d="M12 16h4" />
  </svg>
)

export const Gamepad: IconComponent = (p) => (
  <svg {...strokeProps(p)} className={p.className}>
    <path d="M6 11h4" /><path d="M8 9v4" />
    <circle cx="15" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="18" cy="10" r="1" fill="currentColor" stroke="none" />
    <rect x="2" y="6" width="20" height="12" rx="4" />
  </svg>
)

export const Cpu: IconComponent = (p) => (
  <svg {...strokeProps(p)} className={p.className}>
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <rect x="9" y="9" width="6" height="6" />
    <path d="M9 2v2" /><path d="M15 2v2" /><path d="M9 20v2" /><path d="M15 20v2" />
    <path d="M2 9h2" /><path d="M2 15h2" /><path d="M20 9h2" /><path d="M20 15h2" />
  </svg>
)

export const Info: IconComponent = (p) => (
  <svg {...strokeProps(p)} className={p.className}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4" />
    <path d="M12 8h.01" />
  </svg>
)

export const Wrench: IconComponent = (p) => (
  <svg {...strokeProps(p)} className={p.className}>
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  </svg>
)

export const Bug: IconComponent = (p) => (
  <svg {...strokeProps(p)} className={p.className}>
    <path d="M8 2l1.88 1.88" />
    <path d="M14.12 3.88L16 2" />
    <path d="M9 7.13v-1a3 3 0 0 1 6 0v1" />
    <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6" />
    <path d="M12 20v-9" />
    <path d="M6.53 9C4.6 8.8 3 7.1 3 5" />
    <path d="M6 13H2" />
    <path d="M3 21c0-2.1 1.7-3.9 3.8-4" />
    <path d="M17.47 9c1.93-.2 3.53-1.9 3.53-4" />
    <path d="M18 13h4" />
    <path d="M21 21c0-2.1-1.7-3.9-3.8-4" />
  </svg>
)

export const Activity: IconComponent = (p) => (
  <svg {...strokeProps(p)} className={p.className}>
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
)

export const User: IconComponent = (p) => (
  <svg {...strokeProps(p)} className={p.className}>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
)

/** Service key → icon. Shared by the service cards and the dock tab bar. */
export const SERVICE_ICON_MAP: Record<string, IconComponent> = {
  'db': Database,
  'main-api': Server,
  'launcher-api': Terminal,
  'launcher-dev': Terminal,
  'frontend': Globe,
  'worker': Cog,
  'simulation-worker': Gamepad,
  'generation-api': Sparkles,
  'ai-client': Bot,
  'embedding-daemon': Cpu,
  'text-embedding-daemon': Cpu,
}

// ── Toolbar controls (log viewers) ───────────────────────────────────

export const Play: IconComponent = ({ size = 12, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none" className={className}>
    <polygon points="6,4 20,12 6,20" />
  </svg>
)

export const Pause: IconComponent = ({ size = 12, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none" className={className}>
    <rect x="5" y="4" width="4" height="16" />
    <rect x="15" y="4" width="4" height="16" />
  </svg>
)

export const Refresh: IconComponent = ({ size = 12, strokeWidth = 2, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M21 2v6h-6" />
    <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
    <path d="M3 22v-6h6" />
    <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
  </svg>
)

export const Trash: IconComponent = ({ size = 12, strokeWidth = 2, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M3 6h18" />
    <path d="M8 6V4h8v2" />
    <path d="M5 6v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6" />
  </svg>
)

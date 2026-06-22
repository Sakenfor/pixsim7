/**
 * Service-card icon: maps a service key to its glyph (18px stroke icon).
 * Icon definitions and the key→icon map live in `./icons` (shared with the
 * dock tab bar). `className` controls stroke colour for health tinting.
 */

import { SERVICE_ICON_MAP, Server } from './icons'

interface ServiceIconProps {
  serviceKey: string
  className?: string
}

export function ServiceIcon({ serviceKey, className }: ServiceIconProps) {
  const Icon = SERVICE_ICON_MAP[serviceKey] ?? Server
  return <Icon className={className} />
}

import { DisclosureSection } from '@pixsim7/shared.ui'

interface CollapsiblePanelProps {
  title: React.ReactNode
  children: React.ReactNode
  badge?: React.ReactNode
  persistKey?: string
  defaultOpen?: boolean
  className?: string
  headerClassName?: string
  contentClassName?: string
}

export function CollapsiblePanel({
  title,
  children,
  badge,
  persistKey,
  defaultOpen = true,
  className = '',
  headerClassName = '',
  contentClassName = '',
}: CollapsiblePanelProps) {
  return (
    <DisclosureSection
      label={title}
      badge={badge}
      defaultOpen={defaultOpen}
      persistKey={persistKey}
      className={`bg-surface-secondary rounded border border-border overflow-hidden ${className}`}
      headerClassName={`px-3 py-2 text-[11px] font-semibold text-gray-300 hover:bg-surface/40 ${headerClassName}`}
      contentClassName={`!mt-0 border-t border-border px-3 py-2.5 ${contentClassName}`}
    >
      {children}
    </DisclosureSection>
  )
}

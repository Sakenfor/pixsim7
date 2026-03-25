/**
 * Right Sidebar — mirrors the cards sidebar on the opposite side.
 * Contains: Trace panel, Codegen, Migrations, Settings, Buildables.
 * Collapsible sections, toggleable visibility.
 */

import { useState } from 'react'
import { ToolsPage } from './ToolsPage'
import { TracePanel } from './TracePanel'

interface TraceTarget {
  fieldName: string
  fieldValue: string
}

interface RightSidebarProps {
  traceTarget: TraceTarget | null
  onClearTrace: () => void
}

export function RightSidebar({ traceTarget, onClearTrace }: RightSidebarProps) {
  const [activeSection, setActiveSection] = useState<string>(traceTarget ? 'trace' : 'tools')

  // Auto-switch to trace when a new trace target arrives
  if (traceTarget && activeSection !== 'trace') {
    setActiveSection('trace')
  }

  const sections = [
    { id: 'trace', label: 'Trace', show: !!traceTarget },
    { id: 'tools', label: 'Tools', show: true },
  ]

  return (
    <div className="flex flex-col h-full border-l border-border">
      {/* Section tabs */}
      <div className="flex border-b border-border shrink-0">
        {sections.filter((s) => s.show).map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            className={`flex-1 px-2 py-1.5 text-[10px] font-medium border-b-2 transition-colors ${
              activeSection === s.id
                ? 'text-blue-400 border-blue-400'
                : 'text-gray-500 border-transparent hover:text-gray-300'
            }`}
          >
            {s.label}
            {s.id === 'trace' && traceTarget && (
              <span className="ml-1 text-blue-500">●</span>
            )}
          </button>
        ))}
      </div>

      {/* Section content */}
      <div className="flex-1 overflow-hidden">
        {activeSection === 'trace' && traceTarget && (
          <TracePanel
            fieldName={traceTarget.fieldName}
            fieldValue={traceTarget.fieldValue}
            onClose={onClearTrace}
          />
        )}
        {activeSection === 'tools' && <ToolsPage />}
      </div>
    </div>
  )
}

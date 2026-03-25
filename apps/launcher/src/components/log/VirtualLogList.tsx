/**
 * Simple virtualized log list — only renders rows near the viewport.
 * No external library dependency. Uses a sentinel element for auto-scroll.
 */

import { useRef, useEffect, useCallback, useState } from 'react'
import type { LogMeta, CompiledField } from '../../api/logMeta'
import { LogLine } from './LogLine'

const ROW_HEIGHT = 22
const OVERSCAN = 20

interface VirtualLogListProps {
  lines: string[]
  meta: LogMeta | null
  fields: CompiledField[]
  onFieldClick?: (name: string, value: string) => void
}

export function VirtualLogList({ lines, meta, fields, onFieldClick }: VirtualLogListProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const autoScroll = useRef(true)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewHeight, setViewHeight] = useState(600)

  // Measure container height
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver(([entry]) => setViewHeight(entry.contentRect.height))
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // Auto-scroll on new lines
  useEffect(() => {
    if (autoScroll.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [lines.length])

  const handleScroll = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    setScrollTop(el.scrollTop)
    autoScroll.current = el.scrollHeight - el.scrollTop - el.clientHeight < ROW_HEIGHT * 3
  }, [])

  // Calculate visible range
  const totalHeight = lines.length * ROW_HEIGHT
  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
  const endIdx = Math.min(lines.length, Math.ceil((scrollTop + viewHeight) / ROW_HEIGHT) + OVERSCAN)

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="h-full overflow-auto bg-surface"
    >
      {/* Spacer for total height */}
      <div style={{ height: totalHeight, position: 'relative' }}>
        {/* Only render visible rows */}
        <div style={{ position: 'absolute', top: startIdx * ROW_HEIGHT, left: 0, right: 0 }}>
          {lines.slice(startIdx, endIdx).map((line, i) => (
            <div key={startIdx + i} style={{ height: ROW_HEIGHT, overflow: 'hidden' }}>
              <LogLine
                line={line}
                meta={meta}
                fields={fields}
                onFieldClick={onFieldClick}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * Simple virtualized log list — only renders rows near the viewport.
 * No external library dependency. Shared by all three log viewers so live DOM
 * stays bounded (~50 rows) regardless of how many lines are buffered.
 *
 * Selection: because rows outside the viewport are unmounted, native text
 * selection can't span them. Instead we track a whole-line range by index
 * (click + drag, or shift-click), highlight it from state — so it survives
 * scrolling and re-applies as rows mount — and copy the raw lines straight
 * from the data array (Ctrl/Cmd+C or the floating Copy button).
 */

import { useRef, useEffect, useCallback, useState } from 'react'
import type { LogMeta, CompiledField } from '../../api/logMeta'
import { LogLine } from './LogLine'

const ROW_HEIGHT = 22
const OVERSCAN = 20
const EDGE = 28          // px from top/bottom that triggers auto-scroll while dragging
const EDGE_SPEED = 0.6   // auto-scroll px per px past the edge, per frame

interface VirtualLogListProps {
  lines: string[]
  meta: LogMeta | null
  fields: CompiledField[]
  onFieldClick?: (name: string, value: string) => void
}

interface Selection { anchor: number; focus: number }

export function VirtualLogList({ lines, meta, fields, onFieldClick }: VirtualLogListProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const autoScroll = useRef(true)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewHeight, setViewHeight] = useState(600)
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())

  // ── Range selection ──
  const [selection, setSelection] = useState<Selection | null>(null)
  const [copied, setCopied] = useState(false)
  const dragging = useRef(false)
  const pointerY = useRef(0)
  const rafId = useRef<number | null>(null)
  // Latest lines, read by the (stable-identity) drag handlers so they never
  // close over a stale array — and so window listeners stay removable.
  const linesRef = useRef(lines)
  linesRef.current = lines

  // Measure container height
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver(([entry]) => setViewHeight(entry.contentRect.height))
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // Auto-scroll on new lines (suppressed while the user is selecting)
  useEffect(() => {
    if (autoScroll.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [lines.length])

  // Drop a selection that no longer fits (e.g. lines trimmed by the poll)
  useEffect(() => {
    setSelection((s) => (s && Math.max(s.anchor, s.focus) >= lines.length ? null : s))
  }, [lines.length])

  const handleScroll = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    setScrollTop(el.scrollTop)
    if (!dragging.current) {
      autoScroll.current = el.scrollHeight - el.scrollTop - el.clientHeight < ROW_HEIGHT * 3
    }
  }, [])

  /** Map a viewport Y coordinate to a line index (works even for unmounted rows). */
  const indexFromPointer = useCallback((clientY: number) => {
    const el = containerRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    const y = clientY - rect.top + el.scrollTop
    return Math.max(0, Math.min(linesRef.current.length - 1, Math.floor(y / ROW_HEIGHT)))
  }, [])

  // Stable identities (empty deps) so add/removeEventListener always pair up.
  const onWindowMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging.current) return
    pointerY.current = e.clientY
    setSelection((s) => (s ? { ...s, focus: indexFromPointer(e.clientY) } : s))
  }, [indexFromPointer])

  const stopDrag = useCallback(() => {
    dragging.current = false
    if (rafId.current != null) { cancelAnimationFrame(rafId.current); rafId.current = null }
    window.removeEventListener('mousemove', onWindowMouseMove)
    window.removeEventListener('mouseup', stopDrag)
  }, [onWindowMouseMove])

  // Continuously scroll while the pointer is held near an edge during a drag.
  const autoScrollTick = useCallback(() => {
    const el = containerRef.current
    if (!el || !dragging.current) return
    const rect = el.getBoundingClientRect()
    let delta = 0
    if (pointerY.current < rect.top + EDGE) delta = (pointerY.current - (rect.top + EDGE)) * EDGE_SPEED
    else if (pointerY.current > rect.bottom - EDGE) delta = (pointerY.current - (rect.bottom - EDGE)) * EDGE_SPEED
    if (delta !== 0) {
      el.scrollTop += delta
      setSelection((s) => (s ? { ...s, focus: indexFromPointer(pointerY.current) } : s))
    }
    rafId.current = requestAnimationFrame(autoScrollTick)
  }, [indexFromPointer])

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    // Let clickable bits (field badges, expand caret) handle their own clicks.
    if ((e.target as HTMLElement).closest('.cursor-pointer')) return
    e.preventDefault()
    window.getSelection()?.removeAllRanges()
    autoScroll.current = false  // don't yank to bottom mid-selection
    const idx = indexFromPointer(e.clientY)
    pointerY.current = e.clientY
    setSelection((s) => (e.shiftKey && s ? { anchor: s.anchor, focus: idx } : { anchor: idx, focus: idx }))
    dragging.current = true
    containerRef.current?.focus()
    rafId.current = requestAnimationFrame(autoScrollTick)
    window.addEventListener('mousemove', onWindowMouseMove)
    window.addEventListener('mouseup', stopDrag)
  }, [indexFromPointer, autoScrollTick, onWindowMouseMove, stopDrag])

  // Clean up window listeners / rAF on unmount (stable stopDrag → runs once)
  useEffect(() => stopDrag, [stopDrag])

  const copySelection = useCallback(() => {
    if (!selection) return
    const lo = Math.min(selection.anchor, selection.focus)
    const hi = Math.max(selection.anchor, selection.focus)
    const text = lines.slice(lo, hi + 1).join('\n')
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    }).catch(() => {})
  }, [selection, lines])

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
      if (selection) { e.preventDefault(); copySelection() }
    } else if (e.key === 'Escape') {
      setSelection(null)
    }
  }, [selection, copySelection])

  // Calculate visible range
  const totalHeight = lines.length * ROW_HEIGHT
  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
  const endIdx = Math.min(lines.length, Math.ceil((scrollTop + viewHeight) / ROW_HEIGHT) + OVERSCAN)

  const selLo = selection ? Math.min(selection.anchor, selection.focus) : -1
  const selHi = selection ? Math.max(selection.anchor, selection.focus) : -1
  const selCount = selection ? selHi - selLo + 1 : 0

  return (
    <div className="relative h-full">
      <div
        ref={containerRef}
        tabIndex={0}
        onScroll={handleScroll}
        onMouseDown={onMouseDown}
        onKeyDown={onKeyDown}
        className="h-full overflow-auto bg-surface outline-none"
      >
        {/* Spacer for total height */}
        <div style={{ height: totalHeight, position: 'relative' }}>
          {/* Only render visible rows */}
          <div style={{ position: 'absolute', top: startIdx * ROW_HEIGHT, left: 0, right: 0 }}>
            {lines.slice(startIdx, endIdx).map((line, i) => {
              const idx = startIdx + i
              const isExpanded = expandedRows.has(idx)
              const isSelected = idx >= selLo && idx <= selHi
              return (
                <div
                  key={idx}
                  className={isSelected ? 'bg-sky-500/25' : ''}
                  style={isExpanded ? { minHeight: ROW_HEIGHT } : { height: ROW_HEIGHT, overflow: 'hidden' }}
                >
                  <LogLine
                    line={line}
                    meta={meta}
                    fields={fields}
                    onFieldClick={onFieldClick}
                    onExpandChange={(expanded) => {
                      setExpandedRows((prev) => {
                        const next = new Set(prev)
                        if (expanded) next.add(idx)
                        else next.delete(idx)
                        return next
                      })
                    }}
                  />
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Floating selection actions */}
      {selection && (
        <div className="absolute bottom-2 right-3 flex items-center gap-2 px-2 py-1 rounded-md bg-surface-secondary border border-border shadow-lg text-[11px]">
          <span className="text-gray-400">{selCount} line{selCount === 1 ? '' : 's'}</span>
          <button
            onClick={copySelection}
            className="px-1.5 py-0.5 rounded bg-blue-600 hover:bg-blue-500 text-white"
            title="Copy selected lines (Ctrl/Cmd+C)"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button
            onClick={() => setSelection(null)}
            className="px-1 text-gray-500 hover:text-gray-300"
            title="Clear selection (Esc)"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )
}

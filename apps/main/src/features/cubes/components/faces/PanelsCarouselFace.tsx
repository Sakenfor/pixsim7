/**
 * PanelsCarouselFace
 *
 * Cube face component: arc carousel of minimized floating panels.
 * Reads panel data from CubeIndicatorContext.
 */

import { useState, useCallback, useRef, useEffect } from 'react';

import { Icon } from '@lib/icons';
import { panelSelectors } from '@lib/plugins/catalogSelectors';

import { getFloatingDefinitionId } from '@features/workspace/lib/floatingPanelUtils';

import type { CubeFaceComponentProps } from '../../lib/cubeFaceRegistry';
import type { ControlCube } from '../../useCubeStore';
import { useCubeIndicator } from '../CubeIndicatorContext';

// ── Helpers ──

function getPanelMeta(panelId: string) {
  const defId = getFloatingDefinitionId(panelId);
  const def = panelSelectors.get(defId);
  return { title: def?.title ?? defId, icon: def?.icon ?? 'layoutGrid' };
}

// ── Constants ──

const ITEM_SIZE = 44;
const ARC_RADIUS = 110;
const ARC_SPAN = (160 * Math.PI) / 180;
const MAX_VISIBLE = 7;
const DRAG_OUT_THRESHOLD = 60;

function arcPos(angle: number) {
  return { x: Math.sin(angle) * ARC_RADIUS, y: -Math.cos(angle) * ARC_RADIUS };
}

// ── Face entry point ──

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function PanelsCarouselFace(props: CubeFaceComponentProps) {
  const { panelCubes, onRestore, onRestoreAll, onClearAll } = useCubeIndicator();
  return (
    <PanelsCarousel
      panelCubes={panelCubes}
      onRestore={onRestore}
      onRestoreAll={onRestoreAll}
      onClearAll={onClearAll}
    />
  );
}

// ── Carousel ──

function PanelsCarousel({ panelCubes, onRestore, onRestoreAll, onClearAll }: {
  panelCubes: ControlCube[]; onRestore: (id: string) => void; onRestoreAll: () => void; onClearAll: () => void;
}) {
  const count = panelCubes.length;
  const [focusIndex, setFocusIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const countRef = useRef(count);
  countRef.current = count;

  useEffect(() => {
    if (focusIndex >= count) setFocusIndex(Math.max(0, count - 1));
  }, [count, focusIndex]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const c = countRef.current;
      setFocusIndex((prev) => {
        if (e.deltaY > 0 || e.deltaX > 0) return Math.min(prev + 1, c - 1);
        if (e.deltaY < 0 || e.deltaX < 0) return Math.max(prev - 1, 0);
        return prev;
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const focusedMeta = panelCubes[focusIndex]?.minimizedPanel
    ? getPanelMeta(panelCubes[focusIndex].minimizedPanel!.panelId) : null;

  const sideCount = Math.floor(MAX_VISIBLE / 2);
  const angleStep = count > 1 ? ARC_SPAN / Math.min(MAX_VISIBLE - 1, count - 1) : 0;
  const containerW = ARC_RADIUS * 2 + ITEM_SIZE + 20;
  const containerH = ARC_RADIUS + ITEM_SIZE / 2 + 4;
  const cx = containerW / 2;
  const cy = containerH;

  return (
    <div ref={containerRef} className="flex flex-col items-center">
      <div className="text-[11px] text-neutral-300 font-medium truncate max-w-[220px] text-center px-2 mb-2">
        {focusedMeta?.title ?? panelCubes[focusIndex]?.id ?? ''}
      </div>
      <div className="relative" style={{ width: containerW, height: containerH }}>
        {panelCubes.map((cube, i) => {
          const offset = i - focusIndex;
          if (Math.abs(offset) > sideCount) return null;
          const meta = cube.minimizedPanel ? getPanelMeta(cube.minimizedPanel.panelId) : null;
          const isFocused = offset === 0;
          const absOffset = Math.abs(offset);
          const angle = offset * angleStep;
          const { x, y } = arcPos(angle);
          const t = absOffset / Math.max(sideCount, 1);
          const scale = isFocused ? 1 : Math.max(0.65, 1 - t * 0.3);
          const opacity = isFocused ? 1 : Math.max(0.25, 1 - t * 0.55);

          return (
            <CarouselItem key={cube.id} cubeId={cube.id} icon={meta?.icon ?? 'layoutGrid'}
              title={meta?.title ?? cube.id} isFocused={isFocused}
              style={{
                position: 'absolute', left: cx + x - ITEM_SIZE / 2, top: cy + y - ITEM_SIZE / 2,
                width: ITEM_SIZE, height: ITEM_SIZE, transform: `scale(${scale})`,
                opacity, zIndex: isFocused ? 10 : 10 - absOffset, transition: 'all 250ms ease-out',
              }}
              onRestore={onRestore} onFocus={() => setFocusIndex(i)} />
          );
        })}
        {count > 1 && panelCubes.map((_, i) => {
          const offset = i - focusIndex;
          if (Math.abs(offset) > sideCount + 1) return null;
          const angle = offset * angleStep;
          const dotR = ARC_RADIUS + ITEM_SIZE / 2 + 8;
          const dx = Math.sin(angle) * dotR;
          const dy = -Math.cos(angle) * dotR;
          const dotOpacity = i === focusIndex ? 1 : Math.max(0.2, 1 - (Math.abs(offset) / Math.max(sideCount + 1, 1)) * 0.6);
          return (
            <button key={`dot-${i}`} type="button" onClick={() => setFocusIndex(i)}
              className={`absolute w-2 h-2 rounded-full transition-all ${i === focusIndex ? 'bg-cyan-400 scale-125' : 'bg-neutral-600 hover:bg-neutral-500'}`}
              style={{ left: cx + dx - 4, top: cy + dy - 4, opacity: dotOpacity, transition: 'all 250ms ease-out' }} />
          );
        })}
      </div>
      {count > 0 && (
        <div className="flex items-center gap-1.5 mt-1">
          {count > 1 && (
            <button type="button" onClick={(e) => { e.stopPropagation(); onRestoreAll(); }} title="Restore all panels"
              className="w-6 h-6 flex items-center justify-center rounded-md text-cyan-400 hover:text-cyan-300 hover:bg-cyan-400/10 transition-colors">
              <Icon name="maximize2" size={12} />
            </button>
          )}
          <button type="button" onClick={(e) => { e.stopPropagation(); onClearAll(); }} title="Dismiss all"
            className="w-6 h-6 flex items-center justify-center rounded-md text-neutral-500 hover:text-red-400 hover:bg-red-400/10 transition-colors">
            <Icon name="trash2" size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Carousel Item ──

function CarouselItem({ cubeId, icon, title, isFocused, style, onRestore, onFocus }: {
  cubeId: string; icon: string; title: string; isFocused: boolean;
  style: React.CSSProperties; onRestore: (id: string) => void; onFocus: () => void;
}) {
  const [dragDelta, setDragDelta] = useState<{ x: number; y: number } | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const isDraggingOut = dragDelta != null && Math.sqrt(dragDelta.x ** 2 + dragDelta.y ** 2) > DRAG_OUT_THRESHOLD;

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    dragStart.current = { x: e.clientX, y: e.clientY };
    const handleMove = (me: MouseEvent) => {
      if (!dragStart.current) return;
      setDragDelta({ x: me.clientX - dragStart.current.x, y: me.clientY - dragStart.current.y });
    };
    const handleUp = (me: MouseEvent) => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      if (!dragStart.current) return;
      const dist = Math.sqrt((me.clientX - dragStart.current.x) ** 2 + (me.clientY - dragStart.current.y) ** 2);
      dragStart.current = null;
      setDragDelta(null);
      if (dist > DRAG_OUT_THRESHOLD) onRestore(cubeId);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  }, [cubeId, onRestore]);

  const itemStyle: React.CSSProperties = { ...style };
  if (dragDelta) {
    itemStyle.transform = `${style.transform ?? ''} translate(${dragDelta.x}px, ${dragDelta.y}px)`;
    itemStyle.transition = 'none';
  }

  return (
    <button type="button" style={itemStyle}
      onClick={(e) => { e.stopPropagation(); if (isFocused) { onRestore(cubeId); } else { onFocus(); } }}
      onMouseDown={handleMouseDown}
      className={`flex items-center justify-center rounded-xl backdrop-blur-md border shadow-lg cursor-grab transition-colors duration-150
        ${isFocused ? 'bg-neutral-800/95 border-cyan-400/60 shadow-cyan-500/20' : 'bg-neutral-800/80 border-neutral-600/40 hover:border-neutral-500/60'}
        ${isDraggingOut ? 'ring-2 ring-red-400/60' : ''}`}
      title={isFocused ? `Click to restore "${title}"` : title}>
      <Icon name={icon} size={isFocused ? 20 : 16}
        className={`transition-colors ${isFocused ? 'text-cyan-400' : 'text-neutral-400'}`} />
    </button>
  );
}

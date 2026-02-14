/**
 * Shared hook for HTML5 drag-and-drop list reordering.
 *
 * Handles state, dataTransfer, and event wiring. Consumers provide
 * the reorder callback and optional cross-list serialization.
 *
 * Usage:
 *   const { draggedIndex, dragOverIndex, getDragItemProps, getDropTargetProps } =
 *     useDragReorder({ onReorder });
 *
 *   // Draggable + droppable items:
 *   <div {...getDragItemProps(idx)} />
 *
 *   // Drop-only targets (empty slots, end zones):
 *   <div {...getDropTargetProps(idx)} />
 */
import { useState, useCallback, useRef, useId } from 'react';

const MIME_TYPE = 'application/x-drag-reorder+json';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseDragReorderOptions<T = unknown> {
  /** Called when an item is reordered within the same list. */
  onReorder: (fromIndex: number, toIndex: number) => void;
  /** Serialize payload to attach for cross-list transfers. */
  serialize?: (index: number) => T;
  /** Handle a drop originating from a different useDragReorder instance. */
  onExternalDrop?: (data: T, targetIndex: number) => void;
}

export interface DragItemProps {
  draggable: true;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
}

export interface DropTargetProps {
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
}

export interface UseDragReorderResult {
  /** Index of the item currently being dragged, or null. */
  draggedIndex: number | null;
  /** Index of the current drop target, or null. */
  dragOverIndex: number | null;
  /** Props to spread onto items that are both draggable and droppable. */
  getDragItemProps: (index: number) => DragItemProps;
  /** Props to spread onto drop-only targets (empty slots, end zones). */
  getDropTargetProps: (index: number) => DropTargetProps;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useDragReorder<T = unknown>(
  options: UseDragReorderOptions<T>,
): UseDragReorderResult {
  // Ref to always read the latest callbacks without re-creating handlers.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const instanceId = useId();
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Ref mirrors draggedIndex so handlers avoid stale closures.
  const draggedRef = useRef<number | null>(null);

  // -- Handlers (stable – no dependency on option values) -------------------

  const handleDragStart = useCallback(
    (e: React.DragEvent, index: number) => {
      draggedRef.current = index;
      setDraggedIndex(index);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(index));

      const { serialize } = optionsRef.current;
      if (serialize) {
        const payload = JSON.stringify({ __iid: instanceId, d: serialize(index) });
        e.dataTransfer.setData(MIME_TYPE, payload);
      }

      // Delay so the browser captures the drag image before we fade.
      setTimeout(() => {
        (e.target as HTMLElement).style.opacity = '0.4';
      }, 0);
    },
    [instanceId],
  );

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    (e.target as HTMLElement).style.opacity = '1';
    draggedRef.current = null;
    setDraggedIndex(null);
    setDragOverIndex(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedRef.current !== index) {
      setDragOverIndex(index);
    }
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverIndex(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, targetIndex: number) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOverIndex(null);

      // Check for cross-list drop.
      const { onExternalDrop } = optionsRef.current;
      try {
        const raw = e.dataTransfer.getData(MIME_TYPE);
        if (raw) {
          const payload = JSON.parse(raw);
          if (payload.__iid !== instanceId) {
            onExternalDrop?.(payload.d as T, targetIndex);
            draggedRef.current = null;
            setDraggedIndex(null);
            return;
          }
        }
      } catch {
        // Not a valid drag-reorder payload — fall through.
      }

      // Internal reorder.
      const from = draggedRef.current;
      if (from !== null && from !== targetIndex) {
        optionsRef.current.onReorder(from, targetIndex);
      }
      draggedRef.current = null;
      setDraggedIndex(null);
    },
    [instanceId],
  );

  // -- Prop spreaders -------------------------------------------------------

  const getDragItemProps = useCallback(
    (index: number): DragItemProps => ({
      draggable: true,
      onDragStart: (e: React.DragEvent) => handleDragStart(e, index),
      onDragEnd: handleDragEnd,
      onDragOver: (e: React.DragEvent) => handleDragOver(e, index),
      onDragLeave: handleDragLeave,
      onDrop: (e: React.DragEvent) => handleDrop(e, index),
    }),
    [handleDragStart, handleDragEnd, handleDragOver, handleDragLeave, handleDrop],
  );

  const getDropTargetProps = useCallback(
    (index: number): DropTargetProps => ({
      onDragOver: (e: React.DragEvent) => handleDragOver(e, index),
      onDragLeave: handleDragLeave,
      onDrop: (e: React.DragEvent) => handleDrop(e, index),
    }),
    [handleDragOver, handleDragLeave, handleDrop],
  );

  return { draggedIndex, dragOverIndex, getDragItemProps, getDropTargetProps };
}

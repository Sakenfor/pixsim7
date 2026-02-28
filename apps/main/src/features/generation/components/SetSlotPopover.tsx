/**
 * SetSlotPopover – Portal-based popover for linking/unlinking an asset set
 * to a generation slot and toggling pick timing (random_each / locked).
 */
import { useEffect, useRef, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { Icon } from '@lib/icons';

import { resolveAssetSet } from '@features/assets/lib/assetSetResolver';
import { useAssetSetStore, type AssetSet } from '@features/assets/stores/assetSetStore';
import type { AssetSetSlotRef, InputItem } from '@features/generation';

import type { OperationType } from '@/types/operations';

export interface SetSlotPopoverProps {
  anchorRect: DOMRect;
  inputItem: InputItem;
  operationType: OperationType;
  onSetLink: (operationType: OperationType, inputId: string, setId: string) => void;
  onSetUnlink: (operationType: OperationType, inputId: string) => void;
  onSetModeChange: (operationType: OperationType, inputId: string, mode: AssetSetSlotRef['mode']) => void;
  onReroll: (operationType: OperationType, inputId: string) => void;
  onClose: () => void;
}

export function SetSlotPopover({
  anchorRect,
  inputItem,
  operationType,
  onSetLink,
  onSetUnlink,
  onSetModeChange,
  onReroll,
  onClose,
}: SetSlotPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const sets = useAssetSetStore((s) => s.sets);
  const currentRef = inputItem.assetSetRef;
  const currentSet = currentRef
    ? sets.find((s) => s.id === currentRef.setId)
    : undefined;

  // Resolve asset count for display
  const [setAssetCounts, setSetAssetCounts] = useState<Map<string, number>>(() => new Map());
  useEffect(() => {
    let cancelled = false;
    const resolveCounts = async () => {
      const counts = new Map<string, number>();
      for (const set of sets) {
        if (set.kind === 'manual') {
          counts.set(set.id, set.assetIds.length);
        } else {
          try {
            const resolved = await resolveAssetSet(set);
            if (!cancelled) counts.set(set.id, resolved.length);
          } catch {
            counts.set(set.id, 0);
          }
        }
      }
      if (!cancelled) setSetAssetCounts(counts);
    };
    void resolveCounts();
    return () => { cancelled = true; };
  }, [sets]);

  // Position relative to anchor
  useLayoutEffect(() => {
    const popoverWidth = 220;
    let top = anchorRect.bottom + 6;
    let left = anchorRect.left;

    // Ensure within viewport
    if (left + popoverWidth > window.innerWidth - 8) {
      left = window.innerWidth - popoverWidth - 8;
    }
    if (left < 8) left = 8;
    if (top + 300 > window.innerHeight) {
      top = anchorRect.top - 300 - 6;
    }

    setPosition({ top: Math.max(8, top), left });
  }, [anchorRect]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!position) return null;

  const renderSetColor = (set: AssetSet) => {
    const color = set.color || '#8b5cf6';
    return (
      <span
        className="inline-block w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: color }}
      />
    );
  };

  const content = (
    <div
      ref={popoverRef}
      className="fixed w-[220px] bg-white dark:bg-neutral-900 rounded-xl shadow-xl border border-neutral-200 dark:border-neutral-700 overflow-hidden z-popover"
      style={{ top: position.top, left: position.left }}
    >
      {/* Header */}
      <div className="px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700">
        <h3 className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-200">
          {currentSet ? currentSet.name : 'Link Asset Set'}
        </h3>
      </div>

      <div className="p-2 space-y-1 max-h-[260px] overflow-y-auto">
        {/* Mode toggle (when linked) */}
        {currentRef && currentSet && (
          <div className="px-2 py-1.5 space-y-2 border-b border-neutral-100 dark:border-neutral-800 mb-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${
                  currentRef.mode === 'random_each'
                    ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300'
                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                }`}
                onClick={() => onSetModeChange(operationType, inputItem.id, 'random_each')}
              >
                <Icon name="shuffle" size={12} />
                Random
              </button>
              <button
                type="button"
                className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${
                  currentRef.mode === 'locked'
                    ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300'
                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                }`}
                onClick={() => onSetModeChange(operationType, inputItem.id, 'locked')}
              >
                <Icon name="lock" size={12} />
                Locked
              </button>
            </div>
            {currentRef.mode === 'locked' && (
              <button
                type="button"
                className="w-full flex items-center justify-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                onClick={() => onReroll(operationType, inputItem.id)}
              >
                <Icon name="shuffle" size={12} />
                Re-roll pick
              </button>
            )}
            <button
              type="button"
              className="w-full flex items-center justify-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              onClick={() => onSetUnlink(operationType, inputItem.id)}
            >
              Unlink set
            </button>
          </div>
        )}

        {/* Set list */}
        {sets.length === 0 ? (
          <div className="px-2 py-3 text-center text-[10px] text-neutral-400">
            No asset sets created yet
          </div>
        ) : (
          sets.map((set) => {
            const isLinked = currentRef?.setId === set.id;
            const count = setAssetCounts.get(set.id);
            return (
              <button
                key={set.id}
                type="button"
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-[11px] transition-colors ${
                  isLinked
                    ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                    : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                }`}
                onClick={() => {
                  if (!isLinked) {
                    onSetLink(operationType, inputItem.id, set.id);
                  }
                }}
              >
                {renderSetColor(set)}
                <span className="flex-1 truncate">{set.name}</span>
                {count !== undefined && (
                  <span className="text-[9px] text-neutral-400 flex-shrink-0">
                    {count}
                  </span>
                )}
                {isLinked && (
                  <Icon name="check" size={12} className="text-purple-600 dark:text-purple-400 flex-shrink-0" />
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

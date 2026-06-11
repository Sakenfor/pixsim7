/**
 * SetSlotPopover – Portal-based popover for linking/unlinking an asset set
 * to a generation slot and toggling pick timing (random_each / locked).
 */
import { Popover } from '@pixsim7/shared.ui';
import { useEffect, useState } from 'react';

import { Icon } from '@lib/icons';

import { resolveAssetSet } from '@features/assets/lib/assetSetResolver';
import { useAssetSets, type AssetSet } from '@features/assets/stores/assetSetStore';
import type { AssetSetSlotRef, InputItem, PickStrategy } from '@features/generation';

import type { OperationType } from '@/types/operations';

export interface SetSlotPopoverProps {
  anchorRect: DOMRect;
  inputItem: InputItem;
  operationType: OperationType;
  onSetLink: (operationType: OperationType, inputId: string, setId: number) => void;
  onSetUnlink: (operationType: OperationType, inputId: string) => void;
  onSetModeChange: (operationType: OperationType, inputId: string, mode: AssetSetSlotRef['mode']) => void;
  onPickStrategyChange: (operationType: OperationType, inputId: string, strategy: PickStrategy) => void;
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
  onPickStrategyChange,
  onReroll,
  onClose,
}: SetSlotPopoverProps) {
  const { sets } = useAssetSets();
  const currentRef = inputItem.assetSetRef;
  const currentSet = currentRef
    ? sets.find((s) => s.id === currentRef.setId)
    : undefined;

  // Resolve asset count for display
  const [setAssetCounts, setSetAssetCounts] = useState<Map<number, number>>(() => new Map());
  useEffect(() => {
    let cancelled = false;
    const resolveCounts = async () => {
      const counts = new Map<number, number>();
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

  const renderSetColor = (set: AssetSet) => {
    const color = set.color || '#8b5cf6';
    return (
      <span
        className="inline-block w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: color }}
      />
    );
  };

  return (
    <Popover
      anchor={anchorRect}
      placement="bottom"
      align="start"
      offset={6}
      open
      onClose={onClose}
    >
      <div className="w-[220px] bg-white dark:bg-neutral-900 rounded-xl shadow-xl border border-neutral-200 dark:border-neutral-700 overflow-hidden">
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
            <div className="flex items-center gap-1">
              {([
                { key: 'random_each' as const, label: 'Random', icon: 'shuffle' as const, hint: 'Pick once per run' },
                { key: 'iterate' as const, label: 'Iterate', icon: 'list' as const, hint: 'Drive iteration — exhaust the set' },
                { key: 'locked' as const, label: 'Locked', icon: 'lock' as const, hint: 'Pin a single pick' },
              ]).map(({ key, label, icon, hint }) => {
                const active = currentRef.mode === key;
                return (
                  <button
                    key={key}
                    type="button"
                    title={hint}
                    className={`flex-1 flex items-center justify-center gap-1 px-1.5 py-1 rounded-md text-[10px] font-medium transition-colors ${
                      active
                        ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300'
                        : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                    }`}
                    onClick={() => onSetModeChange(operationType, inputItem.id, key)}
                  >
                    <Icon name={icon} size={12} />
                    {label}
                  </button>
                );
              })}
            </div>
            {currentRef.mode === 'random_each' && (
              <div className="flex items-center gap-1">
                {([
                  { key: 'random' as const, label: 'Random' },
                  { key: 'sequential' as const, label: 'Seq' },
                  { key: 'no_repeat' as const, label: 'No Rep' },
                ] as const).map(({ key, label }) => {
                  const active = (currentRef.pickStrategy ?? 'random') === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`flex-1 px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors ${
                        active
                          ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300'
                          : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                      }`}
                      onClick={() => onPickStrategyChange(operationType, inputItem.id, key)}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}
            {currentRef.mode === 'iterate' && (
              <div className="flex items-center gap-1">
                {([
                  { key: 'sequential' as const, label: 'In order' },
                  { key: 'random' as const, label: 'Shuffled' },
                ] as const).map(({ key, label }) => {
                  const active = (currentRef.pickStrategy ?? 'sequential') === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      title={key === 'sequential' ? 'Iterate set in stored order' : 'Iterate set in shuffled order (uses fanout seed)'}
                      className={`flex-1 px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors ${
                        active
                          ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300'
                          : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                      }`}
                      onClick={() => onPickStrategyChange(operationType, inputItem.id, key)}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}
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
    </Popover>
  );
}

import { Dropdown, DropdownItem } from '@pixsim7/shared.ui';
import clsx from 'clsx';
import { useState, useRef } from 'react';

import { Icon } from '@lib/icons';

import { useAssetSetStore } from '@features/assets/stores/assetSetStore';
import { usePersistedScopeState } from '@features/generation';
import { openWorkspacePanel } from '@features/workspace';

import {
  EACH_STRATEGIES,
  SET_STRATEGIES,
  isSetStrategy,
  type CombinationStrategy,
} from '../../lib/combinationStrategies';

/** Split-button for "Each" with strategy dropdown. */
export function EachSplitButton({
  onGenerateEach,
  disabled,
  generating,
  queueProgress,
}: {
  onGenerateEach: (strategy?: CombinationStrategy, setId?: string) => void;
  disabled: boolean;
  generating: boolean;
  queueProgress?: { queued: number; total: number } | null;
}) {
  const [selectedStrategy, setSelectedStrategy] = usePersistedScopeState<CombinationStrategy>('eachStrategy', 'each');
  const [selectedSetId, setSelectedSetId] = usePersistedScopeState<string | null>('eachSetId', null);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [anchorPos, setAnchorPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const sets = useAssetSetStore(s => s.sets);

  const current =
    EACH_STRATEGIES.find(s => s.id === selectedStrategy) ??
    SET_STRATEGIES.find(s => s.id === selectedStrategy) ??
    EACH_STRATEGIES[0];
  const showProgress = generating && queueProgress;
  const needsSet = isSetStrategy(selectedStrategy);
  const canRun = !needsSet || !!selectedSetId;

  const handleToggle = () => {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setAnchorPos({ x: rect.right, y: rect.top });
    }
    setOpen(o => !o);
  };

  const totalItems = EACH_STRATEGIES.length + SET_STRATEGIES.length + 1; // +1 for divider

  return (
    <div className="relative flex-shrink-0">
      <div className="flex">
        {/* Main area — run with selected strategy */}
        <button
          onClick={() => canRun && onGenerateEach(selectedStrategy, selectedSetId ?? undefined)}
          disabled={disabled || !canRun}
          className={clsx(
            'px-2 py-1.5 rounded-l-lg text-[11px] font-semibold text-white',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            disabled || !canRun
              ? 'bg-neutral-400'
              : needsSet
                ? 'bg-gradient-to-r from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600'
                : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600'
          )}
          style={{ transition: 'none', animation: 'none' }}
          title={current.description}
        >
          {showProgress ? `${queueProgress.queued}/${queueProgress.total}` : current.shortLabel}
        </button>
        {/* Right column: arrow + sets shortcut */}
        <div className="flex flex-col">
          {/* Arrow area — open strategy picker */}
          <button
            ref={triggerRef}
            onClick={handleToggle}
            disabled={disabled}
            className={clsx(
              'px-1 py-1 rounded-tr-lg text-[11px] font-semibold text-white border-l border-white/20',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              disabled
                ? 'bg-neutral-400'
                : needsSet
                  ? 'bg-gradient-to-r from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600'
                  : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600'
            )}
            style={{ transition: 'none', animation: 'none' }}
            title="Select combination strategy"
          >
            <Icon name="chevronDown" size={10} className={clsx(open && 'rotate-180')} />
          </button>
          {/* Open Asset Sets panel */}
          <button
            onClick={() => {
              openWorkspacePanel('asset-sets');
            }}
            className={clsx(
              'px-1 py-0.5 rounded-br-lg text-white/70 hover:text-white border-l border-t border-white/20',
              disabled
                ? 'bg-neutral-400'
                : needsSet
                  ? 'bg-gradient-to-r from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600'
                  : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600'
            )}
            style={{ transition: 'none', animation: 'none' }}
            title="Manage asset sets"
          >
            <Icon name="layers" size={8} />
          </button>
        </div>
      </div>

      <Dropdown
        isOpen={open}
        onClose={() => setOpen(false)}
        portal
        positionMode="fixed"
        anchorPosition={{ x: anchorPos.x - 180, y: anchorPos.y - (totalItems * 40 + 24) }}
        minWidth="180px"
        triggerRef={triggerRef}
        className="!p-0"
      >
        {/* Input strategies section */}
        <div className="px-2 pt-1.5 pb-0.5 text-[9px] font-semibold text-neutral-400 uppercase tracking-wider">Input</div>
        {EACH_STRATEGIES.map(s => (
          <DropdownItem
            key={s.id}
            onClick={() => { setSelectedStrategy(s.id); setSelectedSetId(null); setOpen(false); }}
            className={clsx(selectedStrategy === s.id && 'font-semibold')}
            icon={
              <span className={clsx(
                'w-2 h-2 rounded-full shrink-0',
                selectedStrategy === s.id ? 'bg-amber-500' : 'bg-neutral-300 dark:bg-neutral-600'
              )} />
            }
          >
            <div className="flex flex-col items-start">
              <span>{s.label}</span>
              <span className="text-[9px] text-neutral-400">{s.description}</span>
            </div>
          </DropdownItem>
        ))}

        {/* Divider + set strategies section */}
        <div className="my-1 border-t border-neutral-200 dark:border-neutral-700" />
        <div className="px-2 pt-0.5 pb-0.5 text-[9px] font-semibold text-neutral-400 uppercase tracking-wider">Asset Set</div>
        {SET_STRATEGIES.map(s => (
          <DropdownItem
            key={s.id}
            onClick={() => { setSelectedStrategy(s.id); setOpen(false); }}
            className={clsx(selectedStrategy === s.id && 'font-semibold')}
            icon={
              <span className={clsx(
                'w-2 h-2 rounded-full shrink-0',
                selectedStrategy === s.id ? 'bg-violet-500' : 'bg-neutral-300 dark:bg-neutral-600'
              )} />
            }
          >
            <div className="flex flex-col items-start">
              <span>{s.label}</span>
              <span className="text-[9px] text-neutral-400">{s.description}</span>
            </div>
          </DropdownItem>
        ))}
      </Dropdown>

      {/* Inline set picker when a set strategy is selected */}
      {needsSet && (
        <select
          value={selectedSetId ?? ''}
          onChange={(e) => setSelectedSetId(e.target.value || null)}
          className="mt-1 w-full px-1.5 py-1 text-[10px] rounded-md bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200"
          title="Select asset set"
        >
          <option value="">Pick a set…</option>
          {sets.map(s => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.kind === 'manual' ? `${s.assetIds.length} assets` : 'smart'})
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

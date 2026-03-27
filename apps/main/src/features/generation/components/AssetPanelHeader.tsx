/**
 * AssetPanelHeader – Header bar with history, recent-gens, and settings buttons.
 * Owns floating panel toggles and settings popover local state.
 */
import { Popover } from '@pixsim7/shared.ui';
import { useRef, useEffect, useState, useCallback } from 'react';

import { Icon } from '@lib/icons';

import { useWorkspaceStore } from '@features/workspace';

import type { OperationType } from '@/types/operations';

import { usePersistedScopeState } from '../hooks/usePersistedScopeState';
import { useRecentGenerations } from '../hooks/useRecentGenerations';
import { useGenerationsStore } from '../stores/generationsStore';

import type { AssetPanelState } from './useAssetPanelState';

export interface AssetPanelHeaderProps {
  operationType: OperationType;
  scopeInstanceId: string | undefined;
  instanceId: string;
  sourceLabel: string | undefined;

  sortedHistory: AssetPanelState['sortedHistory'];
  compatibleHistory: AssetPanelState['compatibleHistory'];

  resolvedDisplayMode: string;
  resolvedGridColumns: number;
  operationInputsLength: number;

  assetInstanceOverrides: AssetPanelState['assetInstanceOverrides'];
  assetHasInstanceOverrides: boolean;
  globalDisplayMode: string;
  globalGridColumns: number;
  handleComponentSetting: (fieldId: string, value: string | number | undefined) => void;
  handleClearInstanceOverrides: () => void;
}

export function AssetPanelHeader({
  operationType,
  scopeInstanceId,
  instanceId,
  sourceLabel,
  sortedHistory,
  compatibleHistory,
  resolvedDisplayMode,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  resolvedGridColumns,
  operationInputsLength,
  assetInstanceOverrides,
  assetHasInstanceOverrides,
  globalDisplayMode,
  globalGridColumns,
  handleComponentSetting,
  handleClearInstanceOverrides,
}: AssetPanelHeaderProps) {
  // ── Workspace store selectors ──────────────────────────────────────
  const openFloatingPanel = useWorkspaceStore((s) => s.openFloatingPanel);
  const closeFloatingPanel = useWorkspaceStore((s) => s.closeFloatingPanel);
  const updateFloatingPanelContext = useWorkspaceStore((s) => s.updateFloatingPanelContext);
  const isHistoryPanelOpen = useWorkspaceStore((s) =>
    s.floatingPanels.some((panel) => panel.id === 'quickgen-history'),
  );
  const isRecentGensPanelOpen = useWorkspaceStore((s) =>
    s.floatingPanels.some((panel) => panel.id === 'recent-generations'),
  );

  // ── Recent generations ─────────────────────────────────────────────
  useRecentGenerations({ fetchOnMount: true });
  const completedGenerationCount = useGenerationsStore((s) => {
    let count = 0;
    for (const gen of s.generations.values()) {
      if (gen.status === 'completed' && gen.assetId != null) count++;
    }
    return count;
  });

  // ── Trigger refs & opener tracking ─────────────────────────────────
  const historyTriggerRef = useRef<HTMLButtonElement>(null);
  const isHistoryOpenerRef = useRef(false);
  const recentGensTriggerRef = useRef<HTMLButtonElement>(null);
  const isRecentGensOpenerRef = useRef(false);
  const settingsTriggerRef = useRef<HTMLButtonElement>(null);

  // ── Settings popover state ─────────────────────────────────────────
  const [showSettingsPopover, setShowSettingsPopover] = useState(false);
  const [perProviderInputs, setPerProviderInputs] = usePersistedScopeState('perProviderInputs', false, { stable: true });

  // ── History panel toggle ───────────────────────────────────────────
  useEffect(() => {
    if (!isHistoryPanelOpen) {
      isHistoryOpenerRef.current = false;
    }
  }, [isHistoryPanelOpen]);

  const handleToggleHistory = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isHistoryPanelOpen) {
        closeFloatingPanel('quickgen-history');
        isHistoryOpenerRef.current = false;
        return;
      }

      const panelWidth = 360;
      const panelHeight = 320;
      let x: number | undefined;
      let y: number | undefined;

      if (historyTriggerRef.current) {
        const rect = historyTriggerRef.current.getBoundingClientRect();
        const minX = 8;
        const maxX = window.innerWidth - panelWidth - 8;
        x = Math.max(minX, Math.min(maxX, rect.left + rect.width / 2 - panelWidth / 2));

        const showAbove =
          rect.top > window.innerHeight - rect.bottom && rect.top > panelHeight + 8;
        const desiredY = showAbove ? rect.top - panelHeight - 8 : rect.bottom + 8;
        const minY = 8;
        const maxY = window.innerHeight - panelHeight - 8;
        y = Math.max(minY, Math.min(maxY, desiredY));
      }

      const resolvedSourceLabel = sourceLabel || scopeInstanceId || instanceId || 'History';
      isHistoryOpenerRef.current = true;
      openFloatingPanel('quickgen-history', {
        x,
        y,
        width: panelWidth,
        height: panelHeight,
        context: scopeInstanceId
          ? { operationType, generationScopeId: scopeInstanceId, sourceLabel: resolvedSourceLabel }
          : { operationType, sourceLabel: resolvedSourceLabel },
      });
    },
    [isHistoryPanelOpen, closeFloatingPanel, openFloatingPanel, operationType, scopeInstanceId, instanceId],
  );

  useEffect(() => {
    if (!isHistoryPanelOpen || !isHistoryOpenerRef.current) return;
    const resolvedSourceLabel = sourceLabel || scopeInstanceId || instanceId || 'History';
    updateFloatingPanelContext(
      'quickgen-history',
      scopeInstanceId
        ? { operationType, generationScopeId: scopeInstanceId, sourceLabel: resolvedSourceLabel }
        : { operationType, sourceLabel: resolvedSourceLabel },
    );
  }, [isHistoryPanelOpen, operationType, scopeInstanceId, instanceId, sourceLabel, updateFloatingPanelContext]);

  // ── Recent generations panel toggle ────────────────────────────────
  useEffect(() => {
    if (!isRecentGensPanelOpen) {
      isRecentGensOpenerRef.current = false;
    }
  }, [isRecentGensPanelOpen]);

  const handleToggleRecentGenerations = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isRecentGensPanelOpen) {
        closeFloatingPanel('recent-generations');
        isRecentGensOpenerRef.current = false;
        return;
      }

      const panelWidth = 360;
      const panelHeight = 320;
      let x: number | undefined;
      let y: number | undefined;

      if (recentGensTriggerRef.current) {
        const rect = recentGensTriggerRef.current.getBoundingClientRect();
        const minX = 8;
        const maxX = window.innerWidth - panelWidth - 8;
        x = Math.max(minX, Math.min(maxX, rect.left + rect.width / 2 - panelWidth / 2));

        const showAbove =
          rect.top > window.innerHeight - rect.bottom && rect.top > panelHeight + 8;
        const desiredY = showAbove ? rect.top - panelHeight - 8 : rect.bottom + 8;
        const minY = 8;
        const maxY = window.innerHeight - panelHeight - 8;
        y = Math.max(minY, Math.min(maxY, desiredY));
      }

      const resolvedSourceLabel = sourceLabel || scopeInstanceId || instanceId || 'Recent';
      isRecentGensOpenerRef.current = true;
      openFloatingPanel('recent-generations', {
        x,
        y,
        width: panelWidth,
        height: panelHeight,
        context: scopeInstanceId
          ? { operationType, generationScopeId: scopeInstanceId, sourceLabel: resolvedSourceLabel }
          : { operationType, sourceLabel: resolvedSourceLabel },
      });
    },
    [isRecentGensPanelOpen, closeFloatingPanel, openFloatingPanel, operationType, scopeInstanceId, instanceId],
  );

  useEffect(() => {
    if (!isRecentGensPanelOpen || !isRecentGensOpenerRef.current) return;
    const resolvedSourceLabel = sourceLabel || scopeInstanceId || instanceId || 'Recent';
    updateFloatingPanelContext(
      'recent-generations',
      scopeInstanceId
        ? { operationType, generationScopeId: scopeInstanceId, sourceLabel: resolvedSourceLabel }
        : { operationType, sourceLabel: resolvedSourceLabel },
    );
  }, [isRecentGensPanelOpen, operationType, scopeInstanceId, instanceId, sourceLabel, updateFloatingPanelContext]);

  // (anchor rect sync removed — Popover handles positioning via ref)

  // ── Derived values ─────────────────────────────────────────────────
  const hasHistory = compatibleHistory.length > 0;
  const hasPinnedAssets = compatibleHistory.some(e => e.pinned);
  const hasCompletedGenerations = completedGenerationCount > 0;

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <>
      <div className="relative flex items-center justify-end gap-1 px-2 py-1 shrink-0">
        <div className="flex items-center gap-1">
          {resolvedDisplayMode === 'carousel' && operationInputsLength > 0 && (
            <div
              className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-accent/20 text-accent"
              title="Carousel mode: adding an asset replaces the currently viewed one"
            >
              <Icon name="refresh-cw" size={9} />
              <span>Replace</span>
            </div>
          )}

          {/* History */}
          <button
            ref={historyTriggerRef}
            onClick={handleToggleHistory}
            className={`relative flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors ${
              isHistoryPanelOpen
                ? 'bg-accent hover:bg-accent-hover text-accent-text'
                : hasHistory
                ? 'bg-neutral-700 hover:bg-neutral-600 text-white'
                : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-400'
            }`}
            title={isHistoryPanelOpen ? 'History panel (open)' : hasHistory ? `History (${sortedHistory.length})` : 'No history yet'}
          >
            <Icon name="clock" size={10} />
            <span>{hasHistory ? sortedHistory.length : 0}</span>
            {hasPinnedAssets && !isHistoryPanelOpen && (
              <div className="w-1.5 h-1.5 rounded-full bg-accent" />
            )}
          </button>

          {/* Recent generations */}
          <button
            ref={recentGensTriggerRef}
            onClick={handleToggleRecentGenerations}
            className={`relative flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors ${
              isRecentGensPanelOpen
                ? 'bg-accent hover:bg-accent-hover text-accent-text'
                : hasCompletedGenerations
                ? 'bg-neutral-700 hover:bg-neutral-600 text-white'
                : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-400'
            }`}
            title={isRecentGensPanelOpen ? 'Recent generations (open)' : hasCompletedGenerations ? `Recent generations (${completedGenerationCount})` : 'No recent generations'}
          >
            <Icon name="sparkles" size={10} />
            <span>{completedGenerationCount}</span>
          </button>

          {/* Settings */}
          <button
            ref={settingsTriggerRef}
            onClick={(e) => {
              e.stopPropagation();
              setShowSettingsPopover((prev) => !prev);
            }}
            className={`relative flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors ${
              showSettingsPopover
                ? 'bg-amber-600 hover:bg-amber-700 text-white'
                : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-400'
            }`}
            title="Asset panel settings"
            type="button"
          >
            <Icon name="sliders" size={10} />
            {assetHasInstanceOverrides && (
              <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-amber-500" />
            )}
          </button>
        </div>
      </div>

      {/* Settings popover */}
      <Popover
        open={showSettingsPopover}
        onClose={() => setShowSettingsPopover(false)}
        anchor={settingsTriggerRef.current}
        placement="bottom"
        align="end"
        offset={4}
        triggerRef={settingsTriggerRef}
        className="w-[192px] rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-xl p-3"
      >
        <div className="text-[10px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-2">
          Display
        </div>
        <div className="space-y-2">
          <label className="block text-[10px] text-neutral-500 dark:text-neutral-400">Multi-input mode</label>
          <select
            value={assetInstanceOverrides?.displayMode ?? '__global__'}
            onChange={(e) => handleComponentSetting('displayMode', e.target.value)}
            className="w-full px-2 py-1 text-[11px] rounded-md bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
          >
            <option value="__global__">Global ({globalDisplayMode})</option>
            <option value="strip">Strip</option>
            <option value="grid">Grid</option>
            <option value="carousel">Carousel</option>
          </select>

          {resolvedDisplayMode === 'grid' && (
            <>
              <label className="block text-[10px] text-neutral-500 dark:text-neutral-400">Grid columns</label>
              <select
                value={assetInstanceOverrides?.gridColumns ?? '__global__'}
                onChange={(e) => handleComponentSetting('gridColumns', e.target.value === '__global__' ? '__global__' : Number(e.target.value))}
                className="w-full px-2 py-1 text-[11px] rounded-md bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
              >
                <option value="__global__">Global ({globalGridColumns})</option>
                {[2, 3, 4, 5, 6].map((val) => (
                  <option key={val} value={val}>{val}</option>
                ))}
              </select>
            </>
          )}

          {assetHasInstanceOverrides && (
            <button
              type="button"
              onClick={handleClearInstanceOverrides}
              className="w-full mt-1 text-[10px] text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300"
            >
              Reset instance overrides
            </button>
          )}
        </div>

        <div className="border-t border-neutral-200 dark:border-neutral-700 mt-3 pt-2">
          <div className="text-[10px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-2">
            Inputs
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={perProviderInputs}
              onChange={(e) => setPerProviderInputs(e.target.checked)}
              className="rounded border-neutral-300 dark:border-neutral-600 text-accent"
            />
            <span className="text-[11px] text-neutral-700 dark:text-neutral-300">Per-provider inputs</span>
          </label>
          <p className="text-[9px] text-neutral-400 dark:text-neutral-500 mt-1">
            Keep separate asset queues when switching providers
          </p>
        </div>
      </Popover>
    </>
  );
}

/**
 * GenerationPresetSelector (formerly PresetSelector)
 *
 * Compact UI for selecting, saving, and managing generation presets.
 * A generation preset bundles: prompt + input assets + generation params.
 * Designed to fit in the GenerationSettingsPanel.
 *
 * Note: This is different from the "Presets" module in Control Center which
 * shows dynamic parameter presets (quality/aspect combos from provider specs).
 */

import { Popover } from '@pixsim7/shared.ui';
import clsx from 'clsx';
import { useState, useRef, useEffect, useCallback } from 'react';

import { Icon } from '@lib/icons';

import { useGenerationPresets } from '../hooks/useGenerationPresets';
import { useGenerationScopeStores } from '../hooks/useGenerationScope';
import type { GenerationPreset } from '../stores/generationPresetStore';

export interface PresetSelectorProps {
  /** Whether controls are disabled */
  disabled?: boolean;
  /** Additional class name */
  className?: string;
}

export function PresetSelector({
  disabled = false,
  className,
}: PresetSelectorProps) {
  const { useSessionStore } = useGenerationScopeStores();
  const operationType = useSessionStore((s) => s.operationType);
  const providerId = useSessionStore((s) => s.providerId);

  const {
    presetsForOperation,
    lastUsedPreset,
    loading: presetLoading,
    saveCurrentAsPreset,
    loadPresetAsync,
    deletePreset,
    renamePreset,
    updatePresetFromCurrent,
  } = useGenerationPresets();

  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [scopeToProvider, setScopeToProvider] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [newPresetName, setNewPresetName] = useState('');
  // Two-click confirm for the destructive overwrite action: holds the id of the
  // preset currently "armed" to be overwritten with the current scope state.
  const [overwriteArmedId, setOverwriteArmedId] = useState<string | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setIsSaving(false);
    setEditingId(null);
    setOverwriteArmedId(null);
  }, []);

  // Focus input when saving or editing
  useEffect(() => {
    if ((isSaving || editingId) && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isSaving, editingId]);

  const handleSave = useCallback(() => {
    if (!newPresetName.trim()) return;
    saveCurrentAsPreset(newPresetName.trim(), { scopeToProvider });
    setNewPresetName('');
    setIsSaving(false);
  }, [newPresetName, saveCurrentAsPreset, scopeToProvider]);

  const handleLoad = useCallback(
    async (preset: GenerationPreset) => {
      setIsOpen(false);
      await loadPresetAsync(preset.id);
    },
    [loadPresetAsync]
  );

  const handleRename = useCallback(
    (presetId: string) => {
      if (!editName.trim()) return;
      renamePreset(presetId, editName.trim());
      setEditingId(null);
      setEditName('');
    },
    [editName, renamePreset]
  );

  const handleDelete = useCallback(
    (presetId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      deletePreset(presetId);
    },
    [deletePreset]
  );

  const startEditing = useCallback((preset: GenerationPreset, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(preset.id);
    setEditName(preset.name);
  }, []);

  // Overwrite is destructive (replaces the saved snapshot), so the first click
  // arms the button and the second click within the same hover commits.
  const handleOverwrite = useCallback(
    (presetId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (overwriteArmedId !== presetId) {
        setOverwriteArmedId(presetId);
        return;
      }
      updatePresetFromCurrent(presetId);
      setOverwriteArmedId(null);
    },
    [overwriteArmedId, updatePresetFromCurrent]
  );

  const hasPresets = presetsForOperation.length > 0;

  return (
    <div className={className}>
      {/* Trigger button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled || presetLoading}
        className={clsx(
          'flex items-center justify-center w-7 h-7 shrink-0 rounded-lg',
          'bg-white dark:bg-neutral-800 shadow-sm',
          'hover:bg-neutral-50 dark:hover:bg-neutral-700',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'transition-colors',
          presetLoading && 'animate-pulse-subtle'
        )}
        title={
          presetLoading
            ? 'Loading preset…'
            : lastUsedPreset?.name
              ? `Presets — current: ${lastUsedPreset.name}`
              : 'Generation Presets — save and load prompt + inputs + settings'
        }
      >
        <Icon name="archive" size={14} className={presetLoading ? 'animate-spin' : ''} />
      </button>

      {/* Dropdown */}
      <Popover
        anchor={triggerRef.current}
        placement="bottom"
        align="start"
        offset={4}
        open={isOpen}
        onClose={handleClose}
        triggerRef={triggerRef}
      >
        <div className="min-w-[180px] max-w-[240px] bg-white dark:bg-neutral-800 rounded-lg shadow-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden">
          {/* Save new preset */}
          <div className="p-2 border-b border-neutral-200 dark:border-neutral-700">
            {isSaving ? (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1">
                  <input
                    ref={inputRef}
                    type="text"
                    value={newPresetName}
                    onChange={(e) => setNewPresetName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSave();
                      if (e.key === 'Escape') {
                        setIsSaving(false);
                        setNewPresetName('');
                      }
                    }}
                    placeholder="Preset name..."
                    className="flex-1 px-2 py-1 text-[11px] rounded bg-neutral-100 dark:bg-neutral-700 border-0 outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={!newPresetName.trim()}
                    className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-700 text-green-600 disabled:opacity-50"
                  >
                    <Icon name="check" size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsSaving(false);
                      setNewPresetName('');
                    }}
                    className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-500"
                  >
                    <Icon name="x" size={12} />
                  </button>
                </div>
                {providerId && (
                  <label className="flex items-center gap-1.5 px-1 text-[10px] text-neutral-500 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={scopeToProvider}
                      onChange={(e) => setScopeToProvider(e.target.checked)}
                      className="w-3 h-3 rounded"
                    />
                    Scope to {providerId}
                  </label>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsSaving(true)}
                className="flex items-center gap-1.5 w-full px-2 py-1.5 text-[11px] font-medium text-accent hover:bg-accent-subtle rounded"
              >
                <Icon name="save" size={12} />
                Save current preset
              </button>
            )}
          </div>

          {/* Preset list */}
          <div className="max-h-[200px] overflow-y-auto">
            {!hasPresets ? (
              <div className="px-3 py-4 text-[11px] text-neutral-500 text-center">
                No presets for {operationType.replace(/_/g, ' ')}
              </div>
            ) : (
              presetsForOperation.map((preset) => (
                <div
                  key={preset.id}
                  className={clsx(
                    'group flex items-center gap-1 px-2 py-1.5 hover:bg-neutral-50 dark:hover:bg-neutral-700 cursor-pointer',
                    lastUsedPreset?.id === preset.id && 'bg-accent-subtle',
                    preset.providerId && preset.providerId !== providerId && 'opacity-50'
                  )}
                  onClick={() => handleLoad(preset)}
                  onMouseLeave={() =>
                    setOverwriteArmedId((id) => (id === preset.id ? null : id))
                  }
                >
                  {editingId === preset.id ? (
                    <div className="flex items-center gap-1 flex-1" onClick={(e) => e.stopPropagation()}>
                      <input
                        ref={inputRef}
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRename(preset.id);
                          if (e.key === 'Escape') {
                            setEditingId(null);
                            setEditName('');
                          }
                        }}
                        className="flex-1 px-1 py-0.5 text-[11px] rounded bg-neutral-100 dark:bg-neutral-700 border-0 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleRename(preset.id)}
                        disabled={!editName.trim()}
                        className="p-0.5 rounded hover:bg-neutral-200 dark:hover:bg-neutral-600 text-green-600 disabled:opacity-50"
                      >
                        <Icon name="check" size={10} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(null);
                          setEditName('');
                        }}
                        className="p-0.5 rounded hover:bg-neutral-200 dark:hover:bg-neutral-600 text-neutral-500"
                      >
                        <Icon name="x" size={10} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="flex-1 text-[11px] truncate">{preset.name}</span>
                      {preset.providerId && (
                        <span className={clsx(
                          'shrink-0 px-1 py-0.5 text-[9px] rounded font-medium',
                          preset.providerId === providerId
                            ? 'bg-accent-subtle text-accent'
                            : 'bg-neutral-100 dark:bg-neutral-700 text-neutral-400'
                        )}>
                          {preset.providerId}
                        </span>
                      )}
                      <div className={clsx(
                        'items-center gap-0.5 rounded-md p-0.5',
                        'bg-white/95 dark:bg-neutral-900/90 shadow-sm ring-1 ring-black/5 dark:ring-white/10',
                        overwriteArmedId === preset.id ? 'flex' : 'hidden group-hover:flex'
                      )}>
                        <button
                          type="button"
                          onClick={(e) => handleOverwrite(preset.id, e)}
                          className={clsx(
                            'p-0.5 rounded',
                            overwriteArmedId === preset.id
                              ? 'bg-amber-500 text-white'
                              : 'text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40'
                          )}
                          title={
                            overwriteArmedId === preset.id
                              ? 'Click again to overwrite with current settings'
                              : 'Overwrite with current settings'
                          }
                        >
                          <Icon name={overwriteArmedId === preset.id ? 'check' : 'save'} size={10} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => startEditing(preset, e)}
                          className="p-0.5 rounded text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700"
                          title="Rename"
                        >
                          <Icon name="pencil" size={10} />
                        </button>
                        {!preset.isDefault && (
                          <button
                            type="button"
                            onClick={(e) => handleDelete(preset.id, e)}
                            className="p-0.5 rounded text-red-500 hover:bg-red-100 dark:hover:bg-red-900/40"
                            title="Delete"
                          >
                            <Icon name="trash2" size={10} />
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </Popover>
    </div>
  );
}

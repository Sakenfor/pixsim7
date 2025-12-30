/**
 * RegionEditForm
 *
 * Inline form for editing region labels and notes.
 * Includes autocomplete suggestions from existing vocabularies.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Icon } from '@lib/icons';
import { useAssetRegionStore } from '../stores/assetRegionStore';
import {
  ALL_REGION_LABELS,
  LABEL_GROUP_NAMES,
  type LabelSuggestion,
} from '@pixsim7/shared.types';

// ============================================================================
// Types
// ============================================================================

interface RegionEditFormProps {
  assetId: string | number;
  regionId: string;
  onClose?: () => void;
}

// ============================================================================
// Recent Labels (localStorage)
// ============================================================================

const RECENT_LABELS_KEY = 'pixsim7:recentRegionLabels';
const MAX_RECENT_LABELS = 5;

function getRecentLabels(): string[] {
  try {
    const stored = localStorage.getItem(RECENT_LABELS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function addRecentLabel(label: string): void {
  try {
    const recent = getRecentLabels().filter((l) => l !== label);
    recent.unshift(label);
    localStorage.setItem(
      RECENT_LABELS_KEY,
      JSON.stringify(recent.slice(0, MAX_RECENT_LABELS))
    );
  } catch {
    // Ignore storage errors
  }
}

// ============================================================================
// Label Autocomplete Component
// ============================================================================

interface LabelAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (value: string) => void;
  onBlur: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  inputRef: React.RefObject<HTMLInputElement>;
}

function LabelAutocomplete({
  value,
  onChange,
  onSelect,
  onBlur,
  onKeyDown,
  inputRef,
}: LabelAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Get recent labels
  const recentLabels = useMemo(() => getRecentLabels(), []);

  // Filter suggestions based on input
  const filteredSuggestions = useMemo(() => {
    const query = value.toLowerCase().trim();

    if (!query) {
      // Show recent + some defaults when empty
      const recentSuggestions: LabelSuggestion[] = recentLabels.map((id) => ({
        id,
        label: id.charAt(0).toUpperCase() + id.slice(1).replace(/_/g, ' '),
        group: 'builtin' as const, // Will be overridden in display
      }));

      // Get first few from each group
      const defaults = ALL_REGION_LABELS.slice(0, 12);

      return { recent: recentSuggestions, suggestions: defaults };
    }

    // Filter by id or label
    const matches = ALL_REGION_LABELS.filter(
      (s) =>
        s.id.toLowerCase().includes(query) ||
        s.label.toLowerCase().includes(query)
    );

    return { recent: [], suggestions: matches.slice(0, 15) };
  }, [value, recentLabels]);

  // Group suggestions
  const groupedSuggestions = useMemo(() => {
    const groups: Record<string, LabelSuggestion[]> = {};

    // Add recent first
    if (filteredSuggestions.recent.length > 0) {
      groups['recent'] = filteredSuggestions.recent;
    }

    // Group the rest by category
    for (const suggestion of filteredSuggestions.suggestions) {
      if (!groups[suggestion.group]) {
        groups[suggestion.group] = [];
      }
      groups[suggestion.group].push(suggestion);
    }

    return groups;
  }, [filteredSuggestions]);

  // Flat list for keyboard navigation
  const flatSuggestions = useMemo(() => {
    const flat: LabelSuggestion[] = [];
    for (const suggestions of Object.values(groupedSuggestions)) {
      flat.push(...suggestions);
    }
    return flat;
  }, [groupedSuggestions]);

  const handleKeyDownInternal = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          setIsOpen(true);
          setHighlightedIndex(0);
          e.preventDefault();
          return;
        }
        onKeyDown(e);
        return;
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setHighlightedIndex((prev) =>
            prev < flatSuggestions.length - 1 ? prev + 1 : 0
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setHighlightedIndex((prev) =>
            prev > 0 ? prev - 1 : flatSuggestions.length - 1
          );
          break;
        case 'Enter':
          e.preventDefault();
          if (highlightedIndex >= 0 && highlightedIndex < flatSuggestions.length) {
            const selected = flatSuggestions[highlightedIndex];
            onSelect(selected.id);
            addRecentLabel(selected.id);
            setIsOpen(false);
          } else {
            // Accept freeform input
            onKeyDown(e);
          }
          break;
        case 'Escape':
          setIsOpen(false);
          onKeyDown(e);
          break;
        case 'Tab':
          setIsOpen(false);
          break;
        default:
          onKeyDown(e);
      }
    },
    [isOpen, highlightedIndex, flatSuggestions, onSelect, onKeyDown]
  );

  const handleFocus = useCallback(() => {
    setIsOpen(true);
  }, []);

  const handleBlur = useCallback(
    (e: React.FocusEvent) => {
      // Delay to allow click on dropdown item
      setTimeout(() => {
        if (!dropdownRef.current?.contains(document.activeElement)) {
          setIsOpen(false);
          onBlur();
        }
      }, 150);
    },
    [onBlur]
  );

  const handleSelectItem = useCallback(
    (suggestion: LabelSuggestion) => {
      onSelect(suggestion.id);
      addRecentLabel(suggestion.id);
      setIsOpen(false);
      inputRef.current?.focus();
    },
    [onSelect, inputRef]
  );

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && dropdownRef.current) {
      const item = dropdownRef.current.querySelector(
        `[data-index="${highlightedIndex}"]`
      );
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex]);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setIsOpen(true);
          setHighlightedIndex(-1);
        }}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDownInternal}
        placeholder="e.g., face, pose, background..."
        className="w-full px-2 py-1.5 text-sm bg-neutral-700 border border-neutral-600 rounded focus:border-blue-500 focus:outline-none text-white placeholder-neutral-500"
        autoComplete="off"
      />

      {/* Dropdown */}
      {isOpen && flatSuggestions.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 max-h-[200px] overflow-y-auto bg-neutral-800 border border-neutral-600 rounded-lg shadow-xl"
        >
          {Object.entries(groupedSuggestions).map(([group, suggestions]) => (
            <div key={group}>
              {/* Group header */}
              <div className="px-2 py-1 text-[10px] font-medium text-neutral-500 uppercase tracking-wide bg-neutral-750 sticky top-0">
                {group === 'recent'
                  ? 'Recent'
                  : LABEL_GROUP_NAMES[group as keyof typeof LABEL_GROUP_NAMES] ?? group}
              </div>
              {/* Items */}
              {suggestions.map((suggestion) => {
                const globalIndex = flatSuggestions.indexOf(suggestion);
                const isHighlighted = globalIndex === highlightedIndex;

                return (
                  <button
                    key={`${group}-${suggestion.id}`}
                    data-index={globalIndex}
                    type="button"
                    onClick={() => handleSelectItem(suggestion)}
                    onMouseEnter={() => setHighlightedIndex(globalIndex)}
                    className={`w-full text-left px-2 py-1.5 text-sm flex items-center gap-2 transition-colors ${
                      isHighlighted
                        ? 'bg-blue-500/30 text-white'
                        : 'text-neutral-300 hover:bg-neutral-700'
                    }`}
                  >
                    <span className="truncate">{suggestion.label}</span>
                    {suggestion.id !== suggestion.label.toLowerCase().replace(/ /g, '_') && (
                      <span className="text-[10px] text-neutral-500 ml-auto">
                        {suggestion.id}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// RegionEditForm Component
// ============================================================================

export function RegionEditForm({ assetId, regionId, onClose }: RegionEditFormProps) {
  const region = useAssetRegionStore((s) => s.getRegion(assetId, regionId));
  const updateRegion = useAssetRegionStore((s) => s.updateRegion);
  const removeRegion = useAssetRegionStore((s) => s.removeRegion);
  const selectRegion = useAssetRegionStore((s) => s.selectRegion);

  const [label, setLabel] = useState(region?.label ?? '');
  const [note, setNote] = useState(region?.note ?? '');

  const labelInputRef = useRef<HTMLInputElement>(null);

  // Sync local state when region changes
  useEffect(() => {
    if (region) {
      setLabel(region.label);
      setNote(region.note ?? '');
    }
  }, [region]);

  // Focus label input on mount
  useEffect(() => {
    labelInputRef.current?.focus();
  }, []);

  const handleSave = useCallback(() => {
    if (!region) return;

    const finalLabel = label.trim() || 'Untitled';
    updateRegion(assetId, regionId, {
      label: finalLabel,
      note: note.trim() || undefined,
    });

    // Track in recent labels
    if (finalLabel !== 'Untitled') {
      addRecentLabel(finalLabel);
    }
  }, [assetId, regionId, label, note, region, updateRegion]);

  const handleDelete = useCallback(() => {
    removeRegion(assetId, regionId);
    selectRegion(null);
    onClose?.();
  }, [assetId, regionId, removeRegion, selectRegion, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSave();
      } else if (e.key === 'Escape') {
        selectRegion(null);
        onClose?.();
      }
    },
    [handleSave, selectRegion, onClose]
  );

  const handleLabelSelect = useCallback((selectedLabel: string) => {
    setLabel(selectedLabel);
  }, []);

  if (!region) {
    return null;
  }

  return (
    <div className="bg-neutral-800/95 backdrop-blur-sm rounded-lg shadow-lg border border-neutral-700 p-3 min-w-[240px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-neutral-400 uppercase tracking-wide">
          {region.type === 'rect' ? 'Rectangle' : 'Polygon'} Region
        </span>
        <button
          onClick={handleDelete}
          className="p-1 rounded hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors"
          title="Delete region"
        >
          <Icon name="trash2" size={14} />
        </button>
      </div>

      {/* Label input with autocomplete */}
      <div className="mb-3">
        <label className="block text-xs text-neutral-400 mb-1">Label</label>
        <LabelAutocomplete
          value={label}
          onChange={setLabel}
          onSelect={handleLabelSelect}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          inputRef={labelInputRef as React.RefObject<HTMLInputElement>}
        />
      </div>

      {/* Note input */}
      <div className="mb-3">
        <label className="block text-xs text-neutral-400 mb-1">Note (optional)</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={handleSave}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              selectRegion(null);
              onClose?.();
            }
          }}
          placeholder="Add prompt details..."
          rows={2}
          className="w-full px-2 py-1.5 text-sm bg-neutral-700 border border-neutral-600 rounded focus:border-blue-500 focus:outline-none text-white placeholder-neutral-500 resize-none"
        />
      </div>

      {/* Coordinates preview */}
      <div className="text-[10px] text-neutral-500 font-mono">
        {region.type === 'rect' && region.bounds && (
          <span>
            ({(region.bounds.x * 100).toFixed(1)}%, {(region.bounds.y * 100).toFixed(1)}%) -{' '}
            {(region.bounds.width * 100).toFixed(1)}% × {(region.bounds.height * 100).toFixed(1)}%
          </span>
        )}
        {region.type === 'polygon' && region.points && (
          <span>{region.points.length} points</span>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// RegionList Component
// ============================================================================

interface RegionListProps {
  assetId: string | number;
}

export function RegionList({ assetId }: RegionListProps) {
  const regions = useAssetRegionStore((s) => s.getRegions(assetId));
  const selectedRegionId = useAssetRegionStore((s) => s.selectedRegionId);
  const selectRegion = useAssetRegionStore((s) => s.selectRegion);
  const exportRegions = useAssetRegionStore((s) => s.exportRegions);
  const clearAssetRegions = useAssetRegionStore((s) => s.clearAssetRegions);

  const handleExport = useCallback(() => {
    const exported = exportRegions(assetId);

    // Copy to clipboard
    navigator.clipboard.writeText(JSON.stringify(exported, null, 2));
  }, [assetId, exportRegions]);

  if (regions.length === 0) {
    return (
      <div className="text-xs text-neutral-500 text-center py-4">
        No regions yet. Draw on the image to create regions.
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {regions.map((region) => (
        <button
          key={region.id}
          onClick={() => selectRegion(region.id)}
          className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${
            selectedRegionId === region.id
              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/50'
              : 'hover:bg-neutral-700/50 text-neutral-300'
          }`}
        >
          <div className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: region.style?.strokeColor ?? '#22c55e' }}
            />
            <span className="truncate">{region.label}</span>
            <span className="text-neutral-500 ml-auto">
              {region.type === 'rect' ? '▭' : '⬡'}
            </span>
          </div>
          {region.note && (
            <div className="text-[10px] text-neutral-500 mt-0.5 truncate pl-4">
              {region.note}
            </div>
          )}
        </button>
      ))}

      {/* Actions */}
      <div className="flex gap-1 pt-2 border-t border-neutral-700 mt-2">
        <button
          onClick={handleExport}
          className="flex-1 px-2 py-1 text-[10px] bg-neutral-700 hover:bg-neutral-600 rounded text-neutral-300 transition-colors"
          title="Copy regions as JSON"
        >
          Export JSON
        </button>
        <button
          onClick={() => clearAssetRegions(assetId)}
          className="px-2 py-1 text-[10px] bg-red-500/20 hover:bg-red-500/30 rounded text-red-400 transition-colors"
          title="Clear all regions"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

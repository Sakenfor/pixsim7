/**
 * Block Builder Modal
 *
 * Simple block builder using analyzed prompt segments.
 * Allows selecting and combining segments to create new prompt blocks.
 */

import { Button, Modal } from '@pixsim7/shared.ui';
import clsx from 'clsx';
import { useState, useMemo } from 'react';

import { Icon } from '@lib/icons';

// ============================================================================
// Types
// ============================================================================

interface PromptBlockInput {
  role: string;
  text: string;
  start_pos?: number;
  end_pos?: number;
  category?: string;
  metadata?: Record<string, unknown>;
}

interface BlockBuilderModalProps {
  open: boolean;
  onClose: () => void;
  segments: PromptBlockInput[];
  onInsertBlock: (block: string) => void;
}

// ============================================================================
// Role Badge Colors
// ============================================================================

const roleBadgeColors: Record<string, string> = {
  character: 'bg-blue-500',
  action: 'bg-green-500',
  setting: 'bg-purple-500',
  mood: 'bg-yellow-500',
  romance: 'bg-pink-500',
  other: 'bg-neutral-500',
};

// ============================================================================
// Component
// ============================================================================

export function BlockBuilderModal({
  open,
  onClose,
  segments,
  onInsertBlock,
}: BlockBuilderModalProps) {
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [customText, setCustomText] = useState('');
  const [combineMode, setCombineMode] = useState<'sentence' | 'inline'>('sentence');

  // Group segments by role
  const groupedSegments = useMemo(() => {
    const groups: Record<string, { segment: PromptBlockInput; index: number }[]> = {};
    segments.forEach((segment, index) => {
      const role = segment.role || 'other';
      if (!groups[role]) {
        groups[role] = [];
      }
      groups[role].push({ segment, index });
    });
    return groups;
  }, [segments]);

  // Build the combined block from selections
  const combinedBlock = useMemo(() => {
    if (selectedIndices.size === 0) return customText;

    const selectedSegments = Array.from(selectedIndices)
      .sort((a, b) => a - b)
      .map((idx) => segments[idx]?.text)
      .filter(Boolean);

    if (selectedSegments.length === 0) return customText;

    const separator = combineMode === 'sentence' ? '. ' : ', ';
    const combined = selectedSegments.join(separator);

    return customText ? `${combined}${separator}${customText}` : combined;
  }, [selectedIndices, segments, customText, combineMode]);

  // Toggle segment selection
  const toggleSegment = (index: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  // Select all segments of a role
  const selectAllOfRole = (role: string) => {
    const roleIndices = groupedSegments[role]?.map((item) => item.index) || [];
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      roleIndices.forEach((idx) => next.add(idx));
      return next;
    });
  };

  // Clear all selections
  const clearSelections = () => {
    setSelectedIndices(new Set());
    setCustomText('');
  };

  // Insert the combined block
  const handleInsert = () => {
    if (combinedBlock.trim()) {
      onInsertBlock(combinedBlock.trim());
      clearSelections();
      onClose();
    }
  };

  if (!open) return null;

  const hasSegments = segments.length > 0;
  const hasSelection = selectedIndices.size > 0 || customText.trim().length > 0;
  const roleOrder = ['character', 'action', 'setting', 'mood', 'romance', 'other'];

  return (
    <Modal isOpen={open} onClose={onClose} title="Block Builder">
      <div className="space-y-4">
        {/* Instructions */}
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Select segments from your analyzed prompt to build a new block. You can also add custom
          text.
        </p>

        {!hasSegments ? (
          <div className="text-center py-8 text-neutral-500">
            <Icon name="alertCircle" className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No segments available. Analyze a prompt first.</p>
          </div>
        ) : (
          <>
            {/* Combine Mode Toggle */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-neutral-500">Combine with:</span>
              <button
                onClick={() => setCombineMode('sentence')}
                className={clsx(
                  'px-2 py-1 text-xs rounded',
                  combineMode === 'sentence'
                    ? 'bg-blue-500 text-white'
                    : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300'
                )}
              >
                Sentences
              </button>
              <button
                onClick={() => setCombineMode('inline')}
                className={clsx(
                  'px-2 py-1 text-xs rounded',
                  combineMode === 'inline'
                    ? 'bg-blue-500 text-white'
                    : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300'
                )}
              >
                Inline
              </button>
              {selectedIndices.size > 0 && (
                <button
                  onClick={clearSelections}
                  className="ml-auto text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
                >
                  Clear ({selectedIndices.size})
                </button>
              )}
            </div>

            {/* Segment Selection */}
            <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
              {roleOrder
                .filter((role) => groupedSegments[role])
                .map((role) => (
                  <div key={role}>
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={clsx(
                          'w-2 h-2 rounded-full',
                          roleBadgeColors[role] || roleBadgeColors.other
                        )}
                      />
                      <span className="text-xs font-medium capitalize">{role}</span>
                      <button
                        onClick={() => selectAllOfRole(role)}
                        className="text-xs text-blue-500 hover:text-blue-600"
                      >
                        Select all
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5 ml-4">
                      {groupedSegments[role].map(({ segment, index }) => {
                        const isSelected = selectedIndices.has(index);
                        return (
                          <button
                            key={index}
                            onClick={() => toggleSegment(index)}
                            className={clsx(
                              'px-2 py-1 text-xs rounded-lg border transition-colors max-w-[200px] truncate',
                              isSelected
                                ? 'bg-blue-100 dark:bg-blue-900 border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-200'
                                : 'bg-neutral-50 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-700'
                            )}
                            title={segment.text}
                          >
                            {isSelected && <Icon name="check" className="h-3 w-3 inline mr-1" />}
                            {segment.text.slice(0, 40)}
                            {segment.text.length > 40 && '...'}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
            </div>

            {/* Custom Text Input */}
            <div>
              <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400 block mb-1">
                Add Custom Text
              </label>
              <input
                type="text"
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                placeholder="Add your own text to the block..."
                className="w-full px-3 py-2 text-sm border border-neutral-300 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Preview */}
            {hasSelection && (
              <div>
                <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400 block mb-1">
                  Preview
                </label>
                <div className="p-3 bg-neutral-50 dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 text-sm max-h-32 overflow-y-auto">
                  {combinedBlock || (
                    <span className="text-neutral-400 italic">Select segments to preview...</span>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2 border-t border-neutral-200 dark:border-neutral-700">
          <Button onClick={onClose} variant="outline">
            Cancel
          </Button>
          <Button onClick={handleInsert} disabled={!hasSelection || !combinedBlock.trim()}>
            <Icon name="add" className="h-4 w-4 mr-1" />
            Insert Block
          </Button>
        </div>
      </div>
    </Modal>
  );
}

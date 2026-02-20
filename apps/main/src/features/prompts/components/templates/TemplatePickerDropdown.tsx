/**
 * TemplatePickerDropdown — Dropdown listing saved templates
 *
 * Selecting a template triggers a roll and shows the result inline.
 * Confirming a roll result calls the onUsePrompt callback.
 */
import { Dropdown, DropdownItem, DropdownDivider } from '@pixsim7/shared.ui';
import clsx from 'clsx';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Icon } from '@lib/icons';

import { useBlockTemplateStore } from '../../stores/blockTemplateStore';

import { TemplateRollResult } from './TemplateRollResult';

interface TemplatePickerDropdownProps {
  onUsePrompt: (prompt: string) => void;
  disabled?: boolean;
  className?: string;
}

export function TemplatePickerDropdown({
  onUsePrompt,
  disabled = false,
  className,
}: TemplatePickerDropdownProps) {
  const templates = useBlockTemplateStore((s) => s.templates);
  const templatesLoading = useBlockTemplateStore((s) => s.templatesLoading);
  const fetchTemplates = useBlockTemplateStore((s) => s.fetchTemplates);
  const roll = useBlockTemplateStore((s) => s.roll);
  const lastRollResult = useBlockTemplateStore((s) => s.lastRollResult);
  const rolling = useBlockTemplateStore((s) => s.rolling);
  const clearRollResult = useBlockTemplateStore((s) => s.clearRollResult);

  const [open, setOpen] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [rolledTemplateId, setRolledTemplateId] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | undefined>();

  useEffect(() => {
    if (open && templates.length === 0 && !templatesLoading) {
      void fetchTemplates();
    }
  }, [open, templates.length, templatesLoading, fetchTemplates]);

  const handleSelect = useCallback(
    async (templateId: string) => {
      setOpen(false);
      setRolledTemplateId(templateId);
      const result = await roll(templateId);
      if (result) {
        setShowResult(true);
      }
    },
    [roll],
  );

  const handleReroll = useCallback(() => {
    if (rolledTemplateId) {
      void roll(rolledTemplateId);
    }
  }, [roll, rolledTemplateId]);

  const handleUsePrompt = useCallback(
    (prompt: string) => {
      onUsePrompt(prompt);
      setShowResult(false);
      clearRollResult();
    },
    [clearRollResult, onUsePrompt],
  );

  return (
    <>
      <div className={clsx('relative', className)}>
        <button
          ref={triggerRef}
          type="button"
          disabled={disabled}
          onClick={() => {
            setOpen((prev) => {
              if (!prev && triggerRef.current) {
                const rect = triggerRef.current.getBoundingClientRect();
                setAnchor({ x: rect.left, y: rect.bottom + 4 });
              }
              return !prev;
            });
          }}
          title="Roll from template"
          className={clsx(
            'p-1 rounded transition-colors',
            open
              ? 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200'
              : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800',
          )}
        >
          <Icon name="shuffle" size={14} />
        </button>
        <Dropdown
          isOpen={open}
          onClose={() => setOpen(false)}
          triggerRef={triggerRef}
          positionMode="fixed"
          anchorPosition={anchor}
          minWidth="200px"
          portal
        >
          {templatesLoading ? (
            <div className="px-3 py-2 text-xs text-neutral-500">Loading...</div>
          ) : templates.length === 0 ? (
            <div className="px-3 py-2 text-xs text-neutral-500">No templates yet</div>
          ) : (
            templates.map((t) => (
              <DropdownItem
                key={t.id}
                onClick={() => handleSelect(t.id)}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="truncate">{t.name}</span>
                  <span className="text-[10px] text-neutral-400 ml-2 tabular-nums">
                    {t.slot_count} slot{t.slot_count === 1 ? '' : 's'}
                  </span>
                </div>
              </DropdownItem>
            ))
          )}
        </Dropdown>
      </div>

      {/* Roll result overlay */}
      {showResult && lastRollResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowResult(false)}>
          <div
            className="bg-white dark:bg-neutral-900 rounded-xl shadow-xl border border-neutral-200 dark:border-neutral-700 p-4 max-w-lg w-full max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
                Roll Result
              </h3>
              <button
                type="button"
                onClick={() => setShowResult(false)}
                className="p-1 rounded text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-200"
              >
                <Icon name="x" size={14} />
              </button>
            </div>
            <TemplateRollResult
              result={lastRollResult}
              onUsePrompt={handleUsePrompt}
              onReroll={handleReroll}
              rolling={rolling}
            />
          </div>
        </div>
      )}
    </>
  );
}

import { useState, useRef, useEffect } from 'react';
import clsx from 'clsx';
import type { ParamSpec } from './DynamicParamForm';

interface AdvancedSettingsPopoverProps {
  params: ParamSpec[];
  values: Record<string, any>;
  onChange: (name: string, value: any) => void;
  disabled?: boolean;
}

/**
 * Advanced settings popover for generation parameters.
 * Shows a gear icon that opens a side popover with advanced options
 * like seed, negative_prompt, style, and boolean toggles.
 */
export function AdvancedSettingsPopover({
  params,
  values,
  onChange,
  disabled = false,
}: AdvancedSettingsPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  if (params.length === 0) return null;

  // Count how many advanced params have non-default values
  const activeCount = params.filter(p => {
    const val = values[p.name];
    if (val === undefined || val === null || val === '') return false;
    if (p.type === 'boolean' && !val) return false;
    if (p.default !== undefined && val === p.default) return false;
    return true;
  }).length;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className={clsx(
          'p-1.5 rounded-lg transition-colors relative',
          isOpen
            ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'
            : 'bg-white dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
        title="Advanced settings"
      >
        {/* Gear icon */}
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
        </svg>
        {/* Badge for active count */}
        {activeCount > 0 && (
          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-blue-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center">
            {activeCount}
          </span>
        )}
      </button>

      {/* Popover - appears above the button to avoid clipping at container edges */}
      {isOpen && (
        <div
          ref={popoverRef}
          className="absolute bottom-full right-0 mb-2 z-50 w-56 bg-white dark:bg-neutral-900 rounded-xl shadow-xl border border-neutral-200 dark:border-neutral-700 overflow-hidden"
        >
          <div className="px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700">
            <h3 className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-200">
              Advanced Settings
            </h3>
          </div>
          <div className="p-3 space-y-3 max-h-[300px] overflow-y-auto">
            {params.map(param => (
              <div key={param.name} className="space-y-1">
                <label className="text-[10px] font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
                  {param.name.replace(/_/g, ' ')}
                </label>
                {param.type === 'boolean' ? (
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={!!values[param.name]}
                      onChange={(e) => onChange(param.name, e.target.checked)}
                      disabled={disabled}
                      className="w-4 h-4 rounded border-neutral-300 dark:border-neutral-600 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-[11px] text-neutral-600 dark:text-neutral-300 group-hover:text-neutral-800 dark:group-hover:text-neutral-100">
                      {param.description || 'Enable'}
                    </span>
                  </label>
                ) : param.type === 'number' || param.name === 'seed' ? (
                  <input
                    type="number"
                    value={values[param.name] ?? ''}
                    onChange={(e) => onChange(param.name, e.target.value === '' ? undefined : Number(e.target.value))}
                    disabled={disabled}
                    placeholder={param.name === 'seed' ? 'Random' : param.default?.toString() || ''}
                    className="w-full px-2.5 py-1.5 text-[11px] rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                  />
                ) : param.enum ? (
                  <select
                    value={values[param.name] ?? param.default ?? ''}
                    onChange={(e) => onChange(param.name, e.target.value || undefined)}
                    disabled={disabled}
                    className="w-full px-2.5 py-1.5 text-[11px] rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                  >
                    <option value="">Default</option>
                    {param.enum.map((opt: string) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={values[param.name] ?? ''}
                    onChange={(e) => onChange(param.name, e.target.value || undefined)}
                    disabled={disabled}
                    placeholder={param.default?.toString() || `Enter ${param.name.replace(/_/g, ' ')}`}
                    className="w-full px-2.5 py-1.5 text-[11px] rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

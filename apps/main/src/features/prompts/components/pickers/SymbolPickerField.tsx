/**
 * SymbolPickerField
 *
 * Lowest-rung ref picker — emits an opaque symbol token. Used by the
 * RefPickerField dispatcher when a capability has no richer picker
 * (no asset/character/role mapping). Validates that the symbol is
 * non-empty and whitespace-free; the dispatcher wraps it in the
 * canonical `symbol:<token>` form the executor expects.
 */
import { Hash, X } from 'lucide-react';
import { useCallback, useState } from 'react';

export interface PickedSymbol {
  /** Bare symbol token, no `symbol:` prefix. */
  symbol: string;
}

export interface SymbolPickerFieldProps {
  value?: PickedSymbol | null;
  onChange: (sym: PickedSymbol | null) => void;
  label?: string;
  className?: string;
  placeholder?: string;
}

const INVALID_CHAR_RE = /\s/;

export function SymbolPickerField({
  value,
  onChange,
  label,
  className,
  placeholder = 'symbol_token',
}: SymbolPickerFieldProps) {
  const [draft, setDraft] = useState('');

  const handleCommit = useCallback(() => {
    const trimmed = draft.trim();
    if (!trimmed || INVALID_CHAR_RE.test(trimmed)) return;
    onChange({ symbol: trimmed });
    setDraft('');
  }, [draft, onChange]);

  const handleClear = useCallback(() => {
    onChange(null);
    setDraft('');
  }, [onChange]);

  const draftIsValid = draft.trim() !== '' && !INVALID_CHAR_RE.test(draft.trim());

  return (
    <div className={className}>
      {label && (
        <label className="block text-[10px] text-neutral-500 dark:text-neutral-400 mb-0.5">
          {label}
        </label>
      )}

      {value ? (
        <div className="flex items-center gap-2 p-1.5 border border-neutral-200 dark:border-neutral-700 rounded bg-neutral-50 dark:bg-neutral-800/50">
          <Hash className="w-3.5 h-3.5 text-neutral-400 flex-shrink-0" />
          <div className="flex-1 min-w-0 text-xs font-mono text-neutral-700 dark:text-neutral-200 truncate">
            {value.symbol}
          </div>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleClear}
            className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
            title="Clear symbol"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1 px-2 py-1 border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-900">
          <Hash className="w-3 h-3 text-neutral-400 flex-shrink-0" />
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleCommit();
              }
            }}
            onBlur={() => {
              if (draftIsValid) handleCommit();
            }}
            placeholder={placeholder}
            className="flex-1 min-w-0 bg-transparent text-xs font-mono text-neutral-700 dark:text-neutral-200 placeholder:text-neutral-400 focus:outline-none"
          />
        </div>
      )}
    </div>
  );
}

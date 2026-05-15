/**
 * RolePickerField
 *
 * Picks a role concept token (e.g. "subject", "main_character",
 * "environment") for an op-ref binding. Dropdown of canonical
 * COMPOSITION_ROLES + a free-text fallback for plugin-contributed or
 * arbitrary role IDs.
 *
 * The component emits the bare role ID (e.g. "entities:subject"); the
 * RefPickerField dispatcher wraps it in the canonical `role:<id>`
 * token form the executor expects.
 */
import {
  COMPOSITION_ROLES,
  ROLE_DESCRIPTIONS,
} from '@pixsim7/shared.types/composition-roles.generated';
import { ChevronDown, Tag, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';


export interface PickedRole {
  /** Bare role ID, no `role:` prefix. */
  roleId: string;
  /** Optional human-readable description (from ROLE_DESCRIPTIONS or
   *  empty for plugin/free-text roles). */
  description?: string;
}

export interface RolePickerFieldProps {
  value?: PickedRole | null;
  onChange: (role: PickedRole | null) => void;
  label?: string;
  className?: string;
  placeholder?: string;
  /** Subset filter for the dropdown — useful when the op_ref.capability
   *  hints at which roles are appropriate (e.g. only `entities:*` for
   *  subject/target capabilities). When omitted, all COMPOSITION_ROLES
   *  are shown. */
  filterPrefix?: string;
}

function describeRole(roleId: string): string {
  const desc = (ROLE_DESCRIPTIONS as Record<string, string>)[roleId];
  return desc || '';
}

export function RolePickerField({
  value,
  onChange,
  label,
  className,
  placeholder = 'Pick role…',
  filterPrefix,
}: RolePickerFieldProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [customText, setCustomText] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setCustomMode(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredRoles = filterPrefix
    ? COMPOSITION_ROLES.filter((r) => r.startsWith(filterPrefix))
    : COMPOSITION_ROLES;

  const handleSelect = useCallback(
    (roleId: string) => {
      onChange({ roleId, description: describeRole(roleId) });
      setIsOpen(false);
      setCustomMode(false);
      setCustomText('');
    },
    [onChange],
  );

  const handleCustomCommit = useCallback(() => {
    const trimmed = customText.trim();
    if (!trimmed) return;
    onChange({ roleId: trimmed });
    setCustomMode(false);
    setCustomText('');
    setIsOpen(false);
  }, [customText, onChange]);

  const handleClear = useCallback(() => {
    onChange(null);
    setIsOpen(false);
    setCustomMode(false);
    setCustomText('');
  }, [onChange]);

  return (
    <div ref={containerRef} className={className}>
      {label && (
        <label className="block text-[10px] text-neutral-500 dark:text-neutral-400 mb-0.5">
          {label}
        </label>
      )}

      {value ? (
        <div className="flex items-center gap-2 p-1.5 border border-neutral-200 dark:border-neutral-700 rounded bg-neutral-50 dark:bg-neutral-800/50">
          <Tag className="w-3.5 h-3.5 text-neutral-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-mono text-neutral-700 dark:text-neutral-200 truncate">
              {value.roleId}
            </div>
            {value.description && (
              <div className="text-[10px] text-neutral-400 truncate">{value.description}</div>
            )}
          </div>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleClear}
            className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
            title="Clear role"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setIsOpen((o) => !o)}
            className="w-full flex items-center gap-1 px-2 py-1 border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-900 hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
          >
            <Tag className="w-3 h-3 text-neutral-400 flex-shrink-0" />
            <span className="flex-1 text-left text-xs text-neutral-400 truncate">
              {placeholder}
            </span>
            <ChevronDown className="w-3 h-3 text-neutral-400 flex-shrink-0" />
          </button>

          {isOpen && (
            <div className="absolute z-50 left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-md">
              {filteredRoles.map((roleId) => (
                <button
                  type="button"
                  key={roleId}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelect(roleId)}
                  className="w-full text-left px-2 py-1.5 text-xs hover:bg-neutral-100 dark:hover:bg-neutral-800 flex items-start gap-2"
                  title={describeRole(roleId)}
                >
                  <Tag className="w-3 h-3 text-neutral-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-neutral-700 dark:text-neutral-200 truncate">
                      {roleId}
                    </div>
                    <div className="text-[10px] text-neutral-400 truncate">
                      {describeRole(roleId) || '(no description)'}
                    </div>
                  </div>
                </button>
              ))}

              <div className="border-t border-neutral-200 dark:border-neutral-700">
                {customMode ? (
                  <div className="p-1.5 flex items-center gap-1">
                    <input
                      type="text"
                      autoFocus
                      value={customText}
                      onChange={(e) => setCustomText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleCustomCommit();
                        } else if (e.key === 'Escape') {
                          setCustomMode(false);
                          setCustomText('');
                        }
                      }}
                      placeholder="custom role id"
                      className="flex-1 min-w-0 px-1.5 py-0.5 text-xs font-mono bg-neutral-100 dark:bg-neutral-800 rounded focus:outline-none focus:ring-1 focus:ring-violet-500"
                    />
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={handleCustomCommit}
                      disabled={!customText.trim()}
                      className="px-2 py-0.5 text-[11px] rounded bg-violet-500 hover:bg-violet-600 text-white disabled:bg-violet-200 dark:disabled:bg-violet-900/30 disabled:text-violet-400 disabled:cursor-not-allowed"
                    >
                      Use
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setCustomMode(true)}
                    className="w-full text-left px-2 py-1.5 text-[11px] text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 italic"
                  >
                    Custom role id…
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

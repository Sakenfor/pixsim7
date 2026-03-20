/**
 * BranchSelector — dropdown to switch between branches.
 *
 * Styled like GitHub Desktop's branch switcher. Shows current branch,
 * dropdown with all branches + metadata, optional "new branch" action.
 *
 * Generic — works with any entity that has git-like branches.
 *
 * @example
 *   <BranchSelector
 *     branches={branches}
 *     currentBranch="main"
 *     onSelect={(name) => switchBranch(name)}
 *     onCreateBranch={(name) => createBranch(name)}
 *   />
 */
import { useEffect, useRef, useState } from 'react';

export interface BranchInfo {
  name: string;
  isMain?: boolean;
  commitCount?: number;
  lastCommit?: string | null;
  author?: string | null;
}

export interface BranchSelectorProps {
  branches: BranchInfo[];
  currentBranch: string | null;
  onSelect: (branchName: string) => void;
  onCreateBranch?: (branchName: string) => void;
  disabled?: boolean;
  className?: string;
}

export function BranchSelector({
  branches,
  currentBranch,
  onSelect,
  onCreateBranch,
  disabled,
  className = '',
}: BranchSelectorProps) {
  const [open, setOpen] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  // Focus input when opening with create support
  useEffect(() => {
    if (open && onCreateBranch && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open, onCreateBranch]);

  const currentLabel = currentBranch ?? 'main';
  const sorted = [...branches].sort((a, b) => {
    if (a.isMain && !b.isMain) return -1;
    if (!a.isMain && b.isMain) return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        className={[
          'flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs font-medium transition-colors w-full',
          'bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700',
          'text-neutral-700 dark:text-neutral-200',
          'hover:bg-neutral-50 dark:hover:bg-neutral-700',
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
        ].join(' ')}
      >
        {/* Branch icon */}
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="flex-shrink-0 opacity-60">
          <path d="M5 3.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm0 2.122a2.25 2.25 0 1 0-1.5 0v5.256a2.25 2.25 0 1 0 1.5 0V5.372Zm6.5 5.006a2.25 2.25 0 1 0-1.5 0v.622A1.75 1.75 0 0 1 8.25 13h-1.5a.25.25 0 0 1-.25-.25v-1.122a2.25 2.25 0 1 0-1.5 0v1.122c0 .966.784 1.75 1.75 1.75h1.5a3.25 3.25 0 0 0 3.25-3.25v-.622ZM5 12.75a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm7.5-7.5a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
        </svg>
        <span className="truncate flex-1 text-left">{currentLabel}</span>
        <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" className={`flex-shrink-0 opacity-40 transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M4.427 7.427l3.396 3.396a.25.25 0 0 0 .354 0l3.396-3.396A.25.25 0 0 0 11.396 7H4.604a.25.25 0 0 0-.177.427Z" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 left-0 right-0 min-w-[180px] bg-white dark:bg-neutral-900 rounded-lg shadow-lg border border-neutral-200 dark:border-neutral-700 py-1 max-h-[240px] overflow-y-auto">
          {onCreateBranch && (
            <div className="px-2 py-1.5 border-b border-neutral-200 dark:border-neutral-700">
              <form
                className="flex items-center gap-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  const name = newBranchName.trim();
                  if (!name) return;
                  onCreateBranch(name);
                  setNewBranchName('');
                  setOpen(false);
                }}
              >
                <input
                  ref={inputRef}
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  placeholder="New branch..."
                  className="flex-1 min-w-0 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-1.5 py-1 text-[11px]"
                />
                <button
                  type="submit"
                  disabled={!newBranchName.trim()}
                  className="px-1.5 py-1 rounded text-[11px] font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 border border-blue-300 dark:border-blue-800/60 disabled:opacity-40"
                >
                  +
                </button>
              </form>
            </div>
          )}
          {sorted.map((branch) => {
            const isCurrent = branch.name === currentBranch;
            return (
              <button
                key={branch.name}
                type="button"
                onClick={() => {
                  onSelect(branch.name);
                  setOpen(false);
                }}
                className={[
                  'flex items-center gap-2 w-full px-2.5 py-1.5 text-[11px] text-left transition-colors',
                  isCurrent
                    ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-semibold'
                    : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800',
                ].join(' ')}
              >
                <span className="flex-1 truncate">{branch.name}</span>
                {branch.commitCount != null && (
                  <span className="text-[10px] opacity-50">{branch.commitCount}c</span>
                )}
                {isCurrent && (
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" className="flex-shrink-0">
                    <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
                  </svg>
                )}
              </button>
            );
          })}
          {sorted.length === 0 && (
            <div className="px-2.5 py-2 text-[11px] text-neutral-500 dark:text-neutral-400">
              No branches yet
            </div>
          )}
        </div>
      )}
    </div>
  );
}

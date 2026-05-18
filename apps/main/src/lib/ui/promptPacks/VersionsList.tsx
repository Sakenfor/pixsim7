/**
 * VersionsList — list of versions for a prompt-pack draft.
 *
 * Each row shows `v{n}`, an `active` pill when the version is in
 * the active catalog, and the created timestamp. Pure presentation.
 */

import clsx from 'clsx';

import type { PromptPackVersion } from '@lib/api/promptPacks';

import { StatusBadge } from './StatusBadge';

function formatDate(value?: string | null): string {
  if (!value) return '-';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

export interface VersionsListProps {
  versions: PromptPackVersion[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Set of version ids that are currently activated in the catalog. */
  activeVersionIds: Set<string>;
  loading?: boolean;
  error?: string | null;
  emptyMessage?: string;
}

export function VersionsList({
  versions,
  selectedId,
  onSelect,
  activeVersionIds,
  loading,
  error,
  emptyMessage = 'No versions yet.',
}: VersionsListProps) {
  if (loading) {
    return <div className="text-xs text-neutral-500">Loading versions...</div>;
  }
  if (error) {
    return <div className="text-xs text-red-600 dark:text-red-400">{error}</div>;
  }
  if (versions.length === 0) {
    return <div className="text-xs text-neutral-500">{emptyMessage}</div>;
  }
  return (
    <div className="space-y-1">
      {versions.map((version) => {
        const isActive = activeVersionIds.has(version.id);
        const isSelected = version.id === selectedId;
        return (
          <button
            key={version.id}
            type="button"
            onClick={() => onSelect(version.id)}
            className={clsx(
              'w-full text-left rounded border p-2 transition',
              isSelected
                ? 'border-blue-300 bg-blue-50 dark:border-blue-800/50 dark:bg-blue-900/20'
                : 'border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800',
            )}
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-neutral-800 dark:text-neutral-100">
                v{version.version}
              </span>
              {isActive && <StatusBadge variant="success">active</StatusBadge>}
            </div>
            <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
              {formatDate(version.created_at)}
            </div>
          </button>
        );
      })}
    </div>
  );
}

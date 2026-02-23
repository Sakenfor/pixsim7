import { getLocalGroupLabel, type LocalGroupBy } from '../../lib/localGroupEngine';

export interface LocalGroupPathEntry {
  groupBy: LocalGroupBy;
  groupKey: string;
}

export interface LocalGroupBreadcrumbProps {
  groupPath: LocalGroupPathEntry[];
  itemCount: number;
  onBack: () => void;
}

export function LocalGroupBreadcrumb({
  groupPath,
  itemCount,
  onBack,
}: LocalGroupBreadcrumbProps) {
  return (
    <div className="mb-4 flex items-center justify-between bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 rounded px-3 py-2">
      <nav className="flex items-center gap-1 text-sm min-w-0 overflow-hidden">
        <button
          type="button"
          onClick={onBack}
          className="text-accent hover:underline flex-shrink-0"
        >
          Groups
        </button>
        {groupPath.map((entry, index) => {
          const label = getLocalGroupLabel(entry.groupBy, entry.groupKey);
          return (
            <span key={index} className="flex items-center gap-1 min-w-0">
              <span className="text-neutral-400 flex-shrink-0">/</span>
              <span className="font-medium truncate">{label}</span>
            </span>
          );
        })}
        <span className="text-neutral-500 dark:text-neutral-400 flex-shrink-0 ml-1">
          ({itemCount} items)
        </span>
      </nav>
      <button
        type="button"
        onClick={onBack}
        className="px-2 py-1 text-xs border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-600 transition-colors flex-shrink-0 ml-2"
      >
        Back
      </button>
    </div>
  );
}

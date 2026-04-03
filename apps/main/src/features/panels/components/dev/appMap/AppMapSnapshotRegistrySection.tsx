import type { AppMapFrontendRegistries } from '@pixsim7/shared.types';

interface AppMapSnapshotRegistrySectionProps {
  registries?: AppMapFrontendRegistries;
}

interface RegistryCountCardProps {
  label: string;
  count: number;
}

export function AppMapSnapshotRegistrySection({
  registries,
}: AppMapSnapshotRegistrySectionProps) {
  if (!registries) {
    return (
      <div className="border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/40 p-3">
        <div className="text-xs text-neutral-500 dark:text-neutral-400">
          Canonical snapshot registries unavailable (backend snapshot not loaded yet).
        </div>
      </div>
    );
  }

  const total =
    registries.actions.length +
    registries.panels.length +
    registries.modules.length +
    registries.stores.length +
    registries.hooks.length +
    registries.external.length;

  return (
    <div className="border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/40 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            Canonical App Map Registries
          </h3>
          <p className="text-xs text-neutral-600 dark:text-neutral-400">
            Backend snapshot source for actions, panels, modules, stores, hooks, and external registries.
          </p>
        </div>
        <span className="text-xs font-medium px-2 py-1 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200">
          {total} total
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        <RegistryCountCard label="Actions" count={registries.actions.length} />
        <RegistryCountCard label="Panels" count={registries.panels.length} />
        <RegistryCountCard label="Modules" count={registries.modules.length} />
        <RegistryCountCard label="Stores" count={registries.stores.length} />
        <RegistryCountCard label="Hooks" count={registries.hooks.length} />
        <RegistryCountCard label="External" count={registries.external.length} />
      </div>

      <details className="rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900">
        <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-neutral-700 dark:text-neutral-300">
          View snapshot registry entries
        </summary>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 border-t border-neutral-200 dark:border-neutral-700">
          <SnapshotRegistryList
            title="Actions"
            items={registries.actions.map((item) =>
              `${item.title} (${item.id})${item.featureId ? ` [${item.featureId}]` : ''}`
            )}
          />
          <SnapshotRegistryList
            title="Panels"
            items={registries.panels.map((item) =>
              `${item.title} (${item.id})${formatMetaSuffix(item.updatedAt, item.changeNote, item.featureHighlights)}`
            )}
          />
          <SnapshotRegistryList
            title="Modules"
            items={registries.modules.map((item) =>
              `${item.name} (${item.id})${formatMetaSuffix(item.updatedAt, item.changeNote, item.featureHighlights)}`
            )}
          />
          <SnapshotRegistryList
            title="Stores"
            items={registries.stores.map((item) => `${item.name} [${item.feature}]`)}
          />
          <SnapshotRegistryList
            title="Hooks"
            items={registries.hooks.map((item) => `${item.name} [${item.feature}]`)}
          />
          <SnapshotRegistryList
            title="External"
            items={registries.external.map((item) => `${item.label} (${item.path})`)}
            className="md:col-span-2 lg:col-span-3"
          />
        </div>
      </details>
    </div>
  );
}

function RegistryCountCard({ label, count }: RegistryCountCardProps) {
  return (
    <div className="rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2">
      <div className="text-xs text-neutral-500 dark:text-neutral-400">{label}</div>
      <div className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">{count}</div>
    </div>
  );
}

function SnapshotRegistryList({
  title,
  items,
  className = '',
}: {
  title: string;
  items: string[];
  className?: string;
}) {
  return (
    <div className={`space-y-1 ${className}`}>
      <h4 className="text-xs font-semibold uppercase text-neutral-500 dark:text-neutral-400">
        {title}
      </h4>
      <div className="max-h-36 overflow-y-auto rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/40 p-2 space-y-1">
        {items.length > 0 ? (
          items.map((item) => (
            <div key={`${title}:${item}`} className="text-xs text-neutral-700 dark:text-neutral-300">
              {item}
            </div>
          ))
        ) : (
          <div className="text-xs text-neutral-500 dark:text-neutral-400">No entries.</div>
        )}
      </div>
    </div>
  );
}

function formatMetaSuffix(
  updatedAt?: string,
  changeNote?: string,
  featureHighlights?: string[],
): string {
  const parts: string[] = [];
  if (updatedAt) {
    parts.push(updatedAt);
  }
  if (changeNote) {
    parts.push(changeNote);
  }
  if (featureHighlights && featureHighlights.length > 0) {
    parts.push(`highlights: ${featureHighlights.join('; ')}`);
  }
  return parts.length > 0 ? ` - ${parts.join(' | ')}` : '';
}

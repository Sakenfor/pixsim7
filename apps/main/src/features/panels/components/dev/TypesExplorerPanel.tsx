/**
 * Types Explorer Panel
 *
 * Browse generated types and runtime data:
 * - Composition Roles (runtime API)
 * - Region Labels (concepts API)
 * - OpenAPI info (type-only, metadata display)
 */

import { useState, useMemo } from 'react';

import { Icon } from '@lib/icons';

import { useCompositionPackages } from '@/stores/compositionPackageStore';
import { useLabelsForAutocomplete, type LabelSuggestion } from '@/stores/conceptStore';

// =============================================================================
// Types
// =============================================================================

type TabId = 'roles' | 'labels' | 'openapi';

interface TabConfig {
  id: TabId;
  label: string;
  count?: number;
}

// =============================================================================
// Composition Roles Tab
// =============================================================================

function CompositionRolesView({ searchQuery }: { searchQuery: string }) {
  const { roles, priority, slugToRole, namespaceToRole, isLoading } = useCompositionPackages();

  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['roles', 'slugs', 'namespaces'])
  );

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  const filteredRoles = useMemo(() => {
    if (!searchQuery.trim()) return roles;
    const q = searchQuery.toLowerCase();
    return roles.filter(
      (role) =>
        role.id.toLowerCase().includes(q) ||
        role.description?.toLowerCase().includes(q)
    );
  }, [searchQuery, roles]);

  const filteredSlugs = useMemo(() => {
    if (!searchQuery.trim()) return Object.entries(slugToRole);
    const q = searchQuery.toLowerCase();
    return Object.entries(slugToRole).filter(
      ([slug, role]) =>
        slug.toLowerCase().includes(q) || role.toLowerCase().includes(q)
    );
  }, [searchQuery, slugToRole]);

  const filteredNamespaces = useMemo(() => {
    if (!searchQuery.trim())
      return Object.entries(namespaceToRole);
    const q = searchQuery.toLowerCase();
    return Object.entries(namespaceToRole).filter(
      ([ns, role]) =>
        ns.toLowerCase().includes(q) || role.toLowerCase().includes(q)
    );
  }, [searchQuery, namespaceToRole]);

  const roleColorClasses: Record<string, string> = {
    blue: 'bg-blue-500',
    purple: 'bg-purple-500',
    green: 'bg-green-500',
    orange: 'bg-orange-500',
    pink: 'bg-pink-500',
    cyan: 'bg-cyan-500',
    amber: 'bg-amber-500',
  };

  if (isLoading) {
    return (
      <div className="p-4 text-neutral-400">Loading composition roles...</div>
    );
  }

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      {/* Canonical Roles */}
      <section>
        <button
          onClick={() => toggleSection('roles')}
          className="flex items-center gap-2 w-full text-left mb-2"
        >
          <Icon
            name={expandedSections.has('roles') ? 'chevronDown' : 'chevronRight'}
            size={14}
          />
          <h3 className="text-sm font-semibold text-neutral-300">
            Canonical Roles ({filteredRoles.length})
          </h3>
        </button>
        {expandedSections.has('roles') && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 ml-5">
            {filteredRoles.map((role) => (
              <div
                key={role.id}
                className="flex items-start gap-3 p-2 bg-neutral-800 rounded-md"
              >
                <div
                  className={`w-3 h-3 rounded-full mt-1 flex-shrink-0 ${
                    roleColorClasses[role.color] || 'bg-gray-500'
                  }`}
                />
                <div className="min-w-0">
                  <code className="text-xs font-mono text-emerald-400">
                    {role.id}
                  </code>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    {role.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Priority Order */}
      <section>
        <button
          onClick={() => toggleSection('priority')}
          className="flex items-center gap-2 w-full text-left mb-2"
        >
          <Icon
            name={
              expandedSections.has('priority') ? 'chevronDown' : 'chevronRight'
            }
            size={14}
          />
          <h3 className="text-sm font-semibold text-neutral-300">
            Priority Order (highest first)
          </h3>
        </button>
        {expandedSections.has('priority') && (
          <div className="ml-5 flex flex-wrap gap-1">
            {priority.map((roleId, idx) => (
              <span
                key={roleId}
                className="px-2 py-1 bg-neutral-800 rounded text-xs font-mono"
              >
                <span className="text-neutral-500">{idx + 1}.</span>{' '}
                <span className="text-emerald-400">{roleId}</span>
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Slug Mappings */}
      <section>
        <button
          onClick={() => toggleSection('slugs')}
          className="flex items-center gap-2 w-full text-left mb-2"
        >
          <Icon
            name={expandedSections.has('slugs') ? 'chevronDown' : 'chevronRight'}
            size={14}
          />
          <h3 className="text-sm font-semibold text-neutral-300">
            Slug Mappings ({filteredSlugs.length})
          </h3>
        </button>
        {expandedSections.has('slugs') && (
          <div className="ml-5 space-y-1 max-h-48 overflow-y-auto">
            {filteredSlugs.map(([slug, roleId]) => (
              <div
                key={slug}
                className="flex items-center gap-2 text-xs font-mono"
              >
                <code className="text-cyan-400">{slug}</code>
                <span className="text-neutral-600">→</span>
                <code className="text-emerald-400">{roleId}</code>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Namespace Mappings */}
      <section>
        <button
          onClick={() => toggleSection('namespaces')}
          className="flex items-center gap-2 w-full text-left mb-2"
        >
          <Icon
            name={
              expandedSections.has('namespaces')
                ? 'chevronDown'
                : 'chevronRight'
            }
            size={14}
          />
          <h3 className="text-sm font-semibold text-neutral-300">
            Namespace Mappings ({filteredNamespaces.length})
          </h3>
        </button>
        {expandedSections.has('namespaces') && (
          <div className="ml-5 space-y-1 max-h-48 overflow-y-auto">
            {filteredNamespaces.map(([ns, roleId]) => (
              <div
                key={ns}
                className="flex items-center gap-2 text-xs font-mono"
              >
                <code className="text-purple-400">{ns}:</code>
                <span className="text-neutral-600">→</span>
                <code className="text-emerald-400">{roleId}</code>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Source info */}
      <div className="text-xs text-neutral-500 border-t border-neutral-700 pt-3 mt-4">
        <p>
          Source:{' '}
          <code className="text-neutral-400">
            /api/v1/concepts/roles (runtime)
          </code>
        </p>
        <p className="mt-1 text-emerald-400/70">
          Data fetched from backend API (includes plugin roles)
        </p>
      </div>
    </div>
  );
}

// =============================================================================
// Region Labels Tab
// =============================================================================

const GROUP_COLOR_CLASSES = [
  'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  'bg-orange-500/20 text-orange-400 border-orange-500/30',
  'bg-purple-500/20 text-purple-400 border-purple-500/30',
  'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  'bg-pink-500/20 text-pink-400 border-pink-500/30',
  'bg-amber-500/20 text-amber-400 border-amber-500/30',
  'bg-lime-500/20 text-lime-400 border-lime-500/30',
];

function RegionLabelsView({
  searchQuery,
  labels,
  isLoading,
  error,
}: {
  searchQuery: string;
  labels: LabelSuggestion[];
  isLoading: boolean;
  error: string | null;
}) {
  const [selectedGroup, setSelectedGroup] = useState<string | 'all'>('all');

  const groups = useMemo(() => {
    const unique = new Set<string>();
    for (const label of labels) {
      unique.add(label.group);
    }
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [labels]);

  const labelCountByGroup = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const label of labels) {
      counts[label.group] = (counts[label.group] || 0) + 1;
    }
    return counts;
  }, [labels]);

  const filteredLabels = useMemo(() => {
    let results =
      selectedGroup === 'all'
        ? labels
        : labels.filter((label) => label.group === selectedGroup);

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      results = results.filter(
        (label) =>
          label.id.toLowerCase().includes(q) ||
          label.label.toLowerCase().includes(q)
      );
    }

    return results;
  }, [selectedGroup, searchQuery, labels]);

  const groupColors = useMemo(() => {
    const map: Record<string, string> = {};
    groups.forEach((group, index) => {
      map[group] = GROUP_COLOR_CLASSES[index % GROUP_COLOR_CLASSES.length];
    });
    return map;
  }, [groups]);

  if (isLoading) {
    return (
      <div className="p-4 text-neutral-400">Loading region labels...</div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-neutral-400">
        Failed to load region labels: {error}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Group filter tabs */}
      <div className="flex gap-1 p-3 border-b border-neutral-700 flex-wrap">
        <button
          onClick={() => setSelectedGroup('all')}
          className={`px-2 py-1 text-xs rounded transition-colors ${
            selectedGroup === 'all'
              ? 'bg-neutral-600 text-white'
              : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
          }`}
        >
          All ({labels.length})
        </button>
        {groups.map((group) => (
          <button
            key={group}
            onClick={() => setSelectedGroup(group)}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              selectedGroup === group
                ? 'bg-neutral-600 text-white'
                : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
            }`}
          >
            {group} ({labelCountByGroup[group] || 0})
          </button>
        ))}
      </div>

      {/* Labels grid */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {filteredLabels.map((label) => (
            <div
              key={`${label.group}-${label.id}`}
              className="flex items-center gap-2 p-2 bg-neutral-800 rounded-md"
            >
              <span
                className={`px-1.5 py-0.5 text-[10px] rounded border ${
                  groupColors[label.group]
                }`}
              >
                {label.group}
              </span>
              <div className="min-w-0 flex-1">
                <code className="text-xs font-mono text-emerald-400 block truncate">
                  {label.id}
                </code>
                <span className="text-xs text-neutral-400 block truncate">
                  {label.label}
                </span>
              </div>
            </div>
          ))}
        </div>

        {filteredLabels.length === 0 && (
          <div className="text-center py-8 text-neutral-500">
            {labels.length === 0 ? 'No labels available' : 'No labels match your search'}
          </div>
        )}
      </div>

      {/* Source info */}
      <div className="text-xs text-neutral-500 border-t border-neutral-700 p-3">
        <p>
          Source:{' '}
          <code className="text-neutral-400">
            /api/v1/concepts/{'{kind}'}
          </code>
        </p>
        <p className="mt-1">
          Fetched at runtime (kinds with include_in_labels enabled).
        </p>
      </div>
    </div>
  );
}

// =============================================================================
// OpenAPI Tab
// =============================================================================

function OpenAPIView() {
  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      <div className="bg-amber-900/20 border border-amber-700/30 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Icon name="alertTriangle" size={18} className="text-amber-400 mt-0.5" />
          <div>
            <h4 className="text-sm font-medium text-amber-300">
              Type-Only Export
            </h4>
            <p className="text-xs text-amber-200/70 mt-1">
              OpenAPI types are TypeScript-only and don't have runtime values.
              They can't be introspected at runtime like composition roles and
              concept labels.
            </p>
          </div>
        </div>
      </div>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-neutral-300">
          Available Type Exports
        </h3>
        <div className="space-y-2">
          <div className="p-3 bg-neutral-800 rounded-md">
            <code className="text-xs font-mono text-emerald-400">ApiPaths</code>
            <p className="text-xs text-neutral-400 mt-1">
              All API endpoint paths with their HTTP methods
            </p>
          </div>
          <div className="p-3 bg-neutral-800 rounded-md">
            <code className="text-xs font-mono text-emerald-400">
              ApiComponents
            </code>
            <p className="text-xs text-neutral-400 mt-1">
              Reusable schema components (request/response DTOs)
            </p>
          </div>
          <div className="p-3 bg-neutral-800 rounded-md">
            <code className="text-xs font-mono text-emerald-400">
              ApiOperations
            </code>
            <p className="text-xs text-neutral-400 mt-1">
              Operation definitions with parameters and responses
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-neutral-300">Usage Example</h3>
        <pre className="p-3 bg-neutral-800 rounded-md text-xs font-mono overflow-x-auto">
          <code className="text-neutral-300">
            {`import type { ApiComponents } from '@pixsim7/shared.types';

type AssetResponse = ApiComponents['schemas']['AssetResponse'];
type GenerationJob = ApiComponents['schemas']['GenerationJobResponse'];`}
          </code>
        </pre>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-neutral-300">
          Exploring OpenAPI Types
        </h3>
        <div className="space-y-2 text-xs text-neutral-400">
          <p>To explore the full OpenAPI schema:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>
              View the source file:{' '}
              <code className="text-neutral-300">
                packages/shared/types/src/openapi.generated.ts
              </code>
            </li>
            <li>
              Use your IDE's "Go to Definition" on{' '}
              <code className="text-neutral-300">ApiComponents</code>
            </li>
            <li>
              Visit the backend's{' '}
              <code className="text-neutral-300">/docs</code> endpoint for
              Swagger UI
            </li>
            <li>
              Fetch raw schema:{' '}
              <code className="text-neutral-300">/openapi.json</code>
            </li>
          </ul>
        </div>
      </section>

      {/* Source info */}
      <div className="text-xs text-neutral-500 border-t border-neutral-700 pt-3 mt-4">
        <p>
          Source:{' '}
          <code className="text-neutral-400">
            packages/shared/types/src/openapi.generated.ts
          </code>
        </p>
        <p className="mt-1">
          Regenerate: <code className="text-neutral-400">pnpm openapi:gen</code>
        </p>
        <p className="mt-1">
          File size: ~30,000 lines (paths, components, operations)
        </p>
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function TypesExplorerPanel() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<TabId>('roles');
  const { roles } = useCompositionPackages();
  const { labels, isLoading: labelsLoading, error: labelsError } = useLabelsForAutocomplete();

  const tabs: TabConfig[] = [
    { id: 'roles', label: 'Composition Roles', count: roles.length },
    { id: 'labels', label: 'Region Labels', count: labels.length },
    { id: 'openapi', label: 'OpenAPI' },
  ];

  return (
    <div className="flex flex-col h-full bg-neutral-900 text-neutral-100">
      {/* Header */}
      <div className="border-b border-neutral-700 p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold">Types Explorer</h2>
            <p className="text-xs text-neutral-400">
              Browse generated types from @pixsim7/shared.types
            </p>
          </div>
        </div>

        {/* Search (not for OpenAPI tab) */}
        {activeTab !== 'openapi' && (
          <input
            type="text"
            placeholder={`Search ${activeTab === 'roles' ? 'roles' : 'labels'}...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        )}

        {/* Tab Navigation */}
        <div className="flex gap-2 mt-3">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setSearchQuery('');
              }}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-emerald-600 text-white'
                  : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className="ml-1.5 text-xs opacity-70">({tab.count})</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'roles' && (
          <CompositionRolesView searchQuery={searchQuery} />
        )}
        {activeTab === 'labels' && (
          <RegionLabelsView
            searchQuery={searchQuery}
            labels={labels}
            isLoading={labelsLoading}
            error={labelsError}
          />
        )}
        {activeTab === 'openapi' && <OpenAPIView />}
      </div>
    </div>
  );
}

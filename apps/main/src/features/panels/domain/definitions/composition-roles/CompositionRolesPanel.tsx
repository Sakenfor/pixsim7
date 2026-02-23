/**
 * CompositionRolesPanel - Browse composition role hierarchy
 *
 * Left sidebar: collapsible group tree with clickable leaf roles.
 * Right detail: selected role metadata, tags, and inbound mappings.
 * Data is fetched from the backend API at runtime (supports plugin roles).
 */

import type { CompositionRoleDefinition } from '@pixsim7/shared.types';
import { useEffect, useMemo, useRef, useState } from 'react';

import { getTemplate, listBlockRoles, listTemplates, type BlockRoleSummary, type BlockTemplateDetail } from '@lib/api/blockTemplates';
import { Icon } from '@lib/icons';

import {
  SidebarTreeGroup,
  SidebarTreeLeafButton,
} from '@features/panels/components/shared/SidebarTree';
import { useWorkspaceStore } from '@features/workspace';


import { useCompositionPackages } from '@/stores/compositionPackageStore';

// ============================================================================
// Color utilities
// ============================================================================

const COLOR_BADGE: Record<string, string> = {
  blue: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  purple: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  green: 'bg-green-500/20 text-green-400 border-green-500/30',
  orange: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  pink: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  cyan: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  red: 'bg-red-500/20 text-red-400 border-red-500/30',
  yellow: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  gray: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  amber: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  slate: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
};

const COLOR_DOT: Record<string, string> = {
  blue: 'bg-blue-400',
  purple: 'bg-purple-400',
  green: 'bg-green-400',
  orange: 'bg-orange-400',
  pink: 'bg-pink-400',
  cyan: 'bg-cyan-400',
  red: 'bg-red-400',
  yellow: 'bg-yellow-400',
  gray: 'bg-gray-400',
  amber: 'bg-amber-400',
  slate: 'bg-slate-400',
};

const COLOR_TEXT: Record<string, string> = {
  blue: 'text-blue-400',
  purple: 'text-purple-400',
  green: 'text-green-400',
  orange: 'text-orange-400',
  pink: 'text-pink-400',
  cyan: 'text-cyan-400',
  red: 'text-red-400',
  yellow: 'text-yellow-400',
  gray: 'text-gray-400',
  amber: 'text-amber-400',
  slate: 'text-slate-400',
};

// ============================================================================
// Tree data
// ============================================================================

interface RoleGroup {
  group: CompositionRoleDefinition;
  leaves: CompositionRoleDefinition[];
}

interface RoleUsageTemplateMatch {
  id: string;
  name: string;
  slug: string;
  packageName: string | null | undefined;
  matchingSlots: Array<{
    slotIndex: number;
    label: string;
    category: string | null | undefined;
    packageName: string | null | undefined;
  }>;
}

interface RoleUsageSummary {
  loading: boolean;
  error: string | null;
  blockTotal: number;
  blockCategories: Array<{ category: string | null; count: number }>;
  templateCount: number;
  templates: RoleUsageTemplateMatch[];
}

function buildRoleTree(roles: CompositionRoleDefinition[]): {
  groups: RoleGroup[];
  ungrouped: CompositionRoleDefinition[];
} {
  const groupMap = new Map<string, CompositionRoleDefinition>();
  const childMap = new Map<string, CompositionRoleDefinition[]>();
  const ungrouped: CompositionRoleDefinition[] = [];

  for (const role of roles) {
    if (role.isGroup) {
      groupMap.set(role.id, role);
      if (!childMap.has(role.id)) childMap.set(role.id, []);
    }
  }

  for (const role of roles) {
    if (role.isGroup) continue;
    if (role.parent && childMap.has(role.parent)) {
      childMap.get(role.parent)!.push(role);
    } else {
      ungrouped.push(role);
    }
  }

  const groups: RoleGroup[] = [];
  for (const [groupId, group] of groupMap) {
    groups.push({ group, leaves: childMap.get(groupId) ?? [] });
  }

  return { groups, ungrouped };
}

// ============================================================================
// Detail pane
// ============================================================================

function DetailSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <h4 className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1.5">
        {label}
      </h4>
      {children}
    </div>
  );
}

function RoleDetail({
  role,
  priorityIndex,
  inboundSlugs,
  inboundNamespaces,
  packageName,
  usage,
  onOpenPromptLibraryForRole,
  onOpenPromptLibraryTemplate,
}: {
  role: CompositionRoleDefinition;
  priorityIndex: number | undefined;
  inboundSlugs: [string, string][];
  inboundNamespaces: [string, string][];
  packageName: string | null;
  usage?: RoleUsageSummary;
  onOpenPromptLibraryForRole?: (tab: 'templates' | 'blocks') => void;
  onOpenPromptLibraryTemplate?: (templateId: string) => void;
}) {
  const badgeClass = COLOR_BADGE[role.color] ?? COLOR_BADGE.gray;
  const textClass = COLOR_TEXT[role.color] ?? COLOR_TEXT.gray;

  return (
    <div className="p-4 space-y-0">
      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1">
          <span
            className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold border ${badgeClass}`}
          >
            {role.id}
          </span>
          {role.isGroup && (
            <span className="text-[10px] text-neutral-500 bg-neutral-800 px-1.5 py-0.5 rounded">
              group
            </span>
          )}
        </div>
        <p className="text-xs text-neutral-400 mt-2 leading-relaxed">
          {role.description}
        </p>
      </div>

      {/* Properties */}
      <DetailSection label="Properties">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
          <div className="text-neutral-500">Color</div>
          <div className={`font-medium ${textClass}`}>{role.color}</div>

          <div className="text-neutral-500">Layer</div>
          <div className="text-neutral-300">{role.defaultLayer ?? 0}</div>

          {role.parent && (
            <>
              <div className="text-neutral-500">Parent</div>
              <div className="text-neutral-300">{role.parent}</div>
            </>
          )}

          {priorityIndex != null && (
            <>
              <div className="text-neutral-500">Priority</div>
              <div className="text-neutral-300">#{priorityIndex}</div>
            </>
          )}

          {packageName && (
            <>
              <div className="text-neutral-500">Package</div>
              <div className="text-neutral-300">{packageName}</div>
            </>
          )}
        </div>
      </DetailSection>

      {/* Tags */}
      {role.tags && role.tags.length > 0 && (
        <DetailSection label="Tags">
          <div className="flex flex-wrap gap-1">
            {role.tags.map((tag) => (
              <span
                key={tag}
                className="px-1.5 py-0.5 rounded text-[10px] bg-neutral-800 text-neutral-400 border border-neutral-700/50"
              >
                {tag}
              </span>
            ))}
          </div>
        </DetailSection>
      )}

      {/* Inbound slug mappings */}
      {inboundSlugs.length > 0 && (
        <DetailSection label="Slug mappings">
          <div className="space-y-1">
            {inboundSlugs.map(([slug]) => (
              <div
                key={slug}
                className="flex items-center gap-2 text-[11px]"
              >
                <code className="text-neutral-300 font-mono bg-neutral-800 px-1.5 py-0.5 rounded">
                  {slug}
                </code>
                <Icon name="arrowRight" size={10} className="text-neutral-600 shrink-0" />
                <span className={textClass}>{role.id}</span>
              </div>
            ))}
          </div>
        </DetailSection>
      )}

      {/* Inbound namespace mappings */}
      {inboundNamespaces.length > 0 && (
        <DetailSection label="Namespace mappings">
          <div className="space-y-1">
            {inboundNamespaces.map(([ns]) => (
              <div
                key={ns}
                className="flex items-center gap-2 text-[11px]"
              >
                <code className="text-neutral-300 font-mono bg-neutral-800 px-1.5 py-0.5 rounded">
                  {ns}:*
                </code>
                <Icon name="arrowRight" size={10} className="text-neutral-600 shrink-0" />
                <span className={textClass}>{role.id}</span>
              </div>
            ))}
          </div>
        </DetailSection>
      )}

      <DetailSection label="Usage">
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => onOpenPromptLibraryForRole?.('templates')}
              className="text-[10px] px-2 py-0.5 rounded border border-neutral-700 hover:bg-neutral-800 text-neutral-300"
            >
              Open Prompt Library (Templates)
            </button>
            <button
              type="button"
              onClick={() => onOpenPromptLibraryForRole?.('blocks')}
              className="text-[10px] px-2 py-0.5 rounded border border-neutral-700 hover:bg-neutral-800 text-neutral-300"
            >
              Open Prompt Library (Blocks)
            </button>
          </div>
          {usage?.loading && (
            <div className="text-[11px] text-neutral-500">Loading usage…</div>
          )}
          {usage?.error && (
            <div className="text-[11px] text-red-400">{usage.error}</div>
          )}
          {!usage?.loading && !usage?.error && usage && (
            <>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                <div className="text-neutral-500">Blocks</div>
                <div className="text-neutral-300">{usage.blockTotal}</div>
                <div className="text-neutral-500">Templates</div>
                <div className="text-neutral-300">{usage.templateCount}</div>
              </div>

              {usage.blockCategories.length > 0 && (
                <div>
                  <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-1">Block categories</div>
                  <div className="flex flex-wrap gap-1">
                    {usage.blockCategories.slice(0, 8).map((row) => (
                      <span
                        key={row.category ?? 'default'}
                        className="px-1.5 py-0.5 rounded text-[10px] bg-neutral-800 text-neutral-300 border border-neutral-700/50"
                      >
                        {(row.category ?? 'default')}: {row.count}
                      </span>
                    ))}
                    {usage.blockCategories.length > 8 && (
                      <span className="text-[10px] text-neutral-500">
                        +{usage.blockCategories.length - 8} more
                      </span>
                    )}
                  </div>
                </div>
              )}

              {usage.templates.length > 0 && (
                <div>
                  <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-1">Templates using role</div>
                  <div className="space-y-1">
                    {usage.templates.slice(0, 6).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => onOpenPromptLibraryTemplate?.(t.id)}
                        className="w-full text-left p-2 rounded border border-neutral-700/60 hover:bg-neutral-800/50"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] text-neutral-200 truncate">{t.name}</span>
                          <span className="text-[10px] text-neutral-500 shrink-0">{t.matchingSlots.length} slot{t.matchingSlots.length === 1 ? '' : 's'}</span>
                        </div>
                        <div className="text-[10px] text-neutral-500 truncate">{t.slug}</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {t.matchingSlots.slice(0, 3).map((slot) => (
                            <span
                              key={`${t.id}:${slot.slotIndex}`}
                              className="px-1 py-0.5 rounded text-[9px] bg-neutral-800 text-neutral-400 border border-neutral-700/50"
                            >
                              {slot.label || `slot ${slot.slotIndex + 1}`}
                            </span>
                          ))}
                          {t.matchingSlots.length > 3 && (
                            <span className="text-[9px] text-neutral-500">+{t.matchingSlots.length - 3}</span>
                          )}
                        </div>
                      </button>
                    ))}
                    {usage.templates.length > 6 && (
                      <div className="text-[10px] text-neutral-500">+{usage.templates.length - 6} more templates</div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </DetailSection>
    </div>
  );
}

function EmptyDetail({ leafCount, groupCount }: { leafCount: number; groupCount: number }) {
  return (
    <div className="h-full flex items-center justify-center px-6">
      <div className="text-center">
        <p className="text-xs text-neutral-500">
          Select a role to view details
        </p>
        <p className="text-[10px] text-neutral-600 mt-1">
          {groupCount} groups, {leafCount} leaf roles
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// Search helpers
// ============================================================================

function matchesSearch(role: CompositionRoleDefinition, query: string): boolean {
  const q = query.toLowerCase();
  return (
    role.id.toLowerCase().includes(q) ||
    role.label.toLowerCase().includes(q) ||
    role.description.toLowerCase().includes(q)
  );
}

// ============================================================================
// Package filter bar
// ============================================================================

function PackageFilterBar({
  packageIds,
  packageLabels,
  activePackageIds,
  onToggle,
}: {
  packageIds: string[];
  packageLabels: Map<string, string>;
  activePackageIds: Set<string>;
  onToggle: (packageId: string) => void;
}) {
  if (packageIds.length <= 1) return null;

  return (
    <div className="flex items-center gap-1 px-3 py-1.5 border-b border-neutral-800 overflow-x-auto">
      {packageIds.map((pkgId) => {
        const isActive = activePackageIds.has(pkgId);
        return (
          <button
            key={pkgId}
            onClick={() => onToggle(pkgId)}
            className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
              isActive
                ? 'bg-neutral-700 text-neutral-200 border border-neutral-600'
                : 'bg-neutral-800/40 text-neutral-500 border border-neutral-800 hover:text-neutral-400'
            }`}
          >
            {packageLabels.get(pkgId) ?? pkgId}
          </button>
        );
      })}
    </div>
  );
}

// ============================================================================
// Main panel
// ============================================================================

interface CompositionRolesPanelProps {
  focusRoleId?: string;
  context?: Record<string, unknown>;
}

export function CompositionRolesPanel(props: CompositionRolesPanelProps = {}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activePackageIds, setActivePackageIds] = useState<Set<string> | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const templateDetailsCacheRef = useRef<Map<string, BlockTemplateDetail>>(new Map());
  const [allTemplateSummaries, setAllTemplateSummaries] = useState<Awaited<ReturnType<typeof listTemplates>> | null>(null);
  const [allBlockRoleSummaries, setAllBlockRoleSummaries] = useState<BlockRoleSummary[] | null>(null);
  const [roleUsageById, setRoleUsageById] = useState<Record<string, RoleUsageSummary>>({});
  const openFloatingPanel = useWorkspaceStore((s) => s.openFloatingPanel);
  const focusRoleIdFromContext =
    typeof props.context?.focusRoleId === 'string'
      ? props.context.focusRoleId
      : undefined;
  const focusRoleId = props.focusRoleId ?? focusRoleIdFromContext;

  const { roles, packages, priority, slugToRole, namespaceToRole, isLoading, error } =
    useCompositionPackages();

  // Build role → package mapping from packages data
  const roleToPackage = useMemo(() => {
    const map = new Map<string, string>();
    for (const pkg of packages) {
      for (const role of pkg.roles) {
        map.set(role.id, pkg.id);
      }
    }
    return map;
  }, [packages]);

  // Package metadata
  const packageIds = useMemo(() => packages.map((p) => p.id), [packages]);
  const packageLabels = useMemo(
    () => new Map(packages.map((p) => [p.id, p.label])),
    [packages],
  );

  // Effective active packages (null = all active)
  const effectiveActiveIds = useMemo(
    () => activePackageIds ?? new Set(packageIds),
    [activePackageIds, packageIds],
  );

  const handleTogglePackage = (pkgId: string) => {
    setActivePackageIds((prev) => {
      const current = prev ?? new Set(packageIds);
      const next = new Set(current);
      if (next.has(pkgId)) {
        next.delete(pkgId);
      } else {
        next.add(pkgId);
      }
      // If all are selected, reset to null (meaning "all")
      if (next.size === packageIds.length) return null;
      return next;
    });
  };

  // Filter roles by package and search
  const filteredRoles = useMemo(() => {
    let result = roles;

    // Package filter
    if (activePackageIds != null) {
      result = result.filter((r) => {
        const pkg = roleToPackage.get(r.id);
        // Keep roles that belong to an active package, or keep group roles if any of their children's packages are active
        if (pkg && activePackageIds.has(pkg)) return true;
        // For groups, keep if the group's own package is active
        if (r.isGroup) {
          // Group roles may not have their own package mapping — keep if any child's package matches
          return result.some(
            (child) => child.parent === r.id && roleToPackage.get(child.id) && activePackageIds.has(roleToPackage.get(child.id)!),
          );
        }
        return false;
      });
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.trim();
      const matchingIds = new Set<string>();
      const matchingParents = new Set<string>();

      for (const role of result) {
        if (role.isGroup) continue;
        if (matchesSearch(role, q)) {
          matchingIds.add(role.id);
          if (role.parent) matchingParents.add(role.parent);
        }
      }
      // Also check group roles themselves
      for (const role of result) {
        if (role.isGroup && matchesSearch(role, q)) {
          matchingParents.add(role.id);
          // Include all children of a matching group
          for (const child of result) {
            if (child.parent === role.id) matchingIds.add(child.id);
          }
        }
      }

      result = result.filter(
        (r) => matchingIds.has(r.id) || matchingParents.has(r.id),
      );
    }

    return result;
  }, [roles, activePackageIds, roleToPackage, searchQuery]);

  const { groups, ungrouped } = useMemo(() => buildRoleTree(filteredRoles), [filteredRoles]);

  // Priority lookup: role id → 1-based rank
  const priorityMap = useMemo(
    () => new Map(priority.map((id, i) => [id, i + 1])),
    [priority],
  );

  // Role lookup (from full roles for detail pane)
  const roleMap = useMemo(
    () => new Map(roles.map((r) => [r.id, r])),
    [roles],
  );

  const selectedRole = selectedId ? roleMap.get(selectedId) : undefined;

  useEffect(() => {
    if (!focusRoleId) return;
    if (selectedId === focusRoleId) return;
    setSelectedId(focusRoleId);
  }, [focusRoleId, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    if (roleUsageById[selectedId]?.loading || roleUsageById[selectedId]) return;

    let cancelled = false;
    setRoleUsageById((prev) => ({
      ...prev,
      [selectedId]: {
        loading: true,
        error: null,
        blockTotal: 0,
        blockCategories: [],
        templateCount: 0,
        templates: [],
      },
    }));

    void (async () => {
      try {
        let roleSummaries = allBlockRoleSummaries;
        if (!roleSummaries) {
          roleSummaries = await listBlockRoles();
          if (!cancelled) {
            setAllBlockRoleSummaries(roleSummaries);
          }
        }

        let templateSummaries = allTemplateSummaries;
        if (!templateSummaries) {
          templateSummaries = await listTemplates({ limit: 200 });
          if (!cancelled) {
            setAllTemplateSummaries(templateSummaries);
          }
        }

        const missing = templateSummaries.filter((t) => !templateDetailsCacheRef.current.has(t.id));
        for (const t of missing) {
          const detail = await getTemplate(t.id);
          templateDetailsCacheRef.current.set(t.id, detail);
        }

        const blockRows = (roleSummaries ?? []).filter((r) => (r.role ?? 'uncategorized') === selectedId);
        const blockTotal = blockRows.reduce((sum, r) => sum + (r.count ?? 0), 0);
        const blockCategories = blockRows
          .map((r) => ({ category: r.category ?? null, count: r.count ?? 0 }))
          .sort((a, b) => b.count - a.count || (a.category ?? '').localeCompare(b.category ?? ''));

        const templateMatches: RoleUsageTemplateMatch[] = [];
        for (const t of templateSummaries) {
          const detail = templateDetailsCacheRef.current.get(t.id);
          if (!detail) continue;
          const matchingSlots = (detail.slots ?? [])
            .map((slot, index) => ({ slot, index }))
            .filter(({ slot }) => slot.role === selectedId)
            .map(({ slot, index }) => ({
              slotIndex: slot.slot_index ?? index,
              label: slot.label ?? '',
              category: slot.category ?? null,
              packageName: slot.package_name ?? null,
            }));
          if (matchingSlots.length > 0) {
            templateMatches.push({
              id: detail.id,
              name: detail.name,
              slug: detail.slug,
              packageName: detail.package_name,
              matchingSlots,
            });
          }
        }

        if (!cancelled) {
          setRoleUsageById((prev) => ({
            ...prev,
            [selectedId]: {
              loading: false,
              error: null,
              blockTotal,
              blockCategories,
              templateCount: templateMatches.length,
              templates: templateMatches.sort((a, b) => a.name.localeCompare(b.name)),
            },
          }));
        }
      } catch (err) {
        if (!cancelled) {
          setRoleUsageById((prev) => ({
            ...prev,
            [selectedId]: {
              loading: false,
              error: err instanceof Error ? err.message : 'Failed to load role usage',
              blockTotal: 0,
              blockCategories: [],
              templateCount: 0,
              templates: [],
            },
          }));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [allBlockRoleSummaries, allTemplateSummaries, roleUsageById, selectedId]);

  const openPromptLibraryForRole = (roleId: string, tab: 'templates' | 'blocks') => {
    openFloatingPanel('prompt-library-inspector', {
      width: 1200,
      height: 760,
      context: {
        tab,
        focusRoleId: roleId,
      },
    });
  };

  const openPromptLibraryTemplate = (roleId: string, templateId: string) => {
    openFloatingPanel('prompt-library-inspector', {
      width: 1200,
      height: 760,
      context: {
        tab: 'templates',
        focusRoleId: roleId,
        focusTemplateId: templateId,
      },
    });
  };

  // Inbound mappings for selected role
  const inboundSlugs = useMemo(
    () =>
      selectedId
        ? Object.entries(slugToRole).filter(([, v]) => v === selectedId)
        : [],
    [slugToRole, selectedId],
  );
  const inboundNamespaces = useMemo(
    () =>
      selectedId
        ? Object.entries(namespaceToRole).filter(([, v]) => v === selectedId)
        : [],
    [namespaceToRole, selectedId],
  );

  const leafCount = filteredRoles.filter((r) => !r.isGroup).length;
  const totalLeafCount = roles.filter((r) => !r.isGroup).length;
  const isFiltered = searchQuery.trim() !== '' || activePackageIds != null;

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-neutral-900">
        <p className="text-sm text-neutral-400">Loading roles...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center bg-neutral-900">
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-neutral-900">
      {/* Package filter bar */}
      <PackageFilterBar
        packageIds={packageIds}
        packageLabels={packageLabels}
        activePackageIds={effectiveActiveIds}
        onToggle={handleTogglePackage}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar: role tree */}
        <div className="w-44 shrink-0 flex flex-col border-r border-neutral-800">
          {/* Search input */}
          <div className="px-1.5 py-1.5 border-b border-neutral-800">
            <div className="relative">
              <Icon
                name="search"
                size={11}
                className="absolute left-1.5 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none"
              />
              <input
                ref={searchRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter roles..."
                className="w-full bg-neutral-800/60 border border-neutral-700/50 rounded pl-6 pr-6 py-1 text-[11px] text-neutral-200 placeholder:text-neutral-600 outline-none focus:border-neutral-600 transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    searchRef.current?.focus();
                  }}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300"
                >
                  <Icon name="x" size={10} />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto py-1 px-1">
            {groups.map(({ group, leaves }) => {
              const dotClass = COLOR_DOT[group.color] ?? COLOR_DOT.gray;
              return (
                <SidebarTreeGroup
                  key={group.id}
                  label={group.label}
                  dotClassName={dotClass}
                  labelClassName="text-neutral-300"
                >
                  {leaves.map((role) => {
                    const leafName = role.id.includes(':')
                      ? role.id.split(':').pop()!
                      : role.id;
                    const pri = priorityMap.get(role.id);

                    return (
                      <SidebarTreeLeafButton
                        key={role.id}
                        label={leafName}
                        dotClassName={dotClass}
                        selected={role.id === selectedId}
                        onClick={() => setSelectedId(role.id)}
                        trailing={
                          pri != null ? (
                            <span className="text-[9px] text-neutral-600 tabular-nums shrink-0">
                              #{pri}
                            </span>
                          ) : undefined
                        }
                      />
                    );
                  })}
                </SidebarTreeGroup>
              );
            })}
            {ungrouped.length > 0 && (
              <div className="mt-1 px-2">
                <p className="text-[9px] text-neutral-600 uppercase tracking-wider mb-1">
                  Other
                </p>
                {ungrouped.map((role) => (
                  <button
                    key={role.id}
                    onClick={() => setSelectedId(role.id)}
                    className={`w-full text-left px-2 py-1 rounded text-[11px] transition-colors ${
                      role.id === selectedId
                        ? 'bg-neutral-700/80 text-neutral-100'
                        : 'text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200'
                    }`}
                  >
                    {role.id}
                  </button>
                ))}
              </div>
            )}
            {filteredRoles.length === 0 && (
              <div className="px-2 py-4 text-center">
                <p className="text-[10px] text-neutral-600">No roles match</p>
              </div>
            )}
          </div>

          {/* Footer count */}
          {isFiltered && (
            <div className="px-2 py-1 border-t border-neutral-800">
              <p className="text-[9px] text-neutral-600 text-center">
                {leafCount} / {totalLeafCount} roles
              </p>
            </div>
          )}
        </div>

        {/* Right detail pane */}
        <div className="flex-1 overflow-y-auto">
          {selectedRole ? (
            <RoleDetail
              role={selectedRole}
              priorityIndex={priorityMap.get(selectedRole.id)}
              inboundSlugs={inboundSlugs}
              inboundNamespaces={inboundNamespaces}
              packageName={packageLabels.get(roleToPackage.get(selectedRole.id) ?? '') ?? null}
              usage={roleUsageById[selectedRole.id]}
              onOpenPromptLibraryForRole={(tab) => openPromptLibraryForRole(selectedRole.id, tab)}
              onOpenPromptLibraryTemplate={(templateId) => openPromptLibraryTemplate(selectedRole.id, templateId)}
            />
          ) : (
            <EmptyDetail leafCount={leafCount} groupCount={groups.length} />
          )}
        </div>
      </div>
    </div>
  );
}

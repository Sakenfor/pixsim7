/**
 * CompositionRolesPanel - Browse composition role hierarchy
 *
 * Left sidebar: collapsible group tree with clickable leaf roles.
 * Right detail: selected role metadata, tags, and inbound mappings.
 * Data is fetched from the backend API at runtime (supports plugin roles).
 */

import { useMemo, useState } from 'react';

import type { RoleConceptResponse } from '@lib/api/concepts';
import { Icon } from '@lib/icons';

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
  group: RoleConceptResponse;
  leaves: RoleConceptResponse[];
}

function buildRoleTree(roles: RoleConceptResponse[]): {
  groups: RoleGroup[];
  ungrouped: RoleConceptResponse[];
} {
  const groupMap = new Map<string, RoleConceptResponse>();
  const childMap = new Map<string, RoleConceptResponse[]>();
  const ungrouped: RoleConceptResponse[] = [];

  for (const role of roles) {
    if (role.is_group) {
      groupMap.set(role.id, role);
      if (!childMap.has(role.id)) childMap.set(role.id, []);
    }
  }

  for (const role of roles) {
    if (role.is_group) continue;
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
// Sidebar tree
// ============================================================================

function SidebarGroupSection({
  group,
  leaves,
  selectedId,
  onSelect,
  priorityMap,
}: RoleGroup & {
  selectedId: string | null;
  onSelect: (id: string) => void;
  priorityMap: Map<string, number>;
}) {
  const [expanded, setExpanded] = useState(true);
  const dotClass = COLOR_DOT[group.color] ?? COLOR_DOT.gray;

  return (
    <div className="mb-0.5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-1.5 px-2 py-1 rounded hover:bg-neutral-800/60 transition-colors"
      >
        <Icon
          name={expanded ? 'chevronDown' : 'chevronRight'}
          size={10}
          className="text-neutral-500 shrink-0"
        />
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClass}`} />
        <span className="text-[11px] font-semibold text-neutral-300 uppercase tracking-wider truncate">
          {group.label}
        </span>
      </button>

      {expanded && (
        <div className="ml-3 mt-px">
          {leaves.map((role) => {
            const isSelected = role.id === selectedId;
            const leafName = role.id.includes(':')
              ? role.id.split(':').pop()!
              : role.id;
            const pri = priorityMap.get(role.id);

            return (
              <button
                key={role.id}
                onClick={() => onSelect(role.id)}
                className={`w-full flex items-center gap-1.5 px-2 py-1 rounded text-left transition-colors ${
                  isSelected
                    ? 'bg-neutral-700/80 text-neutral-100'
                    : 'text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200'
                }`}
              >
                <span className={`w-1 h-1 rounded-full shrink-0 ${dotClass}`} />
                <span className="text-[11px] truncate flex-1">{leafName}</span>
                {pri != null && (
                  <span className="text-[9px] text-neutral-600 tabular-nums shrink-0">
                    #{pri}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
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
}: {
  role: RoleConceptResponse;
  priorityIndex: number | undefined;
  inboundSlugs: [string, string][];
  inboundNamespaces: [string, string][];
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
          {role.is_group && (
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
          <div className="text-neutral-300">{role.default_layer ?? 0}</div>

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
// Main panel
// ============================================================================

export function CompositionRolesPanel() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { roles, priority, slugToRole, namespaceToRole, isLoading, error } =
    useCompositionPackages();

  const { groups, ungrouped } = useMemo(() => buildRoleTree(roles), [roles]);

  // Priority lookup: role id → 1-based rank
  const priorityMap = useMemo(
    () => new Map(priority.map((id, i) => [id, i + 1])),
    [priority],
  );

  // Role lookup
  const roleMap = useMemo(
    () => new Map(roles.map((r) => [r.id, r])),
    [roles],
  );

  const selectedRole = selectedId ? roleMap.get(selectedId) : undefined;

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

  const leafCount = roles.filter((r) => !r.is_group).length;

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
    <div className="h-full flex bg-neutral-900">
      {/* Left sidebar: role tree */}
      <div className="w-44 shrink-0 flex flex-col border-r border-neutral-800">
        <div className="px-2 py-2 border-b border-neutral-800">
          <h2 className="text-[11px] font-semibold text-neutral-300 uppercase tracking-wider">
            Roles
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto py-1 px-1">
          {groups.map(({ group, leaves }) => (
            <SidebarGroupSection
              key={group.id}
              group={group}
              leaves={leaves}
              selectedId={selectedId}
              onSelect={setSelectedId}
              priorityMap={priorityMap}
            />
          ))}
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
        </div>
      </div>

      {/* Right detail pane */}
      <div className="flex-1 overflow-y-auto">
        {selectedRole ? (
          <RoleDetail
            role={selectedRole}
            priorityIndex={priorityMap.get(selectedRole.id)}
            inboundSlugs={inboundSlugs}
            inboundNamespaces={inboundNamespaces}
          />
        ) : (
          <EmptyDetail leafCount={leafCount} groupCount={groups.length} />
        )}
      </div>
    </div>
  );
}

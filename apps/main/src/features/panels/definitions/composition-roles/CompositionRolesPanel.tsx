/**
 * CompositionRolesPanel - Browse composition role mappings
 *
 * Shows the canonical composition roles and their mappings from tags/namespaces.
 * Data is derived from the single source of truth: composition-roles.yaml
 */

import { useState } from 'react';
import {
  COMPOSITION_ROLES,
  SLUG_TO_COMPOSITION_ROLE,
  NAMESPACE_TO_COMPOSITION_ROLE,
  COMPOSITION_ROLE_PRIORITY,
  ROLE_DESCRIPTIONS,
  ROLE_COLORS,
  type ImageCompositionRole,
} from '@pixsim7/shared.types/composition-roles.generated';

type TabId = 'roles' | 'slugs' | 'namespaces' | 'priority';

// Map color names from YAML to tailwind classes
const COLOR_CLASSES: Record<string, string> = {
  blue: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  purple: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  green: 'bg-green-500/20 text-green-400 border-green-500/30',
  orange: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  pink: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  cyan: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  red: 'bg-red-500/20 text-red-400 border-red-500/30',
  yellow: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  gray: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

function getRoleColorClass(role: ImageCompositionRole): string {
  const colorName = ROLE_COLORS[role];
  return COLOR_CLASSES[colorName] ?? COLOR_CLASSES.gray;
}

function RoleBadge({ role }: { role: ImageCompositionRole }) {
  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ${getRoleColorClass(role)}`}
    >
      {role}
    </span>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
        active
          ? 'bg-neutral-700 text-white'
          : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'
      }`}
    >
      {children}
    </button>
  );
}

function RolesTab() {
  return (
    <div className="space-y-2">
      {COMPOSITION_ROLES.map((role) => (
        <div
          key={role}
          className="p-3 rounded-lg bg-neutral-800/50 border border-neutral-700/50"
        >
          <div className="flex items-center gap-2 mb-1">
            <RoleBadge role={role} />
          </div>
          <p className="text-xs text-neutral-400">{ROLE_DESCRIPTIONS[role]}</p>
        </div>
      ))}
    </div>
  );
}

function SlugsTab() {
  const entries = Object.entries(SLUG_TO_COMPOSITION_ROLE);
  return (
    <div className="space-y-1">
      {entries.map(([slug, role]) => (
        <div
          key={slug}
          className="flex items-center justify-between p-2 rounded bg-neutral-800/30 hover:bg-neutral-800/50"
        >
          <code className="text-xs text-neutral-300 font-mono">{slug}</code>
          <RoleBadge role={role} />
        </div>
      ))}
      {entries.length === 0 && (
        <p className="text-xs text-neutral-500 text-center py-4">
          No slug mappings defined
        </p>
      )}
    </div>
  );
}

function NamespacesTab() {
  const entries = Object.entries(NAMESPACE_TO_COMPOSITION_ROLE);
  return (
    <div className="space-y-1">
      <p className="text-xs text-neutral-500 mb-3">
        Tags like <code className="text-neutral-400">namespace:value</code> use the namespace prefix to infer role.
      </p>
      {entries.map(([namespace, role]) => (
        <div
          key={namespace}
          className="flex items-center justify-between p-2 rounded bg-neutral-800/30 hover:bg-neutral-800/50"
        >
          <code className="text-xs text-neutral-300 font-mono">{namespace}:*</code>
          <RoleBadge role={role} />
        </div>
      ))}
    </div>
  );
}

function PriorityTab() {
  return (
    <div className="space-y-1">
      <p className="text-xs text-neutral-500 mb-3">
        When an asset has multiple tags mapping to different roles, the highest priority role wins.
      </p>
      {COMPOSITION_ROLE_PRIORITY.map((role, index) => (
        <div
          key={role}
          className="flex items-center gap-3 p-2 rounded bg-neutral-800/30"
        >
          <span className="w-6 h-6 flex items-center justify-center rounded-full bg-neutral-700 text-xs text-neutral-300 font-medium">
            {index + 1}
          </span>
          <RoleBadge role={role} />
        </div>
      ))}
    </div>
  );
}

export function CompositionRolesPanel() {
  const [activeTab, setActiveTab] = useState<TabId>('roles');

  return (
    <div className="h-full flex flex-col bg-neutral-900">
      {/* Header */}
      <div className="px-3 py-2 border-b border-neutral-800">
        <h2 className="text-sm font-medium text-neutral-200">Composition Roles</h2>
        <p className="text-xs text-neutral-500 mt-0.5">
          Tag → role mappings from composition-roles.yaml
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-3 py-2 border-b border-neutral-800">
        <TabButton active={activeTab === 'roles'} onClick={() => setActiveTab('roles')}>
          Roles ({COMPOSITION_ROLES.length})
        </TabButton>
        <TabButton active={activeTab === 'slugs'} onClick={() => setActiveTab('slugs')}>
          Slugs ({Object.keys(SLUG_TO_COMPOSITION_ROLE).length})
        </TabButton>
        <TabButton active={activeTab === 'namespaces'} onClick={() => setActiveTab('namespaces')}>
          Namespaces ({Object.keys(NAMESPACE_TO_COMPOSITION_ROLE).length})
        </TabButton>
        <TabButton active={activeTab === 'priority'} onClick={() => setActiveTab('priority')}>
          Priority
        </TabButton>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {activeTab === 'roles' && <RolesTab />}
        {activeTab === 'slugs' && <SlugsTab />}
        {activeTab === 'namespaces' && <NamespacesTab />}
        {activeTab === 'priority' && <PriorityTab />}
      </div>
    </div>
  );
}

import { Button, Panel, Badge } from '@pixsim7/shared.ui';
import { useState } from 'react';


import { isAdminUser } from '@lib/auth/userRoles';
import { Icon } from '@lib/icons';

import { useAuthStore } from '@/stores/authStore';

import { type AppActionPreset, type PresetStats } from '../types';

interface PresetCardProps {
  preset: AppActionPreset;
  /** Live usage signals (refs + runs). May be undefined while stats are
   *  loading or if the stats endpoint failed — the card renders zeros. */
  stats?: PresetStats;
  onEdit?: (preset: AppActionPreset) => void;
  onDelete?: (preset: AppActionPreset) => void;
  onRun?: (preset: AppActionPreset) => void;
  onCopy?: (preset: AppActionPreset) => void;
}

/** Compact relative-time formatter for "last run" without pulling in date-fns
 *  for one usage. Falls back to the absolute date for anything older than a
 *  week so the card stays scannable. */
function formatLastRun(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const diffMs = Date.now() - then;
  if (diffMs < 0) return 'just now';
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

// Get preset type info (icon, label, colors)
function getPresetTypeInfo(preset: AppActionPreset) {
  const isSnippet = preset.category?.toLowerCase() === 'snippet';

  if (isSnippet) {
    return {
      icon: '📦',
      label: 'Snippet',
      bgColor: 'bg-green-100 dark:bg-green-900/30',
      textColor: 'text-green-700 dark:text-green-300',
      borderColor: 'border-green-200 dark:border-green-800',
    };
  }
  if (preset.is_system) {
    return {
      icon: '⚙️',
      label: 'System',
      bgColor: 'bg-purple-100 dark:bg-purple-900/30',
      textColor: 'text-purple-700 dark:text-purple-300',
      borderColor: 'border-purple-200 dark:border-purple-800',
    };
  }
  if (preset.is_shared) {
    return {
      icon: '👥',
      label: 'Shared',
      bgColor: 'bg-blue-100 dark:bg-blue-900/30',
      textColor: 'text-blue-700 dark:text-blue-300',
      borderColor: 'border-blue-200 dark:border-blue-800',
    };
  }
  return {
    icon: '👤',
    label: 'My Preset',
    bgColor: 'bg-gray-100 dark:bg-gray-800',
    textColor: 'text-gray-700 dark:text-gray-300',
    borderColor: 'border-gray-200 dark:border-gray-700',
  };
}

export function PresetCard({ preset, stats, onEdit, onDelete, onRun, onCopy }: PresetCardProps) {
  const isSnippet = preset.category?.toLowerCase() === 'snippet';
  const typeInfo = getPresetTypeInfo(preset);

  const refs = stats?.referenced_by ?? [];
  const runCount = stats?.run_count ?? 0;
  const lastRun = formatLastRun(stats?.last_run_at);
  const [refsExpanded, setRefsExpanded] = useState(false);
  const canExpandRefs = refs.length > 0;

  // Admins can edit/delete system presets in-place; everyone else has to
  // copy first. Pulled directly from the auth store to avoid prop-drilling.
  const currentUser = useAuthStore((s) => s.user);
  const isAdmin = isAdminUser(currentUser);
  const canEdit = !preset.is_system || isAdmin;
  const canDelete = !preset.is_system || isAdmin;

  return (
    <Panel className="space-y-3 relative">
      {/* Type Icon - Top Left */}
      <div
        className={`absolute -top-2 -left-2 w-8 h-8 rounded-full flex items-center justify-center text-base shadow-sm border ${typeInfo.bgColor} ${typeInfo.borderColor}`}
        title={typeInfo.label}
      >
        <Icon name={typeInfo.icon} size={14} />
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-2 pl-6">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate">
            {preset.name}
          </h3>
          {preset.description && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
              {preset.description}
            </p>
          )}
        </div>

        {/* Category Badge */}
        {preset.category && !isSnippet && (
          <Badge color="gray">{preset.category}</Badge>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 text-sm">
        <div>
          <span className="text-gray-500 dark:text-gray-400">Actions:</span>
          <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
            {preset.actions.length}
          </span>
        </div>
        <div>
          {/* Refs = static reverse-lookup over actions JSON. Click to expand
              when there's anything to show; otherwise rendered as plain text
              so a "0 refs" preset doesn't look interactive. */}
          {canExpandRefs ? (
            <button
              type="button"
              onClick={() => setRefsExpanded((v) => !v)}
              className="text-left hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              title={`Called by ${refs.length} other preset${refs.length === 1 ? '' : 's'} — click to ${refsExpanded ? 'hide' : 'show'}`}
            >
              <span className="text-gray-500 dark:text-gray-400">Refs:</span>
              <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
                {refs.length} {refsExpanded ? '▾' : '▸'}
              </span>
            </button>
          ) : (
            <span title="No other presets call this one via Call Preset">
              <span className="text-gray-500 dark:text-gray-400">Refs:</span>
              <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">0</span>
            </span>
          )}
        </div>
        <div title="Direct top-level executions. Nested call_preset invocations are not counted here.">
          <span className="text-gray-500 dark:text-gray-400">Runs:</span>
          <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
            {runCount}
          </span>
        </div>
      </div>

      {refsExpanded && refs.length > 0 && (
        <div className="text-xs text-gray-600 dark:text-gray-400 pl-1 border-l-2 border-blue-300 dark:border-blue-700 space-y-0.5">
          <div className="text-gray-500 dark:text-gray-500 mb-1">Called by:</div>
          {refs.map((r) => (
            <div key={r.id} className="truncate" title={r.name}>
              · {r.name}
            </div>
          ))}
        </div>
      )}

      {lastRun && (
        <div className="text-xs text-gray-500 dark:text-gray-400">
          Last run: {lastRun}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
        {onRun && !isSnippet && (
          <Button
            size="sm"
            variant="primary"
            onClick={() => onRun(preset)}
            className="flex-1"
          >
            ▶️ Run
          </Button>
        )}
        {onCopy && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onCopy(preset)}
            title="Copy this preset to create an editable version"
          >
            📋 Copy
          </Button>
        )}
        {onEdit && canEdit && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onEdit(preset)}
            title={preset.is_system ? 'Edit system preset (admin)' : 'Edit preset'}
          >
            ✏️ Edit
          </Button>
        )}
        {onDelete && canDelete && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onDelete(preset)}
            className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
            title={preset.is_system ? 'Delete system preset (admin)' : 'Delete preset'}
          >
            🗑️
          </Button>
        )}
      </div>
    </Panel>
  );
}

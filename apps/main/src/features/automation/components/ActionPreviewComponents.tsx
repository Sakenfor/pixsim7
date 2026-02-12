import { useState, useEffect } from 'react';

import { automationService } from '@features/automation';

import { type ActionDefinition, ActionType, type AppActionPreset } from '../types';

import { getActionMeta, getActionSummary } from './actionHelpers';

// Cache for preset previews to avoid repeated fetches
const presetCache = new Map<number, AppActionPreset>();

// Summary component for call_preset with hover preview
export function CallPresetSummary({ action }: { action: ActionDefinition }) {
  const [showPreview, setShowPreview] = useState(false);
  const presetId = action.params?.preset_id;
  const cached = presetCache.get(presetId);

  return (
    <div
      className="relative text-xs text-gray-500 dark:text-gray-400 mt-1 cursor-help"
      onMouseEnter={() => setShowPreview(true)}
      onMouseLeave={() => setShowPreview(false)}
    >
      <span className="underline decoration-dotted">
        📦 {cached?.name || `Preset #${presetId}`}
        {cached && ` (${cached.actions.length} actions)`}
      </span>
      {showPreview && presetId && <CallPresetPreview presetId={presetId} />}
    </div>
  );
}

// Get a short condition summary for IF actions
function getConditionSummary(action: ActionDefinition): string {
  const params = action.params || {};
  const parts: string[] = [];
  if (params.resource_id) parts.push(`id:${params.resource_id.split('/').pop()}`);
  if (params.text) parts.push(`"${params.text.slice(0, 15)}${params.text.length > 15 ? '…' : ''}"`);
  if (params.content_desc) parts.push(`desc:"${params.content_desc.slice(0, 15)}"`);
  return parts.length > 0 ? parts.join(' ') : 'no selector';
}

// Recursive action preview renderer
export function ActionPreviewItem({ action, depth = 0 }: { action: ActionDefinition; depth?: number }) {
  const meta = getActionMeta(action.type);
  const hasNested = action.params?.actions?.length > 0;
  const hasElse = action.params?.else_actions?.length > 0;
  const isConditional = action.type === ActionType.IF_ELEMENT_EXISTS || action.type === ActionType.IF_ELEMENT_NOT_EXISTS;

  return (
    <>
      <div
        className="flex items-center gap-1 text-gray-300"
        style={{ paddingLeft: `${depth * 12}px` }}
      >
        <span>{meta.icon}</span>
        <span className="truncate">{meta.label}</span>
        {/* Show condition for IF actions, or summary for non-nested actions */}
        {isConditional ? (
          <span className="text-purple-400 truncate text-[10px]">[{getConditionSummary(action)}]</span>
        ) : !hasNested && !hasElse ? (
          <span className="text-gray-500 truncate">{getActionSummary(action)}</span>
        ) : null}
      </div>
      {hasNested && (
        <>
          <div className="text-green-400 text-[10px]" style={{ paddingLeft: `${(depth + 1) * 12}px` }}>
            ↳ then:
          </div>
          {action.params.actions.slice(0, 3).map((nested: ActionDefinition, i: number) => (
            <ActionPreviewItem key={`then-${i}`} action={nested} depth={depth + 1} />
          ))}
          {action.params.actions.length > 3 && (
            <div className="text-gray-500" style={{ paddingLeft: `${(depth + 1) * 12}px` }}>
              +{action.params.actions.length - 3} more...
            </div>
          )}
        </>
      )}
      {hasElse && (
        <>
          <div className="text-orange-400 text-[10px]" style={{ paddingLeft: `${(depth + 1) * 12}px` }}>
            ↳ else:
          </div>
          {action.params.else_actions.slice(0, 3).map((nested: ActionDefinition, i: number) => (
            <ActionPreviewItem key={`else-${i}`} action={nested} depth={depth + 1} />
          ))}
          {action.params.else_actions.length > 3 && (
            <div className="text-gray-500" style={{ paddingLeft: `${(depth + 1) * 12}px` }}>
              +{action.params.else_actions.length - 3} more...
            </div>
          )}
        </>
      )}
    </>
  );
}

// Component to show preset preview on hover
export function CallPresetPreview({ presetId }: { presetId: number }) {
  const [preset, setPreset] = useState<AppActionPreset | null>(presetCache.get(presetId) || null);
  const [loading, setLoading] = useState(!presetCache.has(presetId));

  useEffect(() => {
    if (presetCache.has(presetId)) {
      setPreset(presetCache.get(presetId)!);
      setLoading(false);
      return;
    }

    automationService.getPresets()
      .then((presets) => {
        const found = presets.find(p => p.id === presetId);
        if (found) {
          presetCache.set(presetId, found);
          setPreset(found);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [presetId]);

  if (loading) {
    return (
      <div className="absolute z-50 left-0 top-full mt-1 p-2 bg-gray-900 text-white text-xs rounded shadow-lg min-w-48">
        Loading...
      </div>
    );
  }

  if (!preset) {
    return (
      <div className="absolute z-50 left-0 top-full mt-1 p-2 bg-gray-900 text-white text-xs rounded shadow-lg min-w-48">
        Preset #{presetId} not found
      </div>
    );
  }

  return (
    <div className="absolute z-50 left-0 top-full mt-1 p-2 bg-gray-900 text-white text-xs rounded shadow-lg min-w-64 max-w-80">
      <div className="font-medium text-sm mb-1">{preset.name}</div>
      {preset.description && (
        <div className="text-gray-400 mb-2">{preset.description}</div>
      )}
      <div className="text-gray-400 mb-1">{preset.actions.length} action(s):</div>
      <div className="space-y-0.5 max-h-60 overflow-y-auto">
        {preset.actions.slice(0, 10).map((action, i) => (
          <ActionPreviewItem key={i} action={action} />
        ))}
        {preset.actions.length > 10 && (
          <div className="text-gray-500">+{preset.actions.length - 10} more...</div>
        )}
      </div>
    </div>
  );
}

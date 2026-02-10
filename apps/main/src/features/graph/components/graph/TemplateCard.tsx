import { Button } from '@pixsim7/shared.ui';

import type { DraftScene } from '@domain/sceneBuilder';

import {
  validateTemplate,
  validatePreconditions,
} from '../../lib/editor/graphTemplates';
import type { GraphTemplate } from '../../lib/editor/graphTemplates';

import { getSourceBadge } from './templatePaletteUtils';

export interface TemplateCardProps {
  template: GraphTemplate;
  currentScene?: DraftScene | null;
  isExpanded: boolean;
  isEditing: boolean;
  editName: string;
  editDescription: string;
  isReadOnly: boolean;
  onToggleExpanded: (templateId: string) => void;
  onToggleFavorite: (template: GraphTemplate) => void;
  onInsert: (template: GraphTemplate) => void;
  onExport: (template: GraphTemplate) => void;
  onStartEdit: (template: GraphTemplate) => void;
  onDelete: (template: GraphTemplate) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onEditNameChange: (value: string) => void;
  onEditDescriptionChange: (value: string) => void;
}

export function TemplateCard({
  template,
  currentScene,
  isExpanded,
  isEditing,
  editName,
  editDescription,
  isReadOnly,
  onToggleExpanded,
  onToggleFavorite,
  onInsert,
  onExport,
  onStartEdit,
  onDelete,
  onSaveEdit,
  onCancelEdit,
  onEditNameChange,
  onEditDescriptionChange,
}: TemplateCardProps) {
  const validation = validateTemplate(template);

  // Phase 8: Validate preconditions against current scene
  const preconditionCheck = currentScene
    ? validatePreconditions(template, currentScene)
    : { compatible: true, errors: [], warnings: [] };

  const sourceBadge = getSourceBadge(template);

  return (
    <div
      className="border border-neutral-300 dark:border-neutral-600 rounded-lg overflow-hidden bg-white dark:bg-neutral-800"
    >
      {/* Template Header */}
      <div className="p-3">
        {/* Phase 8: Preview image */}
        {template.preview && !isEditing && (
          <div className="mb-2 flex justify-center">
            <img
              src={template.preview}
              alt={`${template.name} preview`}
              className="max-w-full h-auto rounded border border-neutral-200 dark:border-neutral-700"
            />
          </div>
        )}

        {/* Phase 6: Edit mode */}
        {isEditing ? (
          <div className="space-y-2">
            <input
              type="text"
              value={editName}
              onChange={(e) => onEditNameChange(e.target.value)}
              placeholder="Template name"
              className="w-full px-2 py-1 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
            />
            <textarea
              value={editDescription}
              onChange={(e) => onEditDescriptionChange(e.target.value)}
              placeholder="Description (optional)"
              rows={2}
              className="w-full px-2 py-1 text-xs border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
            />
            <div className="flex gap-2">
              <Button size="sm" variant="primary" onClick={onSaveEdit}>
                Save
              </Button>
              <Button size="sm" variant="secondary" onClick={onCancelEdit}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  {/* Phase 6: Favorite star button */}
                  {!isReadOnly && (
                    <button
                      onClick={() => onToggleFavorite(template)}
                      className="text-lg hover:scale-110 transition-transform"
                      title={template.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                    >
                      {template.isFavorite ? '⭐' : '☆'}
                    </button>
                  )}
                  <div className="font-semibold text-sm truncate" title={template.name}>
                    {template.name}
                  </div>
                  <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${sourceBadge.className}`}>
                    {sourceBadge.label}
                  </span>
                  {/* Phase 7: Category badge */}
                  {template.category && (
                    <span className="px-1.5 py-0.5 text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 rounded">
                      {template.category}
                    </span>
                  )}
                </div>
                {template.description && (
                  <div className="text-xs text-neutral-600 dark:text-neutral-400 mt-1 line-clamp-2">
                    {template.description}
                  </div>
                )}
                {/* Phase 7: Tags */}
                {template.tags && template.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {template.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-1.5 py-0.5 text-xs bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 rounded"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={() => onToggleExpanded(template.id)}
                className="text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 text-xs"
                title={isExpanded ? 'Collapse' : 'Expand'}
              >
                {isExpanded ? '▼' : '▶'}
              </button>
            </div>
          </>
        )}

        {/* Template Stats */}
        <div className="flex items-center gap-3 text-xs text-neutral-500 dark:text-neutral-400 mb-2">
          <span>
            {template.data.nodes.length} node{template.data.nodes.length !== 1 ? 's' : ''}
          </span>
          <span>•</span>
          <span>
            {template.data.edges.length} edge{template.data.edges.length !== 1 ? 's' : ''}
          </span>
          <span>•</span>
          <span title={new Date(template.createdAt).toLocaleString()}>
            {new Date(template.createdAt).toLocaleDateString()}
          </span>
        </div>

        {/* Validation Warnings */}
        {validation.warnings.length > 0 && (
          <div className="mb-2 p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded text-xs text-amber-800 dark:text-amber-200">
            ⚠ {validation.warnings.join('; ')}
          </div>
        )}

        {/* Phase 8: Precondition Errors */}
        {preconditionCheck.errors.length > 0 && (
          <div className="mb-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded text-xs text-red-800 dark:text-red-200">
            <div className="font-semibold mb-1">❌ Incompatible with current scene</div>
            {preconditionCheck.errors.map((err, i) => (
              <div key={i}>• {err}</div>
            ))}
          </div>
        )}

        {/* Phase 8: Precondition Warnings */}
        {preconditionCheck.warnings.length > 0 && preconditionCheck.errors.length === 0 && (
          <div className="mb-2 p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded text-xs text-amber-800 dark:text-amber-200">
            <div className="font-semibold mb-1">⚠ Compatibility warnings</div>
            {preconditionCheck.warnings.map((warn, i) => (
              <div key={i}>• {warn}</div>
            ))}
          </div>
        )}

        {/* Action Buttons */}
        {!isEditing && (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="primary"
              onClick={() => onInsert(template)}
              disabled={!validation.valid || !preconditionCheck.compatible}
              className="flex-1"
              title={
                !preconditionCheck.compatible
                  ? 'Template is incompatible with current scene'
                  : !validation.valid
                  ? 'Template has validation errors'
                  : 'Insert template into scene'
              }
            >
              ➕ Insert
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onExport(template)}
              className="px-3"
              title="Export template to JSON"
            >
              ↓
            </Button>
            {!isReadOnly && (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => onStartEdit(template)}
                  className="px-3"
                  title="Edit template"
                >
                  ✏️
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => onDelete(template)}
                  className="px-3"
                  title="Delete template"
                >
                  🗑
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="border-t border-neutral-200 dark:border-neutral-700 p-3 bg-neutral-50 dark:bg-neutral-900/50">
          <div className="text-xs space-y-2">
            {/* Node Types */}
            <div>
              <div className="font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Node Types:
              </div>
              <div className="flex flex-wrap gap-1">
                {template.nodeTypes.map((type) => (
                  <span
                    key={type}
                    className="px-2 py-0.5 bg-neutral-200 dark:bg-neutral-700 rounded text-neutral-700 dark:text-neutral-300"
                  >
                    {type}
                  </span>
                ))}
              </div>
            </div>

            {/* Node List */}
            <div>
              <div className="font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Nodes:
              </div>
              <div className="space-y-1">
                {template.data.nodes.map((node) => (
                  <div
                    key={node.id}
                    className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400"
                  >
                    <span className="font-mono text-xs">{node.id}</span>
                    <span className="text-neutral-400">•</span>
                    <span>{node.type}</span>
                    {node.metadata?.label && (
                      <>
                        <span className="text-neutral-400">-</span>
                        <span className="truncate">{node.metadata.label}</span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

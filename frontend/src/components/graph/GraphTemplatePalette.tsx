import { useState, useEffect } from 'react';
import { Button } from '@pixsim7/ui';
import { useTemplateStore } from '../../lib/graph/templatesStore';
import { validateTemplate, type TemplateCategory } from '../../lib/graph/graphTemplates';
import type { GraphTemplate } from '../../lib/graph/graphTemplates';

// Available categories for filtering
const TEMPLATE_CATEGORIES: (TemplateCategory | 'All')[] = [
  'All',
  'Quest Flow',
  'Dialogue Branch',
  'Combat',
  'Minigame',
  'Relationship',
  'Condition Check',
  'Other',
];

interface GraphTemplatePaletteProps {
  /** Callback when a template is selected to be inserted */
  onInsertTemplate: (template: GraphTemplate) => void;

  /** Current world ID for loading world templates */
  worldId?: number | null;

  /** Compact mode for smaller display */
  compact?: boolean;
}

/**
 * Export a template to a JSON file
 */
function exportTemplate(template: GraphTemplate): void {
  const filename = `graph-template-${template.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.json`;
  const jsonString = JSON.stringify(template, null, 2);

  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Validate that an imported object is a valid GraphTemplate
 */
function isValidTemplateJSON(obj: any): obj is GraphTemplate {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.createdAt === 'number' &&
    Array.isArray(obj.nodeTypes) &&
    typeof obj.data === 'object' &&
    Array.isArray(obj.data.nodes) &&
    Array.isArray(obj.data.edges)
  );
}

export function GraphTemplatePalette({
  onInsertTemplate,
  worldId,
  compact = false,
}: GraphTemplatePaletteProps) {
  const templates = useTemplateStore((state) => state.getTemplates(worldId));
  const addTemplate = useTemplateStore((state) => state.addTemplate);
  const updateTemplate = useTemplateStore((state) => state.updateTemplate);
  const removeTemplate = useTemplateStore((state) => state.removeTemplate);
  const toggleFavorite = useTemplateStore((state) => state.toggleFavorite);
  const loadWorldTemplates = useTemplateStore((state) => state.loadWorldTemplates);

  const [expandedTemplateId, setExpandedTemplateId] = useState<string | null>(null);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');

  // Phase 6 & 7: Filtering state
  const [selectedCategory, setSelectedCategory] = useState<TemplateCategory | 'All'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  // Load world templates when world changes
  useEffect(() => {
    if (worldId !== null && worldId !== undefined) {
      loadWorldTemplates(worldId);
    }
  }, [worldId, loadWorldTemplates]);

  // Phase 6 & 7: Filter templates
  const filteredTemplates = templates.filter((template) => {
    // Phase 6: Favorites filter
    if (showFavoritesOnly && !template.isFavorite) {
      return false;
    }

    // Category filter
    if (selectedCategory !== 'All' && template.category !== selectedCategory) {
      return false;
    }

    // Search filter (name, description, tags)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const matchesName = template.name.toLowerCase().includes(query);
      const matchesDescription = template.description?.toLowerCase().includes(query);
      const matchesTags = template.tags?.some((tag) => tag.toLowerCase().includes(query));

      if (!matchesName && !matchesDescription && !matchesTags) {
        return false;
      }
    }

    return true;
  });

  // Phase 6: Separate favorites for quick access
  const favoriteTemplates = filteredTemplates.filter((t) => t.isFavorite);
  const nonFavoriteTemplates = filteredTemplates.filter((t) => !t.isFavorite);

  const handleInsert = (template: GraphTemplate) => {
    onInsertTemplate(template);
  };

  // Phase 6: Rename/edit handlers
  const handleStartEdit = (template: GraphTemplate) => {
    if (template.source === 'builtin') {
      alert('Cannot edit built-in templates');
      return;
    }

    setEditingTemplateId(template.id);
    setEditName(template.name);
    setEditDescription(template.description || '');
  };

  const handleSaveEdit = async () => {
    if (!editingTemplateId) return;

    try {
      await updateTemplate(editingTemplateId, {
        name: editName.trim() || 'Unnamed Template',
        description: editDescription.trim() || undefined,
        updatedAt: Date.now(),
      });

      setEditingTemplateId(null);
      setEditName('');
      setEditDescription('');
    } catch (error) {
      alert(`Failed to update template: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleCancelEdit = () => {
    setEditingTemplateId(null);
    setEditName('');
    setEditDescription('');
  };

  const handleDelete = async (template: GraphTemplate) => {
    if (template.source === 'builtin') {
      alert('Cannot delete built-in templates');
      return;
    }

    if (confirm(`Delete template "${template.name}"?`)) {
      try {
        await removeTemplate(template.id, worldId);
      } catch (error) {
        alert(`Failed to delete template: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  };

  // Phase 6: Toggle favorite
  const handleToggleFavorite = async (template: GraphTemplate) => {
    if (template.source === 'builtin') {
      alert('Cannot modify built-in templates');
      return;
    }

    try {
      await toggleFavorite(template.id);
    } catch (error) {
      alert(`Failed to toggle favorite: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleExport = (template: GraphTemplate) => {
    try {
      exportTemplate(template);
    } catch (error) {
      alert(`Failed to export template: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const parsed = JSON.parse(text);

        // Validate the JSON structure
        if (!isValidTemplateJSON(parsed)) {
          alert('Invalid template file format. Please select a valid graph template JSON file.');
          return;
        }

        // Check for ID collision
        const existingTemplate = templates.find((t) => t.id === parsed.id);
        if (existingTemplate) {
          const shouldReplace = confirm(
            `A template with ID "${parsed.id}" already exists.\n\n` +
            `Click OK to generate a new ID, or Cancel to abort import.`
          );

          if (!shouldReplace) {
            return;
          }

          // Generate new ID to avoid collision
          parsed.id = `template_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        }

        // Determine source based on current context
        let source: 'user' | 'world' = 'user';
        if (worldId !== null && worldId !== undefined) {
          const saveToWorld = confirm(
            `Import template to current world (World #${worldId})?\n\n` +
            'Click OK to import to world (shared with all scenes in this world)\n' +
            'Click Cancel to import to your user templates (available everywhere)'
          );
          source = saveToWorld ? 'world' : 'user';
        }

        // Set source and worldId
        parsed.source = source;
        parsed.worldId = source === 'world' ? worldId : undefined;

        // Add the template
        await addTemplate(parsed, worldId);

        const scopeLabel = source === 'world' ? `world #${worldId}` : 'user templates';
        alert(`Successfully imported template "${parsed.name}" to ${scopeLabel}`);
      } catch (error) {
        alert(`Failed to import template: ${error instanceof Error ? error.message : 'Invalid JSON file'}`);
      }
    };

    input.click();
  };

  const toggleExpanded = (templateId: string) => {
    setExpandedTemplateId(expandedTemplateId === templateId ? null : templateId);
  };

  // Get source badge info
  const getSourceBadge = (template: GraphTemplate) => {
    switch (template.source) {
      case 'builtin':
        return { label: 'Built-in', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' };
      case 'world':
        return { label: 'World', className: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300' };
      case 'user':
      default:
        return { label: 'User', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' };
    }
  };

  return (
    <div className="space-y-2">
      {!compact && (
        <>
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold text-neutral-600 dark:text-neutral-400">
              Graph Templates ({templates.length})
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleImport}
              title="Import template from JSON file"
            >
              ↑ Import
            </Button>
          </div>

          {/* Phase 7: Search and filter controls */}
          <div className="space-y-2 pb-2 border-b dark:border-neutral-700">
            {/* Search */}
            <input
              type="text"
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-2 py-1 text-xs border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
            />

            {/* Category filter */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value as TemplateCategory | 'All')}
              className="w-full px-2 py-1 text-xs border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
            >
              {TEMPLATE_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat === 'All' ? 'All Categories' : cat}
                </option>
              ))}
            </select>

            {/* Phase 6: Favorites filter toggle */}
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={showFavoritesOnly}
                onChange={(e) => setShowFavoritesOnly(e.target.checked)}
                className="rounded border-neutral-300 dark:border-neutral-600"
              />
              <span className="text-neutral-700 dark:text-neutral-300">
                ⭐ Show favorites only ({templates.filter(t => t.isFavorite).length})
              </span>
            </label>

            {/* Filter summary */}
            {(selectedCategory !== 'All' || searchQuery.trim() || showFavoritesOnly) && (
              <div className="text-xs text-neutral-500 dark:text-neutral-400">
                Showing {filteredTemplates.length} of {templates.length} templates
              </div>
            )}
          </div>
        </>
      )}

      {/* Empty state */}
      {filteredTemplates.length === 0 && (
        <div className="p-4 text-center text-neutral-500 dark:text-neutral-400 text-sm">
          <div className="mb-2">📋</div>
          {templates.length === 0 ? (
            <>
              <div>No templates saved yet</div>
              <div className="text-xs mt-1 opacity-70">
                Select nodes and save as template to get started
              </div>
            </>
          ) : (
            <div>No templates match your filters</div>
          )}
        </div>
      )}

      {/* Phase 6: Favorites section */}
      {!showFavoritesOnly && favoriteTemplates.length > 0 && (
        <>
          <div className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-2 flex items-center gap-1">
            <span>⭐</span>
            <span>Favorites</span>
          </div>
          {favoriteTemplates.map((template) => renderTemplate(template))}

          {nonFavoriteTemplates.length > 0 && (
            <div className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-2 mt-4">
              All Templates
            </div>
          )}
        </>
      )}

      {/* Render non-favorite templates or all if showing favorites only */}
      {(showFavoritesOnly ? favoriteTemplates : nonFavoriteTemplates).map((template) => renderTemplate(template))}

      <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-3 pt-2 border-t dark:border-neutral-700">
        💡 Click Insert to add template to canvas
      </div>
    </div>
  );

  // Template rendering function (extracted for DRY)
  function renderTemplate(template: GraphTemplate) {
        const validation = validateTemplate(template);
        const isExpanded = expandedTemplateId === template.id;
        const isEditing = editingTemplateId === template.id;
        const sourceBadge = getSourceBadge(template);
        const isReadOnly = template.source === 'builtin';

        return (
          <div
            key={template.id}
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
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Template name"
                    className="w-full px-2 py-1 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
                  />
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder="Description (optional)"
                    rows={2}
                    className="w-full px-2 py-1 text-xs border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" variant="primary" onClick={handleSaveEdit}>
                      Save
                    </Button>
                    <Button size="sm" variant="secondary" onClick={handleCancelEdit}>
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
                            onClick={() => handleToggleFavorite(template)}
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
                      onClick={() => toggleExpanded(template.id)}
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

              {/* Action Buttons */}
              {!isEditing && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => handleInsert(template)}
                    disabled={!validation.valid}
                    className="flex-1"
                  >
                    ➕ Insert
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleExport(template)}
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
                        onClick={() => handleStartEdit(template)}
                        className="px-3"
                        title="Edit template"
                      >
                        ✏️
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleDelete(template)}
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
}

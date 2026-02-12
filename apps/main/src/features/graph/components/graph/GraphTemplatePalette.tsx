import { Button } from '@pixsim7/shared.ui';
import { useEffect, useState } from 'react';


import type { DraftScene } from '@domain/sceneBuilder';

import {
  downloadTemplatePack,
  importTemplatePack,
  type TemplateCategory,
} from '../../lib/editor/graphTemplates';
import type { GraphTemplate } from '../../lib/editor/graphTemplates';
import { useTemplateStore } from '../../stores/templatesStore';

import { TemplateCard } from './TemplateCard';
import { TEMPLATE_CATEGORIES, exportTemplate, isValidTemplateJSON } from './templatePaletteUtils';

interface GraphTemplatePaletteProps {
  /** Callback when a template is selected to be inserted */
  onInsertTemplate: (template: GraphTemplate) => void;

  /** Current world ID for loading world templates */
  worldId?: number | null;

  /** Current scene for precondition validation (Phase 8) */
  currentScene?: DraftScene | null;

  /** Compact mode for smaller display */
  compact?: boolean;
}

export function GraphTemplatePalette({
  onInsertTemplate,
  worldId,
  currentScene,
  compact = false,
}: GraphTemplatePaletteProps) {
  const templates = useTemplateStore((state) => state.getTemplates(worldId));
  const addTemplate = useTemplateStore((state) => state.addTemplate);
  const updateTemplate = useTemplateStore((state) => state.updateTemplate);
  const removeTemplate = useTemplateStore((state) => state.removeTemplate);
  const toggleFavorite = useTemplateStore((state) => state.toggleFavorite);
  const loadWorldTemplates = useTemplateStore((state) => state.loadWorldTemplates);

  // Phase 9: Pack management
  const packs = useTemplateStore((state) => state.getPacks());
  const getPack = useTemplateStore((state) => state.getPack);
  const getTemplatesByPack = useTemplateStore((state) => state.getTemplatesByPack);
  const createPack = useTemplateStore((state) => state.createPack);

  const [expandedTemplateId, setExpandedTemplateId] = useState<string | null>(null);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');

  // Phase 6 & 7: Filtering state
  const [selectedCategory, setSelectedCategory] = useState<TemplateCategory | 'All'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  // Phase 9: Pack filtering
  const [selectedPackId, setSelectedPackId] = useState<string | 'All' | 'None'>('All');

  // Load world templates when world changes
  useEffect(() => {
    if (worldId !== null && worldId !== undefined) {
      loadWorldTemplates(worldId);
    }
  }, [worldId, loadWorldTemplates]);

  // Phase 6, 7, 9: Filter templates
  const filteredTemplates = templates.filter((template) => {
    // Phase 6: Favorites filter
    if (showFavoritesOnly && !template.isFavorite) {
      return false;
    }

    // Category filter
    if (selectedCategory !== 'All' && template.category !== selectedCategory) {
      return false;
    }

    // Phase 9: Pack filter
    if (selectedPackId !== 'All') {
      if (selectedPackId === 'None' && template.packId) {
        return false; // Show only templates without a pack
      } else if (selectedPackId !== 'None' && template.packId !== selectedPackId) {
        return false; // Show only templates in selected pack
      }
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
        await removeTemplate(template.id);
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

  // Phase 9: Export pack
  const handleExportPack = (packId: string) => {
    const pack = getPack(packId);
    if (!pack) {
      alert('Pack not found');
      return;
    }

    const packTemplates = getTemplatesByPack(packId);
    if (packTemplates.length === 0) {
      alert('Pack has no templates to export');
      return;
    }

    try {
      downloadTemplatePack(pack, packTemplates);
    } catch (error) {
      alert(`Failed to export pack: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Phase 9: Import pack
  const handleImportPack = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const result = importTemplatePack(text);

        if (!result.valid || !result.pack) {
          alert(`Failed to import pack:\n${result.errors.join('\n')}`);
          return;
        }

        // Generate new pack ID to avoid collisions
        const importedPack = {
          ...result.pack,
          id: `pack_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        };

        // Create the pack
        const createdPack = createPack(importedPack);

        // Import all templates with the new pack ID
        let successCount = 0;
        for (const template of result.templates) {
          try {
            await addTemplate({
              ...template,
              id: `template_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
              packId: createdPack.id,
              source: 'user',
              worldId: undefined,
            }, worldId);
            successCount++;
          } catch (error) {
            console.error(`Failed to import template ${template.name}:`, error);
          }
        }

        alert(
          `Successfully imported pack "${createdPack.name}"!\n` +
          `Imported ${successCount} of ${result.templates.length} templates.`
        );

        // Switch to the imported pack filter
        setSelectedPackId(createdPack.id);
      } catch (error) {
        alert(`Failed to import pack: ${error instanceof Error ? error.message : 'Invalid JSON file'}`);
      }
    };

    input.click();
  };

  const toggleExpanded = (templateId: string) => {
    setExpandedTemplateId(expandedTemplateId === templateId ? null : templateId);
  };

  const renderTemplateCard = (template: GraphTemplate) => (
    <TemplateCard
      key={template.id}
      template={template}
      currentScene={currentScene}
      isExpanded={expandedTemplateId === template.id}
      isEditing={editingTemplateId === template.id}
      editName={editName}
      editDescription={editDescription}
      isReadOnly={template.source === 'builtin'}
      onToggleExpanded={toggleExpanded}
      onToggleFavorite={handleToggleFavorite}
      onInsert={handleInsert}
      onExport={handleExport}
      onStartEdit={handleStartEdit}
      onDelete={handleDelete}
      onSaveEdit={handleSaveEdit}
      onCancelEdit={handleCancelEdit}
      onEditNameChange={setEditName}
      onEditDescriptionChange={setEditDescription}
    />
  );

  return (
    <div className="space-y-2">
      {!compact && (
        <>
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold text-neutral-600 dark:text-neutral-400">
              Graph Templates ({templates.length})
            </div>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="secondary"
                onClick={handleImport}
                title="Import template from JSON file"
              >
                ↑ Template
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={handleImportPack}
                title="Import template pack from JSON file"
              >
                📦 Pack
              </Button>
            </div>
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

            {/* Phase 9: Pack filter */}
            <div className="flex gap-1">
              <select
                value={selectedPackId}
                onChange={(e) => setSelectedPackId(e.target.value)}
                className="flex-1 px-2 py-1 text-xs border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
              >
                <option value="All">All Packs</option>
                <option value="None">No Pack</option>
                {packs.map((pack) => (
                  <option key={pack.id} value={pack.id}>
                    {pack.icon && `${pack.icon} `}{pack.name} ({getTemplatesByPack(pack.id).length})
                  </option>
                ))}
              </select>
              {selectedPackId !== 'All' && selectedPackId !== 'None' && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => handleExportPack(selectedPackId)}
                  title="Export this pack as JSON"
                  className="px-2"
                >
                  ↓
                </Button>
              )}
            </div>

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
            {(selectedCategory !== 'All' || searchQuery.trim() || showFavoritesOnly || selectedPackId !== 'All') && (
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
          {favoriteTemplates.map((template) => renderTemplateCard(template))}

          {nonFavoriteTemplates.length > 0 && (
            <div className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-2 mt-4">
              All Templates
            </div>
          )}
        </>
      )}

      {/* Render non-favorite templates or all if showing favorites only */}
      {(showFavoritesOnly ? favoriteTemplates : nonFavoriteTemplates).map((template) => renderTemplateCard(template))}

      <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-3 pt-2 border-t dark:border-neutral-700">
        💡 Click Insert to add template to canvas
      </div>
    </div>
  );
}

/**
 * Template Browser
 *
 * UI for browsing and importing scene and arc templates.
 * Provides filtering, preview, and easy import functionality.
 *
 * @see apps/main/src/lib/intimacy/templates.ts
 * @see claude-tasks/12-intimacy-scene-composer-and-progression-editor.md (Phase 10)
 */

import React, { useState, useMemo } from 'react';
import type { IntimacySceneConfig, RelationshipProgressionArc } from '@lib/registries';
import {
  getAllSceneTemplates,
  getAllArcTemplates,
  cloneSceneFromTemplate,
  cloneArcFromTemplate,
  deleteUserSceneTemplate,
  deleteUserArcTemplate,
  type SceneTemplate,
  type ArcTemplate,
} from '../lib/templates';
import { RelationshipGateBadge } from './RelationshipGateVisualizer';

// ============================================================================
// Scene Template Browser
// ============================================================================

interface SceneTemplateBrowserProps {
  /** Callback when a template is selected for import */
  onImport: (scene: IntimacySceneConfig) => void;

  /** Available NPCs for scene assignment */
  availableNpcs: Array<{ id: number; name: string }>;

  /** Close the browser */
  onClose?: () => void;
}

export function SceneTemplateBrowser({
  onImport,
  availableNpcs,
  onClose,
}: SceneTemplateBrowserProps) {
  const [categoryFilter, setCategoryFilter] = useState<SceneTemplate['category'] | 'all'>('all');
  const [difficultyFilter, setDifficultyFilter] = useState<SceneTemplate['difficulty'] | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<SceneTemplate | null>(null);
  const [selectedNpcIds, setSelectedNpcIds] = useState<number[]>([]);

  // Get filtered templates
  const filteredTemplates = useMemo(() => {
    let templates = getAllSceneTemplates(
      categoryFilter === 'all' ? undefined : { category: categoryFilter }
    );

    if (difficultyFilter !== 'all') {
      templates = templates.filter((t) => t.difficulty === difficultyFilter);
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      templates = templates.filter(
        (t) =>
          t.name.toLowerCase().includes(query) ||
          t.description.toLowerCase().includes(query) ||
          t.tags.some((tag) => tag.toLowerCase().includes(query))
      );
    }

    return templates;
  }, [categoryFilter, difficultyFilter, searchQuery]);

  const handleImport = () => {
    if (!selectedTemplate) return;
    if (selectedNpcIds.length === 0) {
      alert('Please select at least one NPC for this scene');
      return;
    }

    const scene = cloneSceneFromTemplate(selectedTemplate, selectedNpcIds);
    onImport(scene);
    if (onClose) onClose();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-gray-200 p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Scene Template Browser</h2>
          {onClose && (
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 px-2 py-1"
            >
              ✕
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex gap-4 mb-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as any)}
            className="px-3 py-2 border border-gray-300 rounded"
          >
            <option value="all">All Categories</option>
            <option value="flirt">Flirt</option>
            <option value="date">Date</option>
            <option value="kiss">Kiss</option>
            <option value="intimate">Intimate</option>
            <option value="custom">Custom</option>
          </select>
          <select
            value={difficultyFilter}
            onChange={(e) => setDifficultyFilter(e.target.value as any)}
            className="px-3 py-2 border border-gray-300 rounded"
          >
            <option value="all">All Difficulties</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>

        <div className="text-sm text-gray-600">
          {filteredTemplates.length} template(s) found
        </div>
      </div>

      {/* Template List and Preview */}
      <div className="flex-1 flex overflow-hidden">
        {/* Template List */}
        <div className="w-1/2 border-r border-gray-200 overflow-y-auto">
          {filteredTemplates.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No templates match your filters
            </div>
          ) : (
            <div className="p-2">
              {filteredTemplates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => setSelectedTemplate(template)}
                  className={`w-full text-left p-3 mb-2 rounded border transition-colors ${
                    selectedTemplate?.id === template.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-start justify-between mb-1">
                    <div className="font-medium">{template.name}</div>
                    <DifficultyBadge difficulty={template.difficulty} />
                  </div>
                  <div className="text-sm text-gray-600 mb-2">{template.description}</div>
                  <div className="flex flex-wrap gap-1">
                    {template.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-xs px-2 py-0.5 bg-gray-100 text-gray-700 rounded"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Template Preview */}
        <div className="w-1/2 overflow-y-auto p-4">
          {selectedTemplate ? (
            <div>
              <h3 className="text-lg font-semibold mb-2">{selectedTemplate.name}</h3>
              <p className="text-gray-600 mb-4">{selectedTemplate.description}</p>

              {/* Scene Details */}
              <div className="space-y-3 mb-4">
                <DetailRow label="Scene Type" value={selectedTemplate.scene.sceneType} />
                <DetailRow label="Intensity" value={selectedTemplate.scene.intensity} />
                <DetailRow label="Content Rating" value={selectedTemplate.scene.contentRating} />
                <DetailRow
                  label="Requires Consent"
                  value={selectedTemplate.scene.requiresConsent ? 'Yes' : 'No'}
                />
              </div>

              {/* Gates */}
              <div className="mb-4">
                <h4 className="font-medium mb-2">Gates ({selectedTemplate.scene.gates.length})</h4>
                <div className="space-y-2">
                  {selectedTemplate.scene.gates.map((gate) => (
                    <div key={gate.id} className="border border-gray-200 rounded p-3">
                      <div className="font-medium mb-1">{gate.name}</div>
                      {gate.description && (
                        <div className="text-sm text-gray-600 mb-2">{gate.description}</div>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {gate.requiredTier && (
                          <RelationshipGateBadge
                            type="tier"
                            value={gate.requiredTier}
                            variant="neutral"
                          />
                        )}
                        {gate.requiredIntimacyLevel && (
                          <RelationshipGateBadge
                            type="intimacy"
                            value={gate.requiredIntimacyLevel}
                            variant="neutral"
                          />
                        )}
                        {gate.metricRequirements && (
                          <>
                            {gate.metricRequirements.minAffinity !== undefined && (
                              <span className="text-xs px-2 py-1 bg-pink-100 text-pink-800 rounded">
                                Affinity ≥ {gate.metricRequirements.minAffinity}
                              </span>
                            )}
                            {gate.metricRequirements.minTrust !== undefined && (
                              <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded">
                                Trust ≥ {gate.metricRequirements.minTrust}
                              </span>
                            )}
                            {gate.metricRequirements.minChemistry !== undefined && (
                              <span className="text-xs px-2 py-1 bg-purple-100 text-purple-800 rounded">
                                Chemistry ≥ {gate.metricRequirements.minChemistry}
                              </span>
                            )}
                            {gate.metricRequirements.minTension !== undefined && (
                              <span className="text-xs px-2 py-1 bg-orange-100 text-orange-800 rounded">
                                Tension ≥ {gate.metricRequirements.minTension}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* NPC Selection */}
              <div className="mb-4">
                <h4 className="font-medium mb-2">Assign to NPCs</h4>
                <div className="space-y-2">
                  {availableNpcs.map((npc) => (
                    <label key={npc.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedNpcIds.includes(npc.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedNpcIds([...selectedNpcIds, npc.id]);
                          } else {
                            setSelectedNpcIds(selectedNpcIds.filter((id) => id !== npc.id));
                          }
                        }}
                        className="rounded"
                      />
                      <span>{npc.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Import Button */}
              <button
                onClick={handleImport}
                disabled={selectedNpcIds.length === 0}
                className="w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                Import Template
              </button>
            </div>
          ) : (
            <div className="text-center text-gray-500 mt-12">
              Select a template to preview
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Arc Template Browser
// ============================================================================

interface ArcTemplateBrowserProps {
  /** Callback when a template is selected for import */
  onImport: (arc: RelationshipProgressionArc) => void;

  /** Available NPCs for arc assignment */
  availableNpcs: Array<{ id: number; name: string }>;

  /** Close the browser */
  onClose?: () => void;
}

export function ArcTemplateBrowser({
  onImport,
  availableNpcs,
  onClose,
}: ArcTemplateBrowserProps) {
  const [categoryFilter, setCategoryFilter] = useState<ArcTemplate['category'] | 'all'>('all');
  const [difficultyFilter, setDifficultyFilter] = useState<ArcTemplate['difficulty'] | 'all'>('all');
  const [durationFilter, setDurationFilter] = useState<ArcTemplate['estimatedDuration'] | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<ArcTemplate | null>(null);
  const [selectedNpcId, setSelectedNpcId] = useState<number | null>(null);

  // Get filtered templates
  const filteredTemplates = useMemo(() => {
    let templates = getAllArcTemplates(
      categoryFilter === 'all' ? undefined : { category: categoryFilter }
    );

    if (difficultyFilter !== 'all') {
      templates = templates.filter((t) => t.difficulty === difficultyFilter);
    }

    if (durationFilter !== 'all') {
      templates = templates.filter((t) => t.estimatedDuration === durationFilter);
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      templates = templates.filter(
        (t) =>
          t.name.toLowerCase().includes(query) ||
          t.description.toLowerCase().includes(query) ||
          t.tags.some((tag) => tag.toLowerCase().includes(query))
      );
    }

    return templates;
  }, [categoryFilter, difficultyFilter, durationFilter, searchQuery]);

  const handleImport = () => {
    if (!selectedTemplate || selectedNpcId === null) return;

    const arc = cloneArcFromTemplate(selectedTemplate, selectedNpcId);
    onImport(arc);
    if (onClose) onClose();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-gray-200 p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Progression Arc Template Browser</h2>
          {onClose && (
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 px-2 py-1"
            >
              ✕
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex gap-4 mb-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as any)}
            className="px-3 py-2 border border-gray-300 rounded"
          >
            <option value="all">All Categories</option>
            <option value="romance">Romance</option>
            <option value="friendship">Friendship</option>
            <option value="rivalry">Rivalry</option>
            <option value="custom">Custom</option>
          </select>
          <select
            value={difficultyFilter}
            onChange={(e) => setDifficultyFilter(e.target.value as any)}
            className="px-3 py-2 border border-gray-300 rounded"
          >
            <option value="all">All Difficulties</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
          <select
            value={durationFilter}
            onChange={(e) => setDurationFilter(e.target.value as any)}
            className="px-3 py-2 border border-gray-300 rounded"
          >
            <option value="all">All Durations</option>
            <option value="short">Short</option>
            <option value="medium">Medium</option>
            <option value="long">Long</option>
          </select>
        </div>

        <div className="text-sm text-gray-600">
          {filteredTemplates.length} template(s) found
        </div>
      </div>

      {/* Template List and Preview */}
      <div className="flex-1 flex overflow-hidden">
        {/* Template List */}
        <div className="w-1/2 border-r border-gray-200 overflow-y-auto">
          {filteredTemplates.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No templates match your filters
            </div>
          ) : (
            <div className="p-2">
              {filteredTemplates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => setSelectedTemplate(template)}
                  className={`w-full text-left p-3 mb-2 rounded border transition-colors ${
                    selectedTemplate?.id === template.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-start justify-between mb-1">
                    <div className="font-medium">{template.name}</div>
                    <div className="flex gap-2">
                      <DifficultyBadge difficulty={template.difficulty} />
                      <DurationBadge duration={template.estimatedDuration} />
                    </div>
                  </div>
                  <div className="text-sm text-gray-600 mb-2">{template.description}</div>
                  <div className="flex flex-wrap gap-1">
                    {template.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-xs px-2 py-0.5 bg-gray-100 text-gray-700 rounded"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Template Preview */}
        <div className="w-1/2 overflow-y-auto p-4">
          {selectedTemplate ? (
            <div>
              <h3 className="text-lg font-semibold mb-2">{selectedTemplate.name}</h3>
              <p className="text-gray-600 mb-4">{selectedTemplate.description}</p>

              {/* Arc Details */}
              <div className="space-y-3 mb-4">
                <DetailRow label="Category" value={selectedTemplate.category} />
                <DetailRow label="Difficulty" value={selectedTemplate.difficulty} />
                <DetailRow label="Duration" value={selectedTemplate.estimatedDuration} />
                <DetailRow label="Max Content Rating" value={selectedTemplate.arc.maxContentRating} />
                <DetailRow label="Stages" value={selectedTemplate.arc.stages.length.toString()} />
              </div>

              {/* Stages */}
              <div className="mb-4">
                <h4 className="font-medium mb-2">Progression Stages</h4>
                <div className="space-y-2">
                  {selectedTemplate.arc.stages.map((stage, idx) => (
                    <div key={stage.id} className="border border-gray-200 rounded p-3">
                      <div className="flex items-start gap-2 mb-1">
                        <span className="text-sm font-medium text-gray-500">#{idx + 1}</span>
                        <div className="flex-1">
                          <div className="font-medium">{stage.name}</div>
                          <div className="text-sm text-gray-600">Tier: {stage.tier}</div>
                        </div>
                      </div>
                      {stage.availableScenes && stage.availableScenes.length > 0 && (
                        <div className="text-xs text-gray-500 mt-1">
                          Scenes: {stage.availableScenes.join(', ')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* NPC Selection */}
              <div className="mb-4">
                <h4 className="font-medium mb-2">Assign to NPC</h4>
                <select
                  value={selectedNpcId ?? ''}
                  onChange={(e) => setSelectedNpcId(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded"
                >
                  <option value="">Select an NPC...</option>
                  {availableNpcs.map((npc) => (
                    <option key={npc.id} value={npc.id}>
                      {npc.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Import Button */}
              <button
                onClick={handleImport}
                disabled={selectedNpcId === null}
                className="w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                Import Template
              </button>
            </div>
          ) : (
            <div className="text-center text-gray-500 mt-12">
              Select a template to preview
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Helper Components
// ============================================================================

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-600">{label}:</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function DifficultyBadge({ difficulty }: { difficulty: 'easy' | 'medium' | 'hard' }) {
  const colors = {
    easy: 'bg-green-100 text-green-800',
    medium: 'bg-yellow-100 text-yellow-800',
    hard: 'bg-red-100 text-red-800',
  };

  return (
    <span className={`text-xs px-2 py-0.5 rounded ${colors[difficulty]}`}>
      {difficulty}
    </span>
  );
}

function DurationBadge({ duration }: { duration: 'short' | 'medium' | 'long' }) {
  const colors = {
    short: 'bg-blue-100 text-blue-800',
    medium: 'bg-indigo-100 text-indigo-800',
    long: 'bg-purple-100 text-purple-800',
  };

  return (
    <span className={`text-xs px-2 py-0.5 rounded ${colors[duration]}`}>
      {duration}
    </span>
  );
}

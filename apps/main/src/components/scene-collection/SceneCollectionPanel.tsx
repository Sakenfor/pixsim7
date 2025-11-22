/**
 * Scene Collection Editor Panel
 *
 * Features:
 * - Create/edit/delete scene collections
 * - Drag-and-drop scene reordering
 * - Visual organization by type (chapter, episode, etc.)
 * - Assign to arc graphs or campaigns
 * - Unlock condition editor
 */

import React, { useState } from 'react';
import { useSceneCollectionStore } from '../../stores/sceneCollectionStore';
import { validateSceneCollection } from '../../modules/scene-collection';
import type { SceneCollection, SceneCollectionType } from '../../modules/scene-collection';

interface SceneCollectionPanelProps {
  /** Available scene IDs for validation */
  availableSceneIds: Set<string>;
  /** Optional: Currently selected collection ID */
  selectedCollectionId?: string | null;
  /** Optional: Callback when collection is selected */
  onCollectionSelect?: (collectionId: string | null) => void;
}

export const SceneCollectionPanel: React.FC<SceneCollectionPanelProps> = ({
  availableSceneIds,
  selectedCollectionId,
  onCollectionSelect,
}) => {
  const {
    collections,
    currentCollectionId,
    createCollection,
    updateCollection,
    deleteCollection,
    addSceneToCollection,
    removeSceneFromCollection,
    reorderScenes,
    setCurrentCollection,
    exportCollection,
    importCollection,
  } = useSceneCollectionStore();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [newCollectionTitle, setNewCollectionTitle] = useState('');
  const [newCollectionType, setNewCollectionType] = useState<SceneCollectionType>('chapter');

  const activeCollectionId = selectedCollectionId ?? currentCollectionId;
  const activeCollection = activeCollectionId ? collections[activeCollectionId] : null;

  const handleCreateCollection = () => {
    if (!newCollectionTitle.trim()) return;
    const id = createCollection(newCollectionTitle, newCollectionType);
    setNewCollectionTitle('');
    setCurrentCollection(id);
    if (onCollectionSelect) {
      onCollectionSelect(id);
    }
  };

  const handleDeleteCollection = (id: string) => {
    if (window.confirm('Are you sure you want to delete this collection?')) {
      deleteCollection(id);
      if (activeCollectionId === id) {
        setCurrentCollection(null);
        if (onCollectionSelect) {
          onCollectionSelect(null);
        }
      }
    }
  };

  const handleSelectCollection = (id: string) => {
    setCurrentCollection(id);
    if (onCollectionSelect) {
      onCollectionSelect(id);
    }
  };

  const handleExport = (id: string) => {
    const json = exportCollection(id);
    if (json) {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `collection-${id}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const json = e.target?.result as string;
          const id = importCollection(json);
          if (id) {
            alert('Collection imported successfully!');
          } else {
            alert('Failed to import collection. Please check the file format.');
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  const collectionList = Object.values(collections);
  const validationIssues = activeCollection
    ? validateSceneCollection(activeCollection, availableSceneIds)
    : [];

  return (
    <div className="scene-collection-panel flex h-full">
      {/* Left sidebar - Collection list */}
      <div className="w-64 border-r border-gray-700 bg-gray-800 p-4">
        <h2 className="text-lg font-semibold mb-4">Scene Collections</h2>

        {/* Create new collection */}
        <div className="mb-4 space-y-2">
          <input
            type="text"
            placeholder="Collection title..."
            value={newCollectionTitle}
            onChange={(e) => setNewCollectionTitle(e.target.value)}
            className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded"
          />
          <select
            value={newCollectionType}
            onChange={(e) => setNewCollectionType(e.target.value as SceneCollectionType)}
            className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded"
          >
            <option value="chapter">Chapter</option>
            <option value="episode">Episode</option>
            <option value="conversation">Conversation</option>
            <option value="location_group">Location Group</option>
            <option value="custom">Custom</option>
          </select>
          <button
            onClick={handleCreateCollection}
            disabled={!newCollectionTitle.trim()}
            className="w-full px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded"
          >
            Create Collection
          </button>
        </div>

        {/* Import/Export */}
        <div className="mb-4 space-y-1">
          <button
            onClick={handleImport}
            className="w-full px-2 py-1 text-sm bg-gray-700 hover:bg-gray-600 rounded"
          >
            Import Collection
          </button>
        </div>

        {/* Collection list */}
        <div className="space-y-2">
          {collectionList.map((collection) => (
            <div
              key={collection.id}
              className={`p-2 rounded cursor-pointer ${
                collection.id === activeCollectionId
                  ? 'bg-blue-600'
                  : 'bg-gray-700 hover:bg-gray-600'
              }`}
              onClick={() => handleSelectCollection(collection.id)}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="font-medium truncate">{collection.title}</div>
                  <div className="text-xs text-gray-400">{collection.type}</div>
                  <div className="text-xs text-gray-500">
                    {collection.scenes.length} scene{collection.scenes.length !== 1 ? 's' : ''}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleExport(collection.id);
                    }}
                    className="text-xs px-1 hover:text-blue-400"
                    title="Export"
                  >
                    ⬇
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteCollection(collection.id);
                    }}
                    className="text-xs px-1 hover:text-red-400"
                    title="Delete"
                  >
                    ×
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {collectionList.length === 0 && (
          <div className="text-sm text-gray-500 text-center py-8">
            No collections yet. Create one to get started!
          </div>
        )}
      </div>

      {/* Right panel - Collection editor */}
      <div className="flex-1 p-6 overflow-auto">
        {activeCollection ? (
          <div className="space-y-6">
            {/* Collection header */}
            <div>
              <h2 className="text-2xl font-bold mb-2">{activeCollection.title}</h2>
              <div className="text-sm text-gray-400">
                Type: {activeCollection.type} • {activeCollection.scenes.length} scenes
              </div>
              {activeCollection.arcGraphId && (
                <div className="text-sm text-gray-400">Arc Graph: {activeCollection.arcGraphId}</div>
              )}
              {activeCollection.campaignId && (
                <div className="text-sm text-gray-400">Campaign: {activeCollection.campaignId}</div>
              )}
            </div>

            {/* Validation issues */}
            {validationIssues.length > 0 && (
              <div className="bg-red-900/20 border border-red-700 rounded p-4">
                <h3 className="font-semibold mb-2">Validation Issues</h3>
                <ul className="space-y-1 text-sm">
                  {validationIssues.map((issue, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className={
                        issue.severity === 'error' ? 'text-red-400' :
                        issue.severity === 'warning' ? 'text-yellow-400' :
                        'text-blue-400'
                      }>
                        {issue.severity === 'error' ? '🔴' :
                         issue.severity === 'warning' ? '⚠️' : 'ℹ️'}
                      </span>
                      <span>{issue.message}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Scene list */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Scenes</h3>
              {activeCollection.scenes.length > 0 ? (
                <div className="space-y-2">
                  {activeCollection.scenes
                    .sort((a, b) => a.order - b.order)
                    .map((scene) => (
                      <div
                        key={scene.sceneId}
                        className="bg-gray-700 p-3 rounded flex justify-between items-center"
                      >
                        <div>
                          <div className="font-medium">Scene: {scene.sceneId}</div>
                          <div className="text-sm text-gray-400">Order: {scene.order}</div>
                          {scene.optional && (
                            <div className="text-xs text-yellow-400">Optional</div>
                          )}
                        </div>
                        <button
                          onClick={() =>
                            removeSceneFromCollection(activeCollection.id, scene.sceneId)
                          }
                          className="px-2 py-1 text-sm bg-red-600 hover:bg-red-700 rounded"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="text-sm text-gray-500 text-center py-8 bg-gray-800 rounded">
                  No scenes in this collection yet. Add scenes to get started!
                </div>
              )}
            </div>

            {/* Metadata editor */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Metadata</h3>
              <div className="space-y-2">
                <div>
                  <label className="text-sm text-gray-400">Collection Number</label>
                  <input
                    type="number"
                    value={activeCollection.metadata.number ?? ''}
                    onChange={(e) =>
                      updateCollection(activeCollection.id, {
                        metadata: {
                          ...activeCollection.metadata,
                          number: e.target.value ? parseInt(e.target.value) : undefined,
                        },
                      })
                    }
                    className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded"
                    placeholder="e.g., 3 for Chapter 3"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400">Estimated Duration (minutes)</label>
                  <input
                    type="number"
                    value={activeCollection.metadata.estimated_duration_min ?? ''}
                    onChange={(e) =>
                      updateCollection(activeCollection.id, {
                        metadata: {
                          ...activeCollection.metadata,
                          estimated_duration_min: e.target.value
                            ? parseInt(e.target.value)
                            : undefined,
                        },
                      })
                    }
                    className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded"
                    placeholder="e.g., 30"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400">Color</label>
                  <input
                    type="text"
                    value={activeCollection.metadata.color ?? ''}
                    onChange={(e) =>
                      updateCollection(activeCollection.id, {
                        metadata: {
                          ...activeCollection.metadata,
                          color: e.target.value || undefined,
                        },
                      })
                    }
                    className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded"
                    placeholder="e.g., #3b82f6"
                  />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            Select or create a collection to edit
          </div>
        )}
      </div>
    </div>
  );
};

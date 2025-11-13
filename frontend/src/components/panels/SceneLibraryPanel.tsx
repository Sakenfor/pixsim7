import { useState, useMemo } from 'react';
import { useGraphStore, type GraphState } from '../../stores/graphStore';
import { Button } from '@pixsim7/ui';
import type { DraftScene } from '../../modules/scene-builder';

/**
 * Scene Library Panel
 *
 * Browse and manage all scenes in the project:
 * - View all scenes with metadata
 * - Search/filter by name, tags, type
 * - Switch between scenes
 * - Create new scenes
 * - Duplicate/delete scenes
 * - Drag scenes to create scene_call nodes (TODO)
 */
export function SceneLibraryPanel() {
  const listScenes = useGraphStore((s: GraphState) => s.listScenes);
  const currentSceneId = useGraphStore((s: GraphState) => s.currentSceneId);
  const loadScene = useGraphStore((s: GraphState) => s.loadScene);
  const createScene = useGraphStore((s: GraphState) => s.createScene);
  const duplicateScene = useGraphStore((s: GraphState) => s.duplicateScene);
  const deleteScene = useGraphStore((s: GraphState) => s.deleteScene);
  const renameScene = useGraphStore((s: GraphState) => s.renameScene);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'reusable' | 'regular'>('all');
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const scenes = listScenes();

  // Filter scenes
  const filteredScenes = useMemo(() => {
    let result = scenes;

    // Apply search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (scene) =>
          scene.title.toLowerCase().includes(query) ||
          scene.id.toLowerCase().includes(query) ||
          scene.signature?.description?.toLowerCase().includes(query) ||
          scene.signature?.tags?.some((tag) => tag.toLowerCase().includes(query))
      );
    }

    // Apply type filter
    if (filterType === 'reusable') {
      result = result.filter((scene) => scene.signature?.isReusable);
    } else if (filterType === 'regular') {
      result = result.filter((scene) => !scene.signature?.isReusable);
    }

    return result;
  }, [scenes, searchQuery, filterType]);

  const handleCreateScene = () => {
    const title = prompt('Enter scene title:', 'New Scene');
    if (title) {
      const sceneId = createScene(title);
      loadScene(sceneId);
    }
  };

  const handleDuplicateScene = (sceneId: string, currentTitle: string) => {
    const newTitle = prompt('Enter title for duplicated scene:', `${currentTitle} (Copy)`);
    if (newTitle) {
      const newSceneId = duplicateScene(sceneId, newTitle);
      loadScene(newSceneId);
    }
  };

  const handleDeleteScene = (sceneId: string, title: string) => {
    if (confirm(`Delete scene "${title}"?\n\nThis cannot be undone.`)) {
      deleteScene(sceneId);
    }
  };

  const handleStartRename = (sceneId: string, currentTitle: string) => {
    setEditingSceneId(sceneId);
    setEditTitle(currentTitle);
  };

  const handleSaveRename = (sceneId: string) => {
    if (editTitle.trim()) {
      renameScene(sceneId, editTitle.trim());
    }
    setEditingSceneId(null);
  };

  const handleCancelRename = () => {
    setEditingSceneId(null);
    setEditTitle('');
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-neutral-900">
      {/* Header */}
      <div className="border-b p-4 bg-neutral-50 dark:bg-neutral-900">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold">Scene Library</h2>
          <Button size="sm" variant="primary" onClick={handleCreateScene}>
            + New Scene
          </Button>
        </div>

        {/* Search */}
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search scenes..."
          className="w-full px-3 py-2 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600 mb-2"
        />

        {/* Filter */}
        <div className="flex gap-1">
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              filterType === 'all'
                ? 'bg-blue-500 text-white'
                : 'bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600'
            }`}
          >
            All ({scenes.length})
          </button>
          <button
            onClick={() => setFilterType('reusable')}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              filterType === 'reusable'
                ? 'bg-purple-500 text-white'
                : 'bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600'
            }`}
          >
            Reusable ({scenes.filter((s) => s.signature?.isReusable).length})
          </button>
          <button
            onClick={() => setFilterType('regular')}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              filterType === 'regular'
                ? 'bg-green-500 text-white'
                : 'bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600'
            }`}
          >
            Regular ({scenes.filter((s) => !s.signature?.isReusable).length})
          </button>
        </div>
      </div>

      {/* Scene List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {filteredScenes.length === 0 ? (
          <div className="text-center py-8 text-neutral-500 dark:text-neutral-400">
            {searchQuery ? 'No scenes match your search' : 'No scenes yet - create one to get started!'}
          </div>
        ) : (
          filteredScenes.map((scene) => (
            <SceneCard
              key={scene.id}
              scene={scene}
              isActive={scene.id === currentSceneId}
              isEditing={editingSceneId === scene.id}
              editTitle={editTitle}
              onSetEditTitle={setEditTitle}
              onLoad={() => loadScene(scene.id)}
              onDuplicate={() => handleDuplicateScene(scene.id, scene.title)}
              onDelete={() => handleDeleteScene(scene.id, scene.title)}
              onStartRename={() => handleStartRename(scene.id, scene.title)}
              onSaveRename={() => handleSaveRename(scene.id)}
              onCancelRename={handleCancelRename}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface SceneCardProps {
  scene: DraftScene;
  isActive: boolean;
  isEditing: boolean;
  editTitle: string;
  onSetEditTitle: (title: string) => void;
  onLoad: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onStartRename: () => void;
  onSaveRename: () => void;
  onCancelRename: () => void;
}

function SceneCard({
  scene,
  isActive,
  isEditing,
  editTitle,
  onSetEditTitle,
  onLoad,
  onDuplicate,
  onDelete,
  onStartRename,
  onSaveRename,
  onCancelRename,
}: SceneCardProps) {
  const isReusable = scene.signature?.isReusable || false;

  return (
    <div
      className={`
        p-3 rounded-lg border-2 transition-all cursor-pointer
        ${
          isActive
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
            : 'border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600'
        }
      `}
      onClick={onLoad}
    >
      {/* Title */}
      <div className="flex items-center justify-between mb-2">
        {isEditing ? (
          <input
            type="text"
            value={editTitle}
            onChange={(e) => onSetEditTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSaveRename();
              if (e.key === 'Escape') onCancelRename();
            }}
            onBlur={onSaveRename}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 px-2 py-1 border rounded text-sm bg-white dark:bg-neutral-800"
            autoFocus
          />
        ) : (
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <span>{scene.title}</span>
            {isReusable && (
              <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full text-xs">
                Reusable
              </span>
            )}
          </h3>
        )}
      </div>

      {/* Metadata */}
      <div className="text-xs text-neutral-600 dark:text-neutral-400 space-y-1">
        <div>
          <span className="font-medium">Nodes:</span> {scene.nodes.length} | <span className="font-medium">Edges:</span>{' '}
          {scene.edges?.length || 0}
        </div>
        {scene.signature?.description && <div className="italic">{scene.signature.description}</div>}
        {scene.signature?.tags && scene.signature.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {scene.signature.tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 bg-neutral-200 dark:bg-neutral-700 rounded-full text-xs"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-1 mt-3 pt-2 border-t border-neutral-200 dark:border-neutral-700">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onStartRename();
          }}
          className="px-2 py-1 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded text-xs transition-colors"
        >
          Rename
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate();
          }}
          className="px-2 py-1 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded text-xs transition-colors"
        >
          Duplicate
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="px-2 py-1 bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-700 dark:text-red-300 rounded text-xs transition-colors"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

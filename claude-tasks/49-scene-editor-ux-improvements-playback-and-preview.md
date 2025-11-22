"""
Task 49 – Scene Editor UX Improvements: Playback, Preview & Templates

Goal

Improve the scene editor workflow for content creators by adding:

1. **In-editor scene playback/testing** - Test scenes directly from the editor without full game launch
2. **Visual content preview** - See media thumbnails and previews in nodes
3. **Enhanced template workflows** - Leverage existing GraphTemplate system for better discoverability
4. **Copy/paste and scene snippets** - Reuse subgraphs efficiently

This task focuses on **editor productivity** and **iteration speed**, using existing shared UI components and infrastructure wherever possible.

Background

Current scene editing workflow:

- **Scene graph editor:** ReactFlow-based visual editor for scene nodes
- **Inspector panel:** Property editing for selected nodes
- **Game iframe:** Separate preview window (requires full scene execution)
- **Validation:** Real-time validation feedback

Existing infrastructure to leverage:

```typescript
// Shared UI components (@pixsim7/shared.ui)
import { Button, Modal, Tabs, Tooltip, Toast, Panel } from '@pixsim7/shared.ui';

// Game components (@pixsim7/game-ui)
import { ScenePlayer } from '@pixsim7/game-ui';

// Graph templates (already exists!)
import { GraphTemplate, TemplateParameter } from '../lib/graph/graphTemplates';

// Preview bridge (already exists but unused)
// Located at apps/main/src/lib/preview-bridge (exact path TBD)
```

Current gaps:

1. **No quick scene testing** - Must launch full game to test a scene
2. **No visual previews** - Video nodes show metadata only, no thumbnails
3. **Template system underutilized** - GraphTemplate exists but no UI for browsing/using templates
4. **No copy/paste** - Can't duplicate node subgraphs
5. **No scene snippets** - Can't save/reuse partial scene patterns

Scope

Includes:

- `apps/main/src/components/scene-player/` - In-editor scene playback panel
- `apps/main/src/components/media-preview/` - Media thumbnail and preview components
- `apps/main/src/components/graph-template/` - Template browser and wizard UI
- `apps/main/src/lib/graph/clipboard.ts` - Copy/paste utilities for nodes
- Integration with existing `@pixsim7/shared.ui` components
- Integration with existing `ScenePlayer` from `@pixsim7/game-ui`
- Integration with existing `GraphTemplate` system

Out of scope:

- Full-featured game player (use existing ScenePlayer)
- Backend changes (all front-end only)
- New graph template system (leverage existing)
- New UI component library (use @pixsim7/shared.ui)

Problems & Proposed Work

1. In-Editor Scene Playback

Problem:

- Testing a scene requires switching to game iframe and navigating to scene
- No way to "play from this node" for quick iteration
- Can't step through scene execution to debug branching
- Can't mock game state (flags, relationships) for testing conditions

Proposed:

Create `apps/main/src/components/scene-player/ScenePlaybackPanel.tsx`:

```typescript
import { useState, useCallback } from 'react';
import { ScenePlayer } from '@pixsim7/game-ui';
import { Button, Tabs, Panel, Modal } from '@pixsim7/shared.ui';
import { useGraphStore } from '../../stores/graphStore';

/**
 * Scene Playback Panel - In-editor scene testing
 *
 * Leverages existing ScenePlayer from @pixsim7/game-ui
 * Adds editor-specific controls (step-through, mock state, start from node)
 */
export function ScenePlaybackPanel() {
  const getCurrentScene = useGraphStore(s => s.getCurrentScene);
  const [playbackMode, setPlaybackMode] = useState<'full' | 'step'>('full');
  const [startNodeId, setStartNodeId] = useState<string | null>(null);
  const [mockState, setMockState] = useState<Record<string, any>>({});

  const scene = getCurrentScene();
  if (!scene) return <div>No scene selected</div>;

  return (
    <Panel title="Scene Playback">
      {/* Playback controls */}
      <div className="flex gap-2 p-2 border-b">
        <Button onClick={() => startPlayback()}>
          ▶️ Play Scene
        </Button>
        <Button onClick={() => setPlaybackMode('step')}>
          ⏯️ Step Mode
        </Button>
        <Button onClick={() => stopPlayback()}>
          ⏹️ Stop
        </Button>
      </div>

      {/* Mock state editor */}
      <Tabs tabs={['Playback', 'Mock State']}>
        <div className="playback-view">
          {/* Use existing ScenePlayer */}
          <ScenePlayer
            sceneData={scene}
            startNodeId={startNodeId || scene.startNodeId}
            initialState={mockState}
            onComplete={handleComplete}
            onNodeExecute={handleNodeExecute}
          />
        </div>

        <div className="mock-state-editor">
          {/* Simple JSON editor for mocking state */}
          <MockStateEditor
            state={mockState}
            onChange={setMockState}
          />
        </div>
      </Tabs>

      {/* Execution timeline */}
      <PlaybackTimeline events={playbackEvents} />
    </Panel>
  );
}
```

Create `apps/main/src/components/scene-player/PlaybackTimeline.tsx`:

```typescript
import { Badge } from '@pixsim7/shared.ui';

/**
 * Visual timeline showing scene execution path
 */
export function PlaybackTimeline({ events }: { events: PlaybackEvent[] }) {
  return (
    <div className="timeline p-4 border-t">
      <h3 className="text-sm font-semibold mb-2">Execution Path</h3>
      <div className="space-y-1">
        {events.map((event, i) => (
          <div key={i} className="flex items-center gap-2">
            <Badge>{event.nodeType}</Badge>
            <span className="text-xs">{event.nodeId}</span>
            {event.choice && (
              <span className="text-xs text-neutral-500">→ Choice: {event.choice}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

Add context menu to nodes for "Play from here":

```typescript
// In SceneNode.tsx or GraphPanel.tsx
const handleContextMenu = useCallback((e: React.MouseEvent, nodeId: string) => {
  e.preventDefault();

  // Show context menu with options
  showContextMenu([
    { label: 'Edit Properties', onClick: () => openInspector(nodeId) },
    { label: 'Play from Here', onClick: () => startPlaybackFromNode(nodeId) },
    { label: 'Copy', onClick: () => copyNode(nodeId) },
    { label: 'Delete', onClick: () => deleteNode(nodeId) },
  ]);
}, []);
```

**Key design decisions:**

- ✅ **Reuse ScenePlayer** - Don't rebuild game logic, use existing component
- ✅ **Add editor controls** - Step mode, mock state, start from node
- ✅ **Use shared UI** - Button, Tabs, Panel from @pixsim7/shared.ui
- ✅ **Minimal new code** - Mostly wiring existing components together

Acceptance:

- Can play scene directly in editor panel
- "Play from here" context menu on nodes works
- Step-through mode allows debugging
- Mock state editor allows testing conditions
- Execution timeline shows path taken
- Uses existing ScenePlayer from @pixsim7/game-ui

2. Visual Content Preview in Nodes

Problem:

- Video nodes show metadata but no thumbnail
- No quick preview of media content
- Difficult to visually identify which node contains what content

Proposed:

Create `apps/main/src/components/media-preview/MediaThumbnail.tsx`:

```typescript
import { useState } from 'react';
import { Modal, Button } from '@pixsim7/shared.ui';

/**
 * Media thumbnail with quick preview modal
 */
export function MediaThumbnail({
  assetId,
  type,
  thumbnailUrl,
  duration,
}: {
  assetId: number;
  type: 'video' | 'image' | 'audio';
  thumbnailUrl?: string;
  duration?: number;
}) {
  const [showPreview, setShowPreview] = useState(false);

  return (
    <>
      {/* Thumbnail in node */}
      <div
        className="relative cursor-pointer group"
        onClick={() => setShowPreview(true)}
      >
        {type === 'video' && thumbnailUrl && (
          <img
            src={thumbnailUrl}
            alt="Video thumbnail"
            className="w-full h-20 object-cover rounded"
          />
        )}

        {/* Duration overlay */}
        {duration && (
          <span className="absolute bottom-1 right-1 bg-black/70 text-white text-xs px-1 rounded">
            {formatDuration(duration)}
          </span>
        )}

        {/* Play icon overlay on hover */}
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
          <span className="text-white text-2xl">▶️</span>
        </div>
      </div>

      {/* Quick preview modal (uses shared Modal) */}
      {showPreview && (
        <Modal
          isOpen={showPreview}
          onClose={() => setShowPreview(false)}
          title="Media Preview"
        >
          <MediaPreview assetId={assetId} type={type} />
        </Modal>
      )}
    </>
  );
}
```

Enhance `VideoNodeRenderer.tsx`:

```typescript
import { MediaThumbnail } from '../media-preview/MediaThumbnail';

export function VideoNodeRenderer({ node, isSelected, isStart, hasErrors }: NodeRendererProps) {
  const videoNode = node as VideoNodeData;
  const asset = useAsset(videoNode.asset_id);  // Hook to fetch asset

  return (
    <div className="px-3 py-3 space-y-2">
      {/* Existing node header */}
      <div className="flex items-center gap-2">
        {/* ... existing code ... */}
      </div>

      {/* NEW: Media thumbnail */}
      {asset && (
        <MediaThumbnail
          assetId={asset.id}
          type="video"
          thumbnailUrl={asset.thumbnail_url}
          duration={asset.duration_sec}
        />
      )}

      {/* Existing content */}
      {/* ... */}
    </div>
  );
}
```

**Key design decisions:**

- ✅ **Use existing asset system** - Leverage asset fetching hooks
- ✅ **Use shared Modal** - Don't build custom modal
- ✅ **Lazy load thumbnails** - Only fetch when node is in viewport
- ✅ **Keep nodes compact** - Thumbnails are optional, can be toggled

Acceptance:

- Video nodes show thumbnails in graph view
- Click thumbnail to open quick preview modal
- Duration overlay shows on video thumbnails
- Audio nodes show waveform preview (if available)
- Image nodes show thumbnail
- Preview modal uses shared Modal component

3. Enhanced Template Workflows

Problem:

- GraphTemplate system exists but no UI for browsing/using templates
- Users don't know templates exist
- Can't easily discover common scene patterns

Proposed:

Create `apps/main/src/components/graph-template/TemplateBrowserPanel.tsx`:

```typescript
import { useState, useMemo } from 'react';
import { Button, Tabs, Input, Badge } from '@pixsim7/shared.ui';
import { useTemplateStore } from '../../stores/templateStore';
import type { GraphTemplate, TemplateCategory } from '../../lib/graph/graphTemplates';

/**
 * Template Browser Panel
 *
 * Browse, search, and apply existing GraphTemplate library
 * Integrates with existing template system (graphTemplates.ts)
 */
export function TemplateBrowserPanel() {
  const templates = useTemplateStore(s => s.templates);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<TemplateCategory | null>(null);

  // Filter templates
  const filteredTemplates = useMemo(() => {
    return Object.values(templates).filter(t => {
      const matchesSearch = !searchQuery ||
        t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.description?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCategory = !selectedCategory || t.category === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [templates, searchQuery, selectedCategory]);

  return (
    <div className="h-full flex flex-col">
      {/* Search and filters */}
      <div className="p-4 border-b space-y-2">
        <Input
          placeholder="Search templates..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        {/* Category pills */}
        <div className="flex gap-2 flex-wrap">
          {TEMPLATE_CATEGORIES.map(cat => (
            <Badge
              key={cat}
              onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
              className={selectedCategory === cat ? 'bg-blue-500 text-white' : ''}
            >
              {cat}
            </Badge>
          ))}
        </div>
      </div>

      {/* Template grid */}
      <div className="flex-1 overflow-auto p-4">
        <div className="grid grid-cols-2 gap-4">
          {filteredTemplates.map(template => (
            <TemplateCard
              key={template.id}
              template={template}
              onApply={() => applyTemplate(template)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
```

Create `apps/main/src/components/graph-template/TemplateWizard.tsx`:

```typescript
import { useState } from 'react';
import { Modal, Button, Input } from '@pixsim7/shared.ui';
import type { GraphTemplate, TemplateParameter } from '../../lib/graph/graphTemplates';

/**
 * Template Wizard - Guides user through applying parameterized template
 *
 * Uses existing TemplateParameter system from graphTemplates.ts
 */
export function TemplateWizard({
  template,
  onApply,
  onCancel,
}: {
  template: GraphTemplate;
  onApply: (values: Record<string, any>) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<Record<string, any>>(() => {
    const defaults: Record<string, any> = {};
    template.parameters?.forEach(param => {
      defaults[param.id] = param.defaultValue;
    });
    return defaults;
  });

  return (
    <Modal
      isOpen={true}
      onClose={onCancel}
      title={`Apply Template: ${template.name}`}
    >
      <div className="space-y-4">
        <p className="text-sm text-neutral-600">{template.description}</p>

        {/* Parameter inputs */}
        {template.parameters?.map(param => (
          <div key={param.id} className="space-y-1">
            <label className="text-sm font-medium">{param.name}</label>
            {param.description && (
              <p className="text-xs text-neutral-500">{param.description}</p>
            )}
            <Input
              type={param.type === 'number' ? 'number' : 'text'}
              value={values[param.id]}
              onChange={(e) => setValues({
                ...values,
                [param.id]: param.type === 'number'
                  ? parseFloat(e.target.value)
                  : e.target.value
              })}
            />
          </div>
        ))}

        {/* Actions */}
        <div className="flex gap-2 justify-end">
          <Button onClick={onCancel} variant="secondary">
            Cancel
          </Button>
          <Button onClick={() => onApply(values)}>
            Apply Template
          </Button>
        </div>
      </div>
    </Modal>
  );
}
```

**Key design decisions:**

- ✅ **Use existing GraphTemplate** - Don't create new template system
- ✅ **Use shared UI** - Modal, Button, Input, Badge from @pixsim7/shared.ui
- ✅ **Surface existing features** - Many templates may already exist, just need UI
- ✅ **Template wizard** - Guide users through parameterized templates

Acceptance:

- Template browser panel shows all available templates
- Search and category filtering works
- Template cards show preview (if available in GraphTemplate.preview)
- Applying template instantiates nodes in current scene
- Template wizard appears for parameterized templates
- Uses existing GraphTemplate system (no new backend)

4. Copy/Paste and Scene Snippets

Problem:

- Can't duplicate nodes or subgraphs
- Must manually recreate common patterns
- No clipboard support for graph elements

Proposed:

Create `apps/main/src/lib/graph/clipboard.ts`:

```typescript
import type { DraftSceneNode, DraftEdge } from '../../modules/scene-builder';

interface ClipboardData {
  nodes: DraftSceneNode[];
  edges: DraftEdge[];
  type: 'pixsim7-graph-snippet';
}

/**
 * Graph clipboard utilities
 *
 * Simple copy/paste system for scene graph nodes and edges
 */
export const graphClipboard = {
  /**
   * Copy selected nodes and their edges to clipboard
   */
  copy(nodeIds: string[], allNodes: DraftSceneNode[], allEdges: DraftEdge[]): void {
    const nodes = allNodes.filter(n => nodeIds.includes(n.id));
    const nodeIdSet = new Set(nodeIds);

    // Include edges where both source and target are selected
    const edges = allEdges.filter(e =>
      nodeIdSet.has(e.source) && nodeIdSet.has(e.target)
    );

    const data: ClipboardData = {
      nodes,
      edges,
      type: 'pixsim7-graph-snippet',
    };

    // Store in localStorage (system clipboard has CORS restrictions)
    localStorage.setItem('pixsim7-clipboard', JSON.stringify(data));
  },

  /**
   * Paste nodes from clipboard into scene
   */
  paste(
    currentNodes: DraftSceneNode[],
    offsetPosition?: { x: number; y: number }
  ): { nodes: DraftSceneNode[]; edges: DraftEdge[] } | null {
    const clipboardJson = localStorage.getItem('pixsim7-clipboard');
    if (!clipboardJson) return null;

    try {
      const data: ClipboardData = JSON.parse(clipboardJson);
      if (data.type !== 'pixsim7-graph-snippet') return null;

      // Generate new IDs for pasted nodes
      const idMap = new Map<string, string>();
      const pastedNodes = data.nodes.map(node => {
        const newId = crypto.randomUUID();
        idMap.set(node.id, newId);

        return {
          ...node,
          id: newId,
          metadata: {
            ...node.metadata,
            position: offsetPosition ? {
              x: (node.metadata?.position?.x || 0) + offsetPosition.x,
              y: (node.metadata?.position?.y || 0) + offsetPosition.y,
            } : node.metadata?.position,
          },
        };
      });

      // Remap edge IDs
      const pastedEdges = data.edges.map(edge => ({
        ...edge,
        id: crypto.randomUUID(),
        source: idMap.get(edge.source) || edge.source,
        target: idMap.get(edge.target) || edge.target,
      }));

      return { nodes: pastedNodes, edges: pastedEdges };
    } catch (error) {
      console.error('Failed to paste:', error);
      return null;
    }
  },

  /**
   * Check if clipboard has valid graph data
   */
  hasClipboardData(): boolean {
    const data = localStorage.getItem('pixsim7-clipboard');
    if (!data) return false;

    try {
      const parsed = JSON.parse(data);
      return parsed.type === 'pixsim7-graph-snippet';
    } catch {
      return false;
    }
  },
};
```

Add keyboard shortcuts to graph panel:

```typescript
// In GraphPanel or SceneBuilderPanel
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    // Copy (Ctrl+C / Cmd+C)
    if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
      const selectedNodeIds = getSelectedNodeIds();
      graphClipboard.copy(selectedNodeIds, nodes, edges);
      toast.success(`Copied ${selectedNodeIds.length} node(s)`);
    }

    // Paste (Ctrl+V / Cmd+V)
    if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
      const pasted = graphClipboard.paste(nodes, { x: 50, y: 50 });
      if (pasted) {
        addNodesToScene(pasted.nodes, pasted.edges);
        toast.success(`Pasted ${pasted.nodes.length} node(s)`);
      }
    }

    // Duplicate (Ctrl+D / Cmd+D)
    if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
      const selectedNodeIds = getSelectedNodeIds();
      graphClipboard.copy(selectedNodeIds, nodes, edges);
      const pasted = graphClipboard.paste(nodes, { x: 20, y: 20 });
      if (pasted) {
        addNodesToScene(pasted.nodes, pasted.edges);
        toast.success(`Duplicated ${pasted.nodes.length} node(s)`);
      }
    }
  };

  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [nodes, edges]);
```

**Key design decisions:**

- ✅ **Simple localStorage clipboard** - Avoid system clipboard CORS issues
- ✅ **Standard shortcuts** - Ctrl+C, Ctrl+V, Ctrl+D
- ✅ **ID remapping** - Generate new IDs for pasted nodes
- ✅ **Position offset** - Paste with slight offset to avoid overlap
- ✅ **Use shared Toast** - Feedback via existing toast system

Acceptance:

- Ctrl+C copies selected nodes
- Ctrl+V pastes nodes with new IDs
- Ctrl+D duplicates selected nodes
- Pasted nodes maintain relative positions
- Edges between pasted nodes are preserved
- Toast notifications confirm copy/paste actions

Integration with Existing Systems

All components leverage existing infrastructure:

```typescript
// Shared UI
import { Button, Modal, Tabs, Tooltip, Toast, Panel, Input, Badge } from '@pixsim7/shared.ui';

// Game components
import { ScenePlayer } from '@pixsim7/game-ui';

// Graph templates (already exists)
import { GraphTemplate, TemplateParameter } from '../lib/graph/graphTemplates';

// Stores
import { useGraphStore } from '../stores/graphStore';
import { useTemplateStore } from '../stores/templateStore';
import { useWorkspaceStore } from '../stores/workspaceStore';

// Asset management
import { useAsset } from '../hooks/useAsset';
```

Testing Plan

Unit Tests:

- `lib/graph/clipboard.test.ts`:
  - Copy/paste preserves node structure
  - ID remapping works correctly
  - Edge remapping handles all cases

- `components/media-preview/MediaThumbnail.test.tsx`:
  - Thumbnail renders for different media types
  - Preview modal opens/closes correctly

Integration Tests:

- Play scene from editor → ScenePlayer executes correctly
- Apply template → Nodes instantiated in scene
- Copy/paste nodes → IDs regenerated, edges preserved
- Search templates → Filtering works

Manual Testing:

- Play scene in editor panel
- "Play from here" on various nodes
- Mock state affects scene execution
- Video thumbnails load in nodes
- Quick preview modal works
- Template browser shows all templates
- Apply parameterized template via wizard
- Copy/paste subgraph with Ctrl+C/V
- Duplicate nodes with Ctrl+D

Documentation Updates

- Update `docs/SCENE_EDITOR.md` (new file):
  - Scene playback and testing workflow
  - Template usage guide
  - Copy/paste shortcuts
  - Media preview features

- Update `ARCHITECTURE.md`:
  - Document editor-game integration via ScenePlayer
  - Explain template system UI layer

- Add comments to new components explaining integration points

Migration Notes

No breaking changes. All features are additive:

- Scene playback panel is optional (new panel in workspace)
- Media thumbnails enhance existing nodes (backward compatible)
- Template browser surfaces existing template system
- Copy/paste is new feature (doesn't affect existing workflows)

Follow-Up Tasks

This task is part of the editor improvement series:

- **Task 49** (this task): Playback, preview & templates
- **Task 50**: Collaboration features (comments, change tracking)
- **Task 51**: Advanced validation (grammar check, unused asset warnings)
- **Task 52**: Batch operations and import/export tools

Related Work:

- GraphTemplate system: Already implemented, needs UI
- ScenePlayer: Already exists in @pixsim7/game-ui
- Preview bridge: Exists but underutilized

Success Criteria

- [ ] Scene playback panel uses existing ScenePlayer from @pixsim7/game-ui
- [ ] "Play from here" context menu works on all nodes
- [ ] Step-through mode and mock state editor functional
- [ ] Execution timeline shows playback path
- [ ] Media thumbnails appear in video/image nodes
- [ ] Quick preview modal uses shared Modal component
- [ ] Template browser shows all GraphTemplate library
- [ ] Template wizard handles parameterized templates
- [ ] Copy/paste with Ctrl+C/V works for node subgraphs
- [ ] Ctrl+D duplicates selected nodes
- [ ] All new components use @pixsim7/shared.ui components
- [ ] No duplicate implementations of existing components
- [ ] Documentation complete
- [ ] Unit and integration tests pass
"""

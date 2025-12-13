import { useState, useMemo } from 'react';
import { nodeTypeRegistry, type NodeTypeDefinition } from '@lib/registries';

export type NodeType = string; // Now accepts any registered node type

interface NodePaletteItem {
  type: string;
  label: string;
  description: string;
  icon: string;
  color: string;
  bgColor: string;
  category?: string;
}

// Helper to convert registry definition to palette item
function toNodePaletteItem(def: NodeTypeDefinition): NodePaletteItem {
  return {
    type: def.id,
    label: def.name,
    description: def.description || '',
    icon: def.icon || '📦',
    color: def.color || 'text-neutral-700 dark:text-neutral-300',
    bgColor: def.bgColor || 'bg-neutral-100 dark:bg-neutral-900/30',
    category: def.category,
  };
}

interface NodePaletteProps {
  onNodeCreate: (nodeType: NodeType, position?: { x: number; y: number }) => void;
  compact?: boolean;
  /**
   * Filter node types by scope.
   * - 'scene': Show only scene-level nodes (video, choice, condition, etc.)
   * - 'arc': Show only arc-level nodes (quest triggers, story beats, etc.)
   * - 'world': Show only world-level nodes (global state, etc.)
   * - undefined: Show all node types
   */
  scope?: 'scene' | 'arc' | 'world';
}

export function NodePalette({ onNodeCreate, compact = false, scope }: NodePaletteProps) {
  const [draggedType, setDraggedType] = useState<NodeType | null>(null);

  // Get creatable node types from registry, filtered by scope if provided
  const nodeTypes = useMemo(() => {
    let types = nodeTypeRegistry.getUserCreatable();

    // Filter by scope if specified
    // NOTE: All node types should now have an explicit scope defined.
    // - scope: 'scene' - Scene-level nodes (video, choice, condition, etc.)
    // - scope: 'arc' - Arc-level nodes (quest triggers, story beats, etc.)
    // - scope: 'world' - World-level nodes (global state, etc.)
    if (scope) {
      types = types.filter(def => def.scope === scope);
    }

    return types
      .map(toNodePaletteItem)
      .sort((a, b) => {
        // Sort by category, then by label
        const catA = a.category || 'zz';
        const catB = b.category || 'zz';
        if (catA !== catB) return catA.localeCompare(catB);
        return a.label.localeCompare(b.label);
      });
  }, [scope]);

  const handleDragStart = (e: React.DragEvent, nodeType: NodeType) => {
    setDraggedType(nodeType);
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('application/reactflow-nodetype', nodeType);
  };

  const handleDragEnd = () => {
    setDraggedType(null);
  };

  const handleClick = (nodeType: NodeType) => {
    onNodeCreate(nodeType);
  };

  if (compact) {
    return (
      <div className="flex gap-1 flex-wrap">
        {nodeTypes.map((nodeDef) => (
          <button
            key={nodeDef.type}
            className={`
              px-2 py-1 rounded text-xs font-medium cursor-pointer
              transition-all duration-150 hover:scale-105
              ${nodeDef.bgColor} ${nodeDef.color}
              border border-transparent hover:border-current
            `}
            onClick={() => handleClick(nodeDef.type)}
            draggable
            onDragStart={(e) => handleDragStart(e, nodeDef.type)}
            onDragEnd={handleDragEnd}
            title={nodeDef.description}
          >
            <span className="mr-1">{nodeDef.icon}</span>
            {nodeDef.label}
          </button>
        ))}
      </div>
    );
  }

  // Group by category
  const byCategory = useMemo(() => {
    const groups: Record<string, NodePaletteItem[]> = {};
    nodeTypes.forEach((item) => {
      const cat = item.category || 'custom';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    });
    return groups;
  }, [nodeTypes]);

  const categoryOrder = ['media', 'flow', 'logic', 'action', 'custom'];

  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-2">
        Node Types
      </div>
      {categoryOrder.map((category) => {
        const items = byCategory[category];
        if (!items || items.length === 0) return null;

        return (
          <div key={category} className="space-y-2">
            {/* Category label */}
            <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
              {category}
            </div>
            {/* Category items */}
            {items.map((nodeDef) => (
              <div
                key={nodeDef.type}
                className={`
                  p-3 rounded-lg cursor-pointer border-2
                  transition-all duration-150 hover:scale-105 hover:shadow-md
                  ${nodeDef.bgColor} ${nodeDef.color}
                  ${draggedType === nodeDef.type ? 'opacity-50 scale-95' : ''}
                  border-transparent hover:border-current
                `}
                onClick={() => handleClick(nodeDef.type)}
                draggable
                onDragStart={(e) => handleDragStart(e, nodeDef.type)}
                onDragEnd={handleDragEnd}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl">{nodeDef.icon}</span>
                  <span className="font-semibold text-sm">{nodeDef.label}</span>
                </div>
                <div className="text-xs opacity-80">{nodeDef.description}</div>
              </div>
            ))}
          </div>
        );
      })}
      <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-3 pt-2 border-t dark:border-neutral-700">
        💡 Click to add or drag onto canvas
      </div>
    </div>
  );
}

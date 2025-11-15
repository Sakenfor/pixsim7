import { useState } from 'react';

export type NodeType = 'video' | 'choice' | 'condition' | 'miniGame' | 'end' | 'scene_call' | 'return' | 'node_group';

export interface NodeTypeDefinition {
  type: NodeType;
  label: string;
  description: string;
  icon: string;
  color: string;
  bgColor: string;
}

export const NODE_TYPES: NodeTypeDefinition[] = [
  {
    type: 'video',
    label: 'Video',
    description: 'Play video segments with selection strategy',
    icon: '🎬',
    color: 'text-blue-700 dark:text-blue-300',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
  },
  {
    type: 'choice',
    label: 'Choice',
    description: 'Present choices to the player',
    icon: '🔀',
    color: 'text-purple-700 dark:text-purple-300',
    bgColor: 'bg-purple-100 dark:bg-purple-900/30',
  },
  {
    type: 'condition',
    label: 'Condition',
    description: 'Branch based on game state',
    icon: '❓',
    color: 'text-amber-700 dark:text-amber-300',
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
  },
  {
    type: 'miniGame',
    label: 'Mini-Game',
    description: 'Interactive gameplay segment',
    icon: '🎮',
    color: 'text-green-700 dark:text-green-300',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
  },
  {
    type: 'end',
    label: 'End',
    description: 'Terminal node',
    icon: '🏁',
    color: 'text-red-700 dark:text-red-300',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
  },
  {
    type: 'scene_call',
    label: 'Scene Call',
    description: 'Call another scene as a function',
    icon: '📞',
    color: 'text-cyan-700 dark:text-cyan-300',
    bgColor: 'bg-cyan-100 dark:bg-cyan-900/30',
  },
  {
    type: 'return',
    label: 'Return',
    description: 'Exit scene through return point',
    icon: '🔙',
    color: 'text-orange-700 dark:text-orange-300',
    bgColor: 'bg-orange-100 dark:bg-orange-900/30',
  },
  {
    type: 'node_group',
    label: 'Group',
    description: 'Visual container for organizing nodes',
    icon: '📦',
    color: 'text-neutral-700 dark:text-neutral-300',
    bgColor: 'bg-neutral-100 dark:bg-neutral-900/30',
  },
];

interface NodePaletteProps {
  onNodeCreate: (nodeType: NodeType, position?: { x: number; y: number }) => void;
  compact?: boolean;
}

export function NodePalette({ onNodeCreate, compact = false }: NodePaletteProps) {
  const [draggedType, setDraggedType] = useState<NodeType | null>(null);

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
        {NODE_TYPES.map((nodeDef) => (
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

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-2">
        Node Types
      </div>
      {NODE_TYPES.map((nodeDef) => (
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
      <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-3 pt-2 border-t dark:border-neutral-700">
        💡 Click to add or drag onto canvas
      </div>
    </div>
  );
}

import type { CubeType, CubeFace } from '../../stores/controlCubeStore';
import type { CubeFaceContent } from './ControlCube';
import { panelActionRegistry } from '../../lib/panelActions';

/**
 * Contextual face content based on cube type and docked panel
 *
 * This component generates face content dynamically:
 * 1. If docked to a panel with registered actions, use those
 * 2. Otherwise, use static defaults based on panel ID
 * 3. Finally, fall back to generic cube type defaults
 */

// Control Cube - Main actions
export const ControlCubeFaces = (dockedPanelId?: string): CubeFaceContent => {
  // If docked to a panel, show panel-specific controls
  if (dockedPanelId === 'gallery') {
    return {
      front: <div className="text-blue-300 text-sm">🖼️<br/>Gallery</div>,
      back: <div className="text-purple-300 text-sm">🎨<br/>Filter</div>,
      left: <div className="text-indigo-300 text-sm">📁<br/>Folder</div>,
      right: <div className="text-cyan-300 text-sm">🗑️<br/>Delete</div>,
      top: <div className="text-violet-300 text-sm">⬆️<br/>Upload</div>,
      bottom: <div className="text-blue-400 text-sm">⬇️<br/>Download</div>,
    };
  }

  if (dockedPanelId === 'scene') {
    return {
      front: <div className="text-blue-300 text-sm">🎬<br/>Scene</div>,
      back: <div className="text-purple-300 text-sm">🎭<br/>Layer</div>,
      left: <div className="text-indigo-300 text-sm">🎨<br/>Paint</div>,
      right: <div className="text-cyan-300 text-sm">🔧<br/>Tool</div>,
      top: <div className="text-violet-300 text-sm">➕<br/>Add</div>,
      bottom: <div className="text-blue-400 text-sm">🎯<br/>Select</div>,
    };
  }

  if (dockedPanelId === 'graph') {
    return {
      front: <div className="text-blue-300 text-sm">📊<br/>Graph</div>,
      back: <div className="text-purple-300 text-sm">🔗<br/>Connect</div>,
      left: <div className="text-indigo-300 text-sm">➕<br/>Node</div>,
      right: <div className="text-cyan-300 text-sm">✂️<br/>Cut</div>,
      top: <div className="text-violet-300 text-sm">📋<br/>Copy</div>,
      bottom: <div className="text-blue-400 text-sm">🗑️<br/>Delete</div>,
    };
  }

  // Default control cube faces
  return {
    front: <div className="text-blue-300 text-lg">⚡<br/><span className="text-xs">Quick</span></div>,
    back: <div className="text-purple-300 text-lg">🎮<br/><span className="text-xs">Control</span></div>,
    left: <div className="text-indigo-300 text-lg">🎨<br/><span className="text-xs">Style</span></div>,
    right: <div className="text-cyan-300 text-lg">📊<br/><span className="text-xs">Stats</span></div>,
    top: <div className="text-violet-300 text-lg">⚙️<br/><span className="text-xs">Settings</span></div>,
    bottom: <div className="text-blue-400 text-lg">🔍<br/><span className="text-xs">Search</span></div>,
  };
};

// Provider Cube - Provider management
export const ProviderCubeFaces = (dockedPanelId?: string): CubeFaceContent => {
  return {
    front: <div className="text-green-300 text-lg">🌐<br/><span className="text-xs">Provider</span></div>,
    back: <div className="text-teal-300 text-lg">📡<br/><span className="text-xs">Connect</span></div>,
    left: <div className="text-emerald-300 text-lg">🔌<br/><span className="text-xs">Plugin</span></div>,
    right: <div className="text-lime-300 text-lg">⚙️<br/><span className="text-xs">Config</span></div>,
    top: <div className="text-green-400 text-lg">✨<br/><span className="text-xs">Status</span></div>,
    bottom: <div className="text-teal-400 text-lg">📊<br/><span className="text-xs">Usage</span></div>,
  };
};

// Preset Cube - Preset management
export const PresetCubeFaces = (dockedPanelId?: string): CubeFaceContent => {
  return {
    front: <div className="text-orange-300 text-lg">🎭<br/><span className="text-xs">Preset</span></div>,
    back: <div className="text-red-300 text-lg">📋<br/><span className="text-xs">List</span></div>,
    left: <div className="text-amber-300 text-lg">💾<br/><span className="text-xs">Save</span></div>,
    right: <div className="text-yellow-300 text-lg">⭐<br/><span className="text-xs">Favorite</span></div>,
    top: <div className="text-orange-400 text-lg">🎨<br/><span className="text-xs">Create</span></div>,
    bottom: <div className="text-red-400 text-lg">📂<br/><span className="text-xs">Browse</span></div>,
  };
};

// Panel Cube - Panel management
export const PanelCubeFaces = (dockedPanelId?: string): CubeFaceContent => {
  return {
    front: <div className="text-cyan-300 text-lg">🪟<br/><span className="text-xs">Panel</span></div>,
    back: <div className="text-indigo-300 text-lg">📐<br/><span className="text-xs">Layout</span></div>,
    left: <div className="text-sky-300 text-lg">🔲<br/><span className="text-xs">Tile</span></div>,
    right: <div className="text-blue-300 text-lg">📊<br/><span className="text-xs">Float</span></div>,
    top: <div className="text-cyan-400 text-lg">✨<br/><span className="text-xs">Maximize</span></div>,
    bottom: <div className="text-indigo-400 text-lg">⚡<br/><span className="text-xs">Close</span></div>,
  };
};

// Settings Cube - Settings and configuration
export const SettingsCubeFaces = (dockedPanelId?: string): CubeFaceContent => {
  return {
    front: <div className="text-gray-300 text-lg">⚙️<br/><span className="text-xs">Settings</span></div>,
    back: <div className="text-slate-300 text-lg">🔧<br/><span className="text-xs">Tools</span></div>,
    left: <div className="text-zinc-300 text-lg">🎛️<br/><span className="text-xs">Controls</span></div>,
    right: <div className="text-neutral-300 text-lg">📝<br/><span className="text-xs">Notes</span></div>,
    top: <div className="text-gray-400 text-lg">🔑<br/><span className="text-xs">Keys</span></div>,
    bottom: <div className="text-slate-400 text-lg">💡<br/><span className="text-xs">Help</span></div>,
  };
};

/**
 * Get appropriate face content based on cube type and context
 *
 * Priority:
 * 1. Dynamic panel actions (if panel has registered actions)
 * 2. Static panel-specific faces (hardcoded for known panels)
 * 3. Generic cube type defaults
 */
export function getCubeFaceContent(type: CubeType, dockedPanelId?: string): CubeFaceContent {
  // If docked to a panel, try to get dynamic actions first
  if (dockedPanelId) {
    const dynamicFaces = getDynamicPanelFaces(dockedPanelId);
    if (dynamicFaces) {
      return dynamicFaces;
    }
  }

  // Fall back to static faces based on cube type
  switch (type) {
    case 'control':
      return ControlCubeFaces(dockedPanelId);
    case 'provider':
      return ProviderCubeFaces(dockedPanelId);
    case 'preset':
      return PresetCubeFaces(dockedPanelId);
    case 'panel':
      return PanelCubeFaces(dockedPanelId);
    case 'settings':
      return SettingsCubeFaces(dockedPanelId);
    default:
      return ControlCubeFaces(dockedPanelId);
  }
}

/**
 * Generate dynamic face content from panel's registered actions
 */
function getDynamicPanelFaces(panelId: string): CubeFaceContent | null {
  const faceMappings = panelActionRegistry.getFaceMappings(panelId);

  // Check if panel has any registered actions
  const hasActions = Object.values(faceMappings).some((action) => action !== null);
  if (!hasActions) {
    return null;
  }

  // Generate face content from actions
  const faces: CubeFaceContent = {};
  const faceOrder: CubeFace[] = ['front', 'back', 'left', 'right', 'top', 'bottom'];

  faceOrder.forEach((face) => {
    const action = faceMappings[face];
    if (action) {
      // Create face content with icon, label, and click handler
      faces[face] = (
        <div
          className="text-sm flex flex-col items-center gap-1 cursor-pointer hover:scale-110 transition-transform"
          onClick={(e) => {
            e.stopPropagation();
            action.execute();
          }}
          title={action.description || action.label}
        >
          <div className="text-2xl">{action.icon}</div>
          <div className="text-xs text-white/90 font-medium">{action.label}</div>
          {action.shortcut && (
            <div className="text-[10px] text-white/60">{action.shortcut}</div>
          )}
        </div>
      );
    }
  });

  return faces;
}

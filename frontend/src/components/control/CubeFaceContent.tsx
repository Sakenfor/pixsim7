import { CubeType, CubeFace } from '../../stores/controlCubeStore';
import { CubeFaceContent } from './ControlCube';

/**
 * Contextual face content based on cube type and docked panel
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
 */
export function getCubeFaceContent(type: CubeType, dockedPanelId?: string): CubeFaceContent {
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

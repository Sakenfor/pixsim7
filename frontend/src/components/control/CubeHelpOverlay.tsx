import { useEffect } from 'react';
import { clsx } from 'clsx';

export interface CubeHelpOverlayProps {
  show: boolean;
  onClose: () => void;
}

interface HelpSection {
  title: string;
  items: Array<{
    action: string;
    description: string;
    shortcut?: string;
  }>;
}

const HELP_SECTIONS: HelpSection[] = [
  {
    title: 'Mouse Interactions',
    items: [
      { action: 'Click center', description: 'Execute face action' },
      { action: 'Click edge', description: 'Rotate to adjacent face' },
      { action: 'Double-click', description: 'Expand cube', shortcut: 'E' },
      { action: 'Drag cube', description: 'Move cube position' },
      { action: 'Hover edge', description: 'Preview adjacent face' },
    ],
  },
  {
    title: 'Keyboard Shortcuts',
    items: [
      { action: 'R', description: 'Rotate active cube' },
      { action: 'E', description: 'Expand/collapse cube' },
      { action: 'D', description: 'Duplicate cube' },
      { action: 'Delete', description: 'Remove cube' },
      { action: 'Arrow keys', description: 'Rotate to different face' },
      { action: '?', description: 'Toggle this help (or H)' },
    ],
  },
  {
    title: 'Combining & Docking',
    items: [
      { action: 'Drag near cube', description: 'Combine when < 120px apart' },
      { action: 'Drag apart', description: 'Separate combined cubes' },
      { action: 'Drag to panel', description: 'Dock to panel edge (< 80px)' },
      { action: 'Double-click docked', description: 'Undock from panel' },
    ],
  },
  {
    title: 'Linking Mode',
    items: [
      { action: 'L', description: 'Enter linking mode' },
      { action: 'Click face', description: 'Select source face' },
      { action: 'Click another', description: 'Create connection' },
      { action: 'ESC', description: 'Cancel linking' },
    ],
  },
  {
    title: 'Gallery Cube',
    items: [
      { action: 'Click asset', description: 'Select asset from gallery' },
      { action: 'Right-click', description: 'Pin asset to current face' },
      { action: 'Rotate faces', description: 'Access pinned assets' },
    ],
  },
  {
    title: 'Formations',
    items: [
      { action: 'F', description: 'Save current formation' },
      { action: 'Shift+F', description: 'Load saved formation' },
      { action: 'Position types', description: 'Line • Circle • Grid • Star' },
    ],
  },
];

/**
 * Help overlay showing all cube interactions and keyboard shortcuts
 */
export function CubeHelpOverlay({ show, onClose }: CubeHelpOverlayProps) {
  useEffect(() => {
    if (!show) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === '?' || e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [show, onClose]);

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-[10002] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative max-w-4xl max-h-[90vh] overflow-y-auto bg-gray-900/95 border border-gray-700 rounded-2xl shadow-2xl p-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
              <span className="text-3xl">🎮</span>
              Control Cubes Guide
            </h2>
            <p className="text-gray-400 mt-1">Master the 3D control interface</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors text-2xl leading-none"
            aria-label="Close help"
          >
            ×
          </button>
        </div>

        {/* Help sections in grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {HELP_SECTIONS.map((section) => (
            <div
              key={section.title}
              className="bg-gray-800/50 border border-gray-700 rounded-xl p-5"
            >
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                {section.title}
              </h3>
              <div className="space-y-3">
                {section.items.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-3 text-sm"
                  >
                    <div className="flex-shrink-0 min-w-[100px]">
                      <kbd
                        className={clsx(
                          'px-2 py-1 rounded text-xs font-mono',
                          'bg-gradient-to-br from-blue-500/20 to-purple-500/20',
                          'border border-blue-400/30 text-blue-200'
                        )}
                      >
                        {item.action}
                      </kbd>
                    </div>
                    <div className="flex-1">
                      <div className="text-gray-300">{item.description}</div>
                      {item.shortcut && (
                        <div className="text-gray-500 text-xs mt-0.5">
                          Shortcut: <kbd className="text-gray-400">{item.shortcut}</kbd>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-6 pt-6 border-t border-gray-700 text-center text-sm text-gray-400">
          <p>
            Press <kbd className="px-2 py-1 bg-gray-800 border border-gray-600 rounded">?</kbd> or{' '}
            <kbd className="px-2 py-1 bg-gray-800 border border-gray-600 rounded">H</kbd> or{' '}
            <kbd className="px-2 py-1 bg-gray-800 border border-gray-600 rounded">ESC</kbd> to
            close this help
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Control Center Manager
 *
 * Minimal core component that renders the active control center plugin.
 * This is the only control center component in the core - all others are plugins.
 */

import { useEffect, useState } from 'react';
import { controlCenterRegistry } from '@/lib/plugins/controlCenterPlugin';
import { Button } from '@pixsim7/shared.ui';
import { useToast } from '@pixsim7/shared.ui';
import { useControlCenterStore } from '@/stores/controlCenterStore';

export function ControlCenterManager() {
  const [activePlugin, setActivePlugin] = useState(() => controlCenterRegistry.getActive());
  const [showSelector, setShowSelector] = useState(false);
  const [availableControlCenters, setAvailableControlCenters] = useState(() =>
    controlCenterRegistry.getAll()
  );
  const toast = useToast();

  // Hide switcher button when control center is expanded
  const controlCenterOpen = useControlCenterStore(s => s.open);

  // Load user preference on mount
  useEffect(() => {
    controlCenterRegistry.loadPreference();
    setActivePlugin(controlCenterRegistry.getActive());
    setAvailableControlCenters(controlCenterRegistry.getAll());
  }, []);

  // Listen for registry changes (when plugins are installed/uninstalled or active changes)
  useEffect(() => {
    const unsubscribe = controlCenterRegistry.subscribe(() => {
      setAvailableControlCenters(controlCenterRegistry.getAll());
      setActivePlugin(controlCenterRegistry.getActive());
    });
    return unsubscribe;
  }, []);

  // Keyboard shortcut to open selector
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'X') {
        e.preventDefault();
        setShowSelector(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSwitch = (id: string) => {
    const success = controlCenterRegistry.setActive(id);
    if (success) {
      setActivePlugin(controlCenterRegistry.getActive());
      setShowSelector(false);

      // Show notification
      const cc = availableControlCenters.find(c => c.id === id);
      if (cc) {
        toast.success(`Switched Control Center to ${cc.displayName}`);
      }
    }
  };

  // If no control center is available, show installation prompt
  if (!activePlugin) {
    return (
      <div className="fixed bottom-4 right-4 z-40 bg-black/80 backdrop-blur-md rounded-lg p-4 text-white max-w-sm">
        <h3 className="font-bold mb-2">⚠️ No Control Center Active</h3>
        <p className="text-sm text-gray-300 mb-3">
          No control center plugin is currently installed or enabled.
        </p>
        <Button
          size="sm"
          onClick={() => window.location.href = '/plugins'}
          className="w-full"
        >
          Go to Plugin Manager
        </Button>
      </div>
    );
  }

  return (
    <>
      {/* Render the active control center */}
      {activePlugin.render()}

      {/* Control Center Selector Overlay */}
      {showSelector && availableControlCenters.length > 1 && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setShowSelector(false)}
        >
          <div
            className="bg-white dark:bg-neutral-900 rounded-xl shadow-2xl max-w-3xl w-full mx-4 max-h-[80vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">Control Center Selector</h2>
                <p className="text-sm text-blue-100">Choose your preferred interface</p>
              </div>
              <button
                onClick={() => setShowSelector(false)}
                className="px-3 py-1.5 text-sm border border-white/30 rounded hover:bg-white/20 transition-colors"
              >
                Close
              </button>
            </div>

            {/* Control Center Grid */}
            <div className="p-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3 overflow-y-auto">
              {availableControlCenters.map((cc) => {
                const isActive = controlCenterRegistry.getActiveId() === cc.id;

                return (
                  <button
                    key={cc.id}
                    onClick={() => handleSwitch(cc.id)}
                    className={`
                      relative p-4 rounded-lg border-2 text-left transition-all
                      ${isActive
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-neutral-200 dark:border-neutral-700 hover:border-blue-300 dark:hover:border-blue-700 hover:bg-neutral-50 dark:hover:bg-neutral-800'
                      }
                    `}
                  >
                    {/* Active badge */}
                    {isActive && (
                      <div className="absolute top-2 right-2 px-2 py-0.5 bg-blue-500 text-white text-xs font-bold rounded">
                        ACTIVE
                      </div>
                    )}

                    {/* Default badge */}
                    {cc.default && !isActive && (
                      <div className="absolute top-2 right-2 px-2 py-0.5 bg-neutral-400 text-white text-xs font-bold rounded">
                        DEFAULT
                      </div>
                    )}

                    <div className="space-y-2">
                      <h3 className="font-bold text-lg">{cc.displayName}</h3>
                      <p className="text-sm text-neutral-600 dark:text-neutral-400">
                        {cc.description}
                      </p>

                      {/* Features */}
                      {cc.features && cc.features.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-2">
                          {cc.features.map((feature) => (
                            <span
                              key={feature}
                              className="px-2 py-0.5 bg-neutral-200 dark:bg-neutral-700 text-xs rounded"
                            >
                              {feature}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Footer */}
            <div className="border-t px-6 py-3 bg-neutral-50 dark:bg-neutral-800 text-xs text-neutral-500 dark:text-neutral-400">
              💡 Tip: Press <kbd className="px-1.5 py-0.5 bg-white dark:bg-neutral-700 rounded border">Ctrl+Shift+X</kbd> to quickly open this selector
            </div>
          </div>
        </div>
      )}

      {/* Quick switcher hint (only show if multiple options and control center is collapsed) */}
      {availableControlCenters.length > 1 && !showSelector && !controlCenterOpen && (
        <button
          onClick={() => setShowSelector(true)}
          className="fixed bottom-4 left-4 z-40 px-3 py-2 bg-black/60 hover:bg-black/80 backdrop-blur-md rounded-lg text-white text-xs transition-all hover:scale-105"
          title="Switch Control Center (Ctrl+Shift+X)"
        >
          🎛️ Control Center: {availableControlCenters.find(c => c.id === controlCenterRegistry.getActiveId())?.displayName}
        </button>
      )}
    </>
  );
}

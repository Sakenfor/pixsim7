/**
 * General Settings Module
 *
 * Control Center selection and application-wide settings.
 */
import { useState, useEffect } from 'react';

import { controlCenterRegistry } from '@lib/plugins/controlCenterPlugin';

import { settingsRegistry } from '../../lib/core/registry';

/** Control Center selection */
function ControlCenterSettings() {
  const [controlCenters, setControlCenters] = useState(() => controlCenterRegistry.getAll());
  const [activeControlCenterId, setActiveControlCenterId] = useState(() => controlCenterRegistry.getActiveId());
  const [switchMessage, setSwitchMessage] = useState('');

  useEffect(() => {
    const unsubscribe = controlCenterRegistry.subscribe(() => {
      setControlCenters(controlCenterRegistry.getAll());
      setActiveControlCenterId(controlCenterRegistry.getActiveId());
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (switchMessage) {
      const timeout = setTimeout(() => setSwitchMessage(''), 3000);
      return () => clearTimeout(timeout);
    }
  }, [switchMessage]);

  const handleControlCenterSwitch = (id: string) => {
    const success = controlCenterRegistry.setActive(id);
    if (success) {
      setActiveControlCenterId(id);
      const cc = controlCenters.find(c => c.id === id);
      if (cc) {
        setSwitchMessage(`Switched to ${cc.displayName}`);
      }
    }
  };

  return (
    <div className="flex-1 overflow-auto p-4 space-y-4 text-xs text-neutral-800 dark:text-neutral-100">
      <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
        Choose your preferred control center interface.
      </p>

      {switchMessage && (
        <div className="p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded text-[11px] text-green-700 dark:text-green-300">
          {switchMessage}
        </div>
      )}

      <div className="space-y-2">
        {controlCenters.map((cc) => {
          const isActive = activeControlCenterId === cc.id;

          return (
            <button
              key={cc.id}
              onClick={() => handleControlCenterSwitch(cc.id)}
              className={`
                w-full text-left p-3 rounded-md border-2 transition-all
                ${isActive
                  ? 'border-blue-500 bg-blue-50/80 dark:bg-blue-900/20'
                  : 'border-neutral-200 dark:border-neutral-700 hover:border-blue-300 dark:hover:border-blue-600 hover:bg-neutral-50 dark:hover:bg-neutral-800'
                }
              `}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="text-[11px] font-semibold text-neutral-800 dark:text-neutral-100">
                  {cc.displayName}
                </div>
                {isActive && (
                  <span className="px-1.5 py-0.5 bg-blue-500 text-white text-[10px] font-bold rounded">
                    ACTIVE
                  </span>
                )}
                {cc.default && !isActive && (
                  <span className="px-1.5 py-0.5 bg-neutral-400 text-white text-[10px] font-bold rounded">
                    DEFAULT
                  </span>
                )}
              </div>
              <div className="text-[10px] text-neutral-600 dark:text-neutral-400 mb-2">
                {cc.description}
              </div>
              {cc.features && cc.features.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {cc.features.map((feature) => (
                    <span
                      key={feature}
                      className="px-1.5 py-0.5 bg-neutral-200 dark:bg-neutral-700 text-[9px] rounded"
                    >
                      {feature}
                    </span>
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="text-[10px] text-neutral-500 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-800/50 p-2 rounded">
        <strong>Tip:</strong> Press <kbd className="px-1 py-0.5 bg-white dark:bg-neutral-700 rounded border text-[9px]">Ctrl+Shift+X</kbd> to quickly open the Control Center selector.
      </div>
    </div>
  );
}

/** Default component - shows control center settings */
export function GeneralSettings() {
  return <ControlCenterSettings />;
}

// Register this module (no sub-sections needed - just Control Center)
settingsRegistry.register({
  id: 'general',
  label: 'General',
  icon: '⚙️',
  component: GeneralSettings,
  order: 10,
});

/**
 * Game Theming Panel
 *
 * Unified panel for all game theming and customization:
 * - Session Overrides: Temporary theme overrides for special moments
 * - Dynamic Rules: Automatic theme changes based on world state
 * - Theme Packs: Import/export theme collections
 * - User Preferences: Accessibility and UI preferences
 */

import { useState } from 'react';

import { Icon } from '@lib/icons';

import { DynamicThemeRulesPanel } from './DynamicThemeRulesPanel';
import { SessionOverridePanel } from './SessionOverridePanel';
import { ThemePacksPanel } from './ThemePacksPanel';
import { UserPreferencesPanel } from './UserPreferencesPanel';

type TabId = 'session' | 'rules' | 'packs' | 'preferences';

interface GameThemingPanelProps {
  // Session override props (passed to SessionOverridePanel)
  currentOverride?: any;
  onApplyOverride?: (override: any) => void;
  onClearOverride?: () => void;

  // User preferences props (passed to UserPreferencesPanel)
  onPreferencesChange?: (preferences: any) => void;

  // Theme pack props (passed to ThemePacksPanel)
  onThemeImported?: () => void;

  // Initial tab
  initialTab?: TabId;
}

export function GameThemingPanel({
  currentOverride,
  onApplyOverride,
  onClearOverride,
  onPreferencesChange,
  onThemeImported,
  initialTab = 'session',
}: GameThemingPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  const tabs = [
    { id: 'session' as const, label: 'Session Override', icon: '✨', description: 'Temporary theme for special moments' },
    { id: 'rules' as const, label: 'Dynamic Rules', icon: '⚙️', description: 'Automatic theme changes' },
    { id: 'packs' as const, label: 'Theme Packs', icon: '📦', description: 'Import/export collections' },
    { id: 'preferences' as const, label: 'User Preferences', icon: '👤', description: 'Accessibility settings' },
  ];

  return (
    <div className="h-full flex flex-col">
      {/* Tab Navigation */}
      <div className="border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900">
        <div className="flex overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex-shrink-0 px-4 py-3 text-sm font-medium border-b-2 transition-colors
                ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-white dark:bg-neutral-950'
                    : 'border-transparent text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                }
              `}
              title={tab.description}
            >
              <Icon name={tab.icon} size={16} className="mr-2" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto p-4">
        {activeTab === 'session' && (
          <SessionOverridePanel
            currentOverride={currentOverride}
            onApplyOverride={onApplyOverride || (() => {})}
            onClearOverride={onClearOverride || (() => {})}
            compact={false}
          />
        )}

        {activeTab === 'rules' && (
          <DynamicThemeRulesPanel />
        )}

        {activeTab === 'packs' && (
          <ThemePacksPanel onThemeImported={onThemeImported} />
        )}

        {activeTab === 'preferences' && (
          <UserPreferencesPanel onPreferencesChange={onPreferencesChange} />
        )}
      </div>
    </div>
  );
}

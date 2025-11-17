/**
 * Example Plugin: Relationship Tracker
 *
 * Shows current NPC relationships in a small overlay.
 * Demonstrates: UI overlay, state reading, storage for settings.
 */

import type { Plugin, PluginAPI, PluginManifest } from '../types';

export const manifest: PluginManifest = {
  id: 'relationship-tracker',
  name: 'Relationship Tracker',
  version: '1.0.0',
  author: 'PixSim Team',
  description: 'Shows NPC relationships in a compact overlay',
  icon: '❤️',
  type: 'ui-overlay',
  permissions: ['read:session', 'ui:overlay', 'storage'],
  main: 'RelationshipTracker.plugin.js',
};

export class RelationshipTrackerPlugin implements Plugin {
  private unsubscribe?: () => void;

  async onEnable(api: PluginAPI): Promise<void> {
    // Add overlay
    api.ui.addOverlay({
      id: 'relationship-overlay',
      position: 'top-right',
      render: () => {
        const state = api.state.getGameState();
        const relationships = state.relationships;

        // Get top 3 relationships
        const entries = Object.entries(relationships)
          .filter(([key]) => key.startsWith('npc:'))
          .map(([key, value]) => ({
            npcId: key.split(':')[1],
            score: (value as any)?.score ?? 0,
          }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 3);

        if (entries.length === 0) {
          return null;
        }

        return (
          <div className="bg-white/90 dark:bg-neutral-800/90 backdrop-blur rounded-lg shadow-lg p-3 min-w-[200px]">
            <h3 className="text-xs font-semibold mb-2 flex items-center gap-1">
              ❤️ Relationships
            </h3>
            <div className="space-y-1">
              {entries.map(({ npcId, score }) => (
                <div key={npcId} className="flex items-center justify-between text-xs">
                  <span className="text-neutral-700 dark:text-neutral-300">NPC #{npcId}</span>
                  <div className="flex items-center gap-1">
                    <div className="w-16 h-2 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-pink-500"
                        style={{ width: `${Math.min(100, score)}%` }}
                      />
                    </div>
                    <span className="text-neutral-500 text-[10px]">{score}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      },
    });

    // Subscribe to state changes
    this.unsubscribe = api.state.subscribe((state) => {
      // Could update overlay when state changes
      console.debug('Relationship tracker: state updated');
    });

    console.info('Relationship Tracker enabled');
  }

  async onDisable(): Promise<void> {
    // Cleanup subscription
    this.unsubscribe?.();
    console.info('Relationship Tracker disabled');
  }
}

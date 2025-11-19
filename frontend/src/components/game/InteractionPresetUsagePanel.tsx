/**
 * Interaction Preset Usage Panel (Dev-Only)
 *
 * Shows statistics about how often presets are used during gameplay.
 * Helps designers understand which presets are popular and which are unused.
 */

import { useState, useMemo } from 'react';
import { Button, Panel, Badge, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@pixsim7/ui';
import type { GameWorldDetail } from '../../lib/api/game';
import {
  getPresetUsageStatsWithDetails,
  clearPresetUsageStats,
} from '../../lib/game/interactions/presets';

interface InteractionPresetUsagePanelProps {
  world?: GameWorldDetail | null;
}

export function InteractionPresetUsagePanel({ world }: InteractionPresetUsagePanelProps) {
  const [refreshKey, setRefreshKey] = useState(0);

  const usageData = useMemo(
    () => getPresetUsageStatsWithDetails(world || null),
    [world, refreshKey]
  );

  const handleClearStats = () => {
    if (confirm('Are you sure you want to clear all usage statistics?')) {
      clearPresetUsageStats();
      setRefreshKey(prev => prev + 1);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const totalUsages = useMemo(
    () => usageData.reduce((sum, item) => sum + item.count, 0),
    [usageData]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Preset Usage Statistics (Dev)</h2>
          <p className="text-xs text-neutral-500 mt-1">
            Track which presets are being used during gameplay
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setRefreshKey(prev => prev + 1)}
          >
            Refresh
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={handleClearStats}
            className="text-red-600 hover:text-red-700"
          >
            Clear Stats
          </Button>
        </div>
      </div>

      {usageData.length === 0 ? (
        <Panel>
          <div className="text-center py-8">
            <p className="text-sm text-neutral-500">
              No usage data yet. Presets will be tracked when interactions are executed.
            </p>
          </div>
        </Panel>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Panel className="p-3">
              <div className="text-xs text-neutral-500">Total Presets Tracked</div>
              <div className="text-2xl font-bold mt-1">{usageData.length}</div>
            </Panel>
            <Panel className="p-3">
              <div className="text-xs text-neutral-500">Total Usages</div>
              <div className="text-2xl font-bold mt-1">{totalUsages}</div>
            </Panel>
            <Panel className="p-3">
              <div className="text-xs text-neutral-500">Most Used</div>
              <div className="text-sm font-semibold mt-1 truncate">
                {usageData[0]?.presetName || '-'}
              </div>
              <div className="text-xs text-neutral-500">
                {usageData[0]?.count || 0} times
              </div>
            </Panel>
          </div>

          <Panel className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rank</TableHead>
                  <TableHead>Preset Name</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead align="right">Usage Count</TableHead>
                  <TableHead>Last Used</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usageData.map((item, index) => (
                  <TableRow key={item.presetId}>
                    <TableCell>
                      <Badge
                        color={index === 0 ? 'yellow' : index < 3 ? 'blue' : 'gray'}
                        className="text-xs"
                      >
                        #{index + 1}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">
                      {item.presetName}
                      <div className="text-xs text-neutral-500 font-normal">
                        {item.presetId}
                      </div>
                    </TableCell>
                    <TableCell>
                      {item.scope ? (
                        <Badge
                          color={item.scope === 'global' ? 'blue' : 'purple'}
                          className="text-xs"
                        >
                          {item.scope === 'global' ? '🌍 Global' : '🗺️ World'}
                        </Badge>
                      ) : (
                        <span className="text-xs text-neutral-400">Unknown</span>
                      )}
                    </TableCell>
                    <TableCell align="right" className="font-semibold">
                      {item.count}
                    </TableCell>
                    <TableCell className="text-xs text-neutral-500">
                      {formatDate(item.lastUsed)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Panel>

          <Panel className="p-3 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
            <h3 className="text-xs font-semibold mb-2 text-blue-900 dark:text-blue-100">
              How Usage Tracking Works
            </h3>
            <ul className="text-xs text-blue-800 dark:text-blue-200 space-y-1">
              <li>• When you apply a preset to an NPC slot or hotspot, a metadata marker is attached</li>
              <li>• When that interaction is executed during gameplay, the counter increments</li>
              <li>• Statistics are stored in browser localStorage (dev-only feature)</li>
              <li>• This helps you understand which presets are actually being used in practice</li>
            </ul>
          </Panel>
        </>
      )}
    </div>
  );
}

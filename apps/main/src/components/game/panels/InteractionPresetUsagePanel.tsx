/**
 * Interaction Preset Usage Panel (Dev-Only)
 *
 * Shows statistics about how often presets are used during gameplay.
 * Phase 7: Now includes outcome metrics (success/failure rates).
 * Helps designers understand which presets are popular and which are effective.
 */

import { useState, useMemo } from 'react';
import { Button, Panel, Badge, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Select } from '@pixsim7/shared.ui';
import type { GameWorldDetail } from '@/lib/api/game';
import {
  getPresetUsageStatsWithDetails,
  clearPresetUsageStats,
} from '@/lib/game/interactions/presets';

interface InteractionPresetUsagePanelProps {
  world?: GameWorldDetail | null;
}

type SortField = 'usage' | 'successRate' | 'lastUsed';
type FilterMode = 'all' | 'underperforming' | 'overused';

export function InteractionPresetUsagePanel({ world }: InteractionPresetUsagePanelProps) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [sortBy, setSortBy] = useState<SortField>('usage');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');

  const rawUsageData = useMemo(
    () => getPresetUsageStatsWithDetails(world || null),
    [world, refreshKey]
  );

  // Phase 7: Apply filtering
  const filteredData = useMemo(() => {
    if (filterMode === 'all') return rawUsageData;

    return rawUsageData.filter(item => {
      if (filterMode === 'underperforming') {
        // Success rate below 40% and has at least 3 outcomes recorded
        return item.successRate !== null && item.successRate < 40 && item.totalOutcomes >= 3;
      } else if (filterMode === 'overused') {
        // Used more than average
        const avgUsage = rawUsageData.reduce((sum, d) => sum + d.count, 0) / rawUsageData.length;
        return item.count > avgUsage * 1.5;
      }
      return true;
    });
  }, [rawUsageData, filterMode]);

  // Phase 7: Apply sorting
  const usageData = useMemo(() => {
    const sorted = [...filteredData];
    if (sortBy === 'usage') {
      sorted.sort((a, b) => b.count - a.count);
    } else if (sortBy === 'successRate') {
      sorted.sort((a, b) => {
        const rateA = a.successRate ?? -1;
        const rateB = b.successRate ?? -1;
        return rateB - rateA;
      });
    } else if (sortBy === 'lastUsed') {
      sorted.sort((a, b) => b.lastUsed - a.lastUsed);
    }
    return sorted;
  }, [filteredData, sortBy]);

  const handleClearStats = () => {
    if (confirm('Are you sure you want to clear all usage statistics?')) {
      clearPresetUsageStats();
      setRefreshKey(prev => prev + 1);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatSuccessRate = (rate: number | null) => {
    if (rate === null) return 'N/A';
    return `${rate.toFixed(1)}%`;
  };

  const getSuccessRateColor = (rate: number | null): 'green' | 'yellow' | 'red' | 'gray' => {
    if (rate === null) return 'gray';
    if (rate >= 70) return 'green';
    if (rate >= 40) return 'yellow';
    return 'red';
  };

  const totalUsages = useMemo(
    () => rawUsageData.reduce((sum, item) => sum + item.count, 0),
    [rawUsageData]
  );

  const totalOutcomes = useMemo(
    () => rawUsageData.reduce((sum, item) => sum + item.totalOutcomes, 0),
    [rawUsageData]
  );

  const avgSuccessRate = useMemo(() => {
    const presetsWithOutcomes = rawUsageData.filter(d => d.successRate !== null);
    if (presetsWithOutcomes.length === 0) return null;
    return presetsWithOutcomes.reduce((sum, d) => sum + (d.successRate || 0), 0) / presetsWithOutcomes.length;
  }, [rawUsageData]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Preset Usage & Performance Statistics (Dev)</h2>
          <p className="text-xs text-neutral-500 mt-1">
            Track which presets are being used and how they perform (Phase 7)
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

      {/* Phase 7: Filters and Sorting */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
            Filter:
          </label>
          <Select
            size="sm"
            value={filterMode}
            onChange={(e) => setFilterMode(e.target.value as FilterMode)}
            className="w-40"
          >
            <option value="all">All Presets</option>
            <option value="underperforming">Underperforming (&lt;40%)</option>
            <option value="overused">Overused</option>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
            Sort by:
          </label>
          <Select
            size="sm"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortField)}
            className="w-32"
          >
            <option value="usage">Usage Count</option>
            <option value="successRate">Success Rate</option>
            <option value="lastUsed">Last Used</option>
          </Select>
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
          {/* Phase 7: Enhanced Statistics Dashboard */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <Panel className="p-3">
              <div className="text-xs text-neutral-500">Total Presets Tracked</div>
              <div className="text-2xl font-bold mt-1">{rawUsageData.length}</div>
              <div className="text-xs text-neutral-500 mt-1">
                Showing: {usageData.length}
              </div>
            </Panel>
            <Panel className="p-3">
              <div className="text-xs text-neutral-500">Total Usages</div>
              <div className="text-2xl font-bold mt-1">{totalUsages}</div>
              <div className="text-xs text-neutral-500 mt-1">
                Outcomes: {totalOutcomes}
              </div>
            </Panel>
            <Panel className="p-3">
              <div className="text-xs text-neutral-500">Average Success Rate</div>
              <div className="text-2xl font-bold mt-1">
                {avgSuccessRate !== null ? `${avgSuccessRate.toFixed(1)}%` : 'N/A'}
              </div>
              <div className="text-xs text-neutral-500 mt-1">
                Across all presets
              </div>
            </Panel>
            <Panel className="p-3">
              <div className="text-xs text-neutral-500">Most Used</div>
              <div className="text-sm font-semibold mt-1 truncate">
                {rawUsageData[0]?.presetName || '-'}
              </div>
              <div className="text-xs text-neutral-500">
                {rawUsageData[0]?.count || 0} times
              </div>
            </Panel>
          </div>

          {/* Phase 7: Enhanced Table with Outcome Metrics */}
          <Panel className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rank</TableHead>
                  <TableHead>Preset Name</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead align="right">Usage</TableHead>
                  <TableHead>Success Rate</TableHead>
                  <TableHead>Outcomes (S/F/N)</TableHead>
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
                          {item.scope === 'global' ? '🌍' : '🗺️'}
                        </Badge>
                      ) : (
                        <span className="text-xs text-neutral-400">?</span>
                      )}
                    </TableCell>
                    <TableCell align="right" className="font-semibold">
                      {item.count}
                    </TableCell>
                    <TableCell>
                      <Badge
                        color={getSuccessRateColor(item.successRate)}
                        className="text-xs"
                      >
                        {formatSuccessRate(item.successRate)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      <div className="flex items-center gap-1">
                        <span className="text-green-600 dark:text-green-400" title="Success">
                          ✓{item.outcomes.success}
                        </span>
                        <span className="text-neutral-400">/</span>
                        <span className="text-red-600 dark:text-red-400" title="Failure">
                          ✗{item.outcomes.failure}
                        </span>
                        <span className="text-neutral-400">/</span>
                        <span className="text-blue-600 dark:text-blue-400" title="Neutral">
                          ●{item.outcomes.neutral}
                        </span>
                      </div>
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
              How Usage & Outcome Tracking Works (Phase 7)
            </h3>
            <ul className="text-xs text-blue-800 dark:text-blue-200 space-y-1">
              <li>• When you apply a preset to an NPC slot or hotspot, a metadata marker is attached</li>
              <li>• When that interaction is executed during gameplay, both usage count and outcome are tracked</li>
              <li>
                • <strong>Outcomes:</strong> Success (green ✓), Failure (red ✗), Neutral (blue ●)
              </li>
              <li>• Success Rate helps identify underperforming presets that may need adjustment</li>
              <li>• Filters help you focus on problematic or popular presets</li>
              <li>• Statistics are stored in browser localStorage (dev-only feature)</li>
            </ul>
          </Panel>
        </>
      )}
    </div>
  );
}

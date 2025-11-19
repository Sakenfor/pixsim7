import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Template usage record - tracks when a template was inserted
 */
export interface TemplateUsageRecord {
  /** Unique ID for this usage event */
  id: string;

  /** Template ID that was used */
  templateId: string;

  /** Scene ID where template was inserted */
  sceneId: string | null;

  /** World ID context (if any) */
  worldId: number | null;

  /** Timestamp of insertion */
  timestamp: number;

  /** Number of nodes inserted */
  nodeCount: number;

  /** Number of edges inserted */
  edgeCount: number;
}

/**
 * Aggregated usage statistics for a template
 */
export interface TemplateUsageStats {
  /** Template ID */
  templateId: string;

  /** Template name (cached for display) */
  templateName?: string;

  /** Total number of times this template was used */
  usageCount: number;

  /** First time this template was used */
  firstUsed: number;

  /** Last time this template was used */
  lastUsed: number;

  /** Unique scenes where this template was used */
  uniqueScenes: Set<string>;

  /** Unique worlds where this template was used */
  uniqueWorlds: Set<number>;

  /** Average nodes per insertion */
  avgNodesInserted: number;

  /** Total nodes inserted across all uses */
  totalNodesInserted: number;
}

/**
 * Refactoring hint for template usage patterns
 */
export interface RefactoringHint {
  /** Hint ID */
  id: string;

  /** Hint type */
  type: 'high-usage' | 'duplicate-pattern' | 'world-specific' | 'underutilized';

  /** Severity level */
  severity: 'info' | 'suggestion' | 'recommendation';

  /** Template ID this hint relates to */
  templateId: string;

  /** Template name (cached for display) */
  templateName?: string;

  /** Human-readable message */
  message: string;

  /** Detailed explanation */
  details?: string;

  /** Suggested action */
  suggestion?: string;

  /** Related metrics */
  metrics?: {
    usageCount?: number;
    sceneCount?: number;
    worldCount?: number;
  };
}

/**
 * Template Analytics Store State
 */
interface TemplateAnalyticsStoreState {
  /** All usage records */
  usageRecords: TemplateUsageRecord[];

  /** Record a template insertion */
  recordUsage: (record: Omit<TemplateUsageRecord, 'id' | 'timestamp'>) => void;

  /** Get all usage records for a template */
  getTemplateUsage: (templateId: string) => TemplateUsageRecord[];

  /** Get usage statistics for a template */
  getTemplateStats: (templateId: string) => TemplateUsageStats | null;

  /** Get all template statistics */
  getAllTemplateStats: () => TemplateUsageStats[];

  /** Get usage records for a scene */
  getSceneUsage: (sceneId: string) => TemplateUsageRecord[];

  /** Get usage records for a world */
  getWorldUsage: (worldId: number) => TemplateUsageRecord[];

  /** Get refactoring hints based on usage patterns */
  getRefactoringHints: () => RefactoringHint[];

  /** Clear all analytics data */
  clearAnalytics: () => void;

  /** Clear analytics for a specific template */
  clearTemplateAnalytics: (templateId: string) => void;

  /** Get top N most used templates */
  getTopTemplates: (limit: number) => TemplateUsageStats[];
}

/**
 * Helper to calculate stats for a template
 */
function calculateTemplateStats(
  templateId: string,
  records: TemplateUsageRecord[]
): TemplateUsageStats | null {
  const templateRecords = records.filter((r) => r.templateId === templateId);

  if (templateRecords.length === 0) {
    return null;
  }

  const uniqueScenes = new Set<string>();
  const uniqueWorlds = new Set<number>();
  let totalNodes = 0;

  templateRecords.forEach((record) => {
    if (record.sceneId) uniqueScenes.add(record.sceneId);
    if (record.worldId !== null) uniqueWorlds.add(record.worldId);
    totalNodes += record.nodeCount;
  });

  const timestamps = templateRecords.map((r) => r.timestamp);
  const firstUsed = Math.min(...timestamps);
  const lastUsed = Math.max(...timestamps);

  return {
    templateId,
    templateName: templateRecords[0]?.templateId, // Will be enriched by UI
    usageCount: templateRecords.length,
    firstUsed,
    lastUsed,
    uniqueScenes,
    uniqueWorlds,
    avgNodesInserted: totalNodes / templateRecords.length,
    totalNodesInserted: totalNodes,
  };
}

/**
 * Generate refactoring hints based on usage patterns
 */
function generateRefactoringHints(
  allStats: TemplateUsageStats[]
): RefactoringHint[] {
  const hints: RefactoringHint[] = [];

  // Thresholds for hints
  const HIGH_USAGE_THRESHOLD = 10; // Used more than 10 times
  const UNDERUTILIZED_THRESHOLD = 1; // Used only once in the last 30 days
  const WORLD_SPECIFIC_THRESHOLD = 5; // Used 5+ times in a single world
  const DUPLICATE_THRESHOLD = 15; // If a template is used 15+ times, might indicate need for abstraction

  allStats.forEach((stats) => {
    // High usage - consider creating a more specialized template pack
    if (stats.usageCount >= DUPLICATE_THRESHOLD) {
      hints.push({
        id: `high-usage-${stats.templateId}`,
        type: 'high-usage',
        severity: 'recommendation',
        templateId: stats.templateId,
        templateName: stats.templateName,
        message: `Template used ${stats.usageCount} times across ${stats.uniqueScenes.size} scenes`,
        details: `This template is heavily used. Consider creating specialized variations or a template pack for related patterns.`,
        suggestion: `Create a template pack with variations of this pattern, or extract common sub-patterns into smaller reusable templates.`,
        metrics: {
          usageCount: stats.usageCount,
          sceneCount: stats.uniqueScenes.size,
          worldCount: stats.uniqueWorlds.size,
        },
      });
    } else if (stats.usageCount >= HIGH_USAGE_THRESHOLD) {
      hints.push({
        id: `popular-${stats.templateId}`,
        type: 'high-usage',
        severity: 'info',
        templateId: stats.templateId,
        templateName: stats.templateName,
        message: `Template used ${stats.usageCount} times - popular pattern`,
        details: `This template is frequently used. Consider adding it to favorites if not already there.`,
        metrics: {
          usageCount: stats.usageCount,
          sceneCount: stats.uniqueScenes.size,
        },
      });
    }

    // World-specific usage pattern
    if (stats.uniqueWorlds.size === 1 && stats.usageCount >= WORLD_SPECIFIC_THRESHOLD) {
      const worldId = Array.from(stats.uniqueWorlds)[0];
      hints.push({
        id: `world-specific-${stats.templateId}`,
        type: 'world-specific',
        severity: 'suggestion',
        templateId: stats.templateId,
        templateName: stats.templateName,
        message: `Template used exclusively in world #${worldId}`,
        details: `This template is only used in one world. Consider converting it to a world-scoped template for better organization.`,
        suggestion: `Save this template as a world-scoped template if it's specific to this world's mechanics or theme.`,
        metrics: {
          usageCount: stats.usageCount,
          worldCount: 1,
        },
      });
    }

    // Underutilized - created but rarely used
    const daysSinceCreation = (Date.now() - stats.firstUsed) / (1000 * 60 * 60 * 24);
    if (stats.usageCount <= UNDERUTILIZED_THRESHOLD && daysSinceCreation > 30) {
      hints.push({
        id: `underutilized-${stats.templateId}`,
        type: 'underutilized',
        severity: 'info',
        templateId: stats.templateId,
        templateName: stats.templateName,
        message: `Template created ${Math.floor(daysSinceCreation)} days ago but rarely used`,
        details: `This template has low usage. Consider reviewing if it's still needed or if it can be merged with similar templates.`,
        suggestion: `Review this template and consider removing it if it's no longer useful, or update its description to make it more discoverable.`,
        metrics: {
          usageCount: stats.usageCount,
        },
      });
    }
  });

  // Sort hints by severity (recommendation > suggestion > info)
  const severityOrder = { recommendation: 0, suggestion: 1, info: 2 };
  hints.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return hints;
}

/**
 * Template Analytics Store
 *
 * Tracks template usage across scenes and worlds for:
 * - Usage metrics and statistics
 * - Refactoring recommendations
 * - Pattern analysis
 */
export const useTemplateAnalyticsStore = create<TemplateAnalyticsStoreState>()(
  persist(
    (set, get) => ({
      usageRecords: [],

      recordUsage: (record) => {
        const newRecord: TemplateUsageRecord = {
          ...record,
          id: `usage_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          timestamp: Date.now(),
        };

        set((state) => ({
          usageRecords: [...state.usageRecords, newRecord],
        }));
      },

      getTemplateUsage: (templateId) => {
        return get().usageRecords.filter((r) => r.templateId === templateId);
      },

      getTemplateStats: (templateId) => {
        return calculateTemplateStats(templateId, get().usageRecords);
      },

      getAllTemplateStats: () => {
        const records = get().usageRecords;
        const templateIds = Array.from(new Set(records.map((r) => r.templateId)));

        return templateIds
          .map((id) => calculateTemplateStats(id, records))
          .filter((stats): stats is TemplateUsageStats => stats !== null);
      },

      getSceneUsage: (sceneId) => {
        return get().usageRecords.filter((r) => r.sceneId === sceneId);
      },

      getWorldUsage: (worldId) => {
        return get().usageRecords.filter((r) => r.worldId === worldId);
      },

      getRefactoringHints: () => {
        const allStats = get().getAllTemplateStats();
        return generateRefactoringHints(allStats);
      },

      clearAnalytics: () => {
        set({ usageRecords: [] });
      },

      clearTemplateAnalytics: (templateId) => {
        set((state) => ({
          usageRecords: state.usageRecords.filter((r) => r.templateId !== templateId),
        }));
      },

      getTopTemplates: (limit) => {
        const allStats = get().getAllTemplateStats();
        return allStats
          .sort((a, b) => b.usageCount - a.usageCount)
          .slice(0, limit);
      },
    }),
    {
      name: 'pixsim7-template-analytics', // localStorage key
      version: 1,
    }
  )
);

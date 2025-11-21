import React from 'react';
import { TemplateAnalyticsPanel } from '../components/dev/TemplateAnalyticsPanel';

/**
 * TemplateAnalyticsDev Route
 *
 * Dev panel route for visualizing template usage analytics and refactoring hints.
 * Provides insights into:
 * - Template usage patterns across scenes and worlds
 * - Most/least used templates
 * - Refactoring recommendations based on usage patterns
 * - Usage history and metrics
 *
 * Route: /template-analytics
 *
 * Phase 10 of Task 03: Scene / Quest Graph Templates
 */
export function TemplateAnalyticsDev() {
  return (
    <div className="flex flex-col h-screen bg-white dark:bg-neutral-900">
      {/* Page Header */}
      <div className="border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-6 py-4">
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
          Template Usage Analytics
        </h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
          Track template usage patterns, identify optimization opportunities, and get refactoring
          recommendations. Part of{' '}
          <a
            href="https://github.com/Sakenfor/pixsim7/blob/main/claude-tasks/03-scene-and-quest-graph-templates.md"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            Task 03: Scene / Quest Graph Templates
          </a>
          .
        </p>
      </div>

      {/* Analytics Panel */}
      <div className="flex-1 overflow-hidden">
        <TemplateAnalyticsPanel />
      </div>
    </div>
  );
}

export default TemplateAnalyticsDev;

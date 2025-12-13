/**
 * ValidationPanel Component
 *
 * Displays validation errors, warnings, and info messages for overlay configurations
 */

import React, { useMemo } from 'react';
import type { OverlayConfiguration, ValidationError } from '@lib/ui/overlay';
import { validateConfiguration, lintConfiguration } from '@lib/ui/overlay';
import { Panel } from '@pixsim7/shared.ui';
import { Icon } from '@lib/icons';

export interface ValidationPanelProps {
  /** Current overlay configuration to validate */
  configuration: OverlayConfiguration;

  /** Callback when a validation issue for a specific widget is clicked */
  onSelectWidget?: (widgetId: string) => void;
}

/**
 * Groups validation issues by severity
 */
interface GroupedIssues {
  errors: ValidationError[];
  warnings: ValidationError[];
  info: ValidationError[];
}

export function ValidationPanel({ configuration, onSelectWidget }: ValidationPanelProps) {
  // Run validation and linting
  const issues = useMemo(() => {
    const validationResult = validateConfiguration(configuration);
    const lintIssues = lintConfiguration(configuration);

    const allIssues = [...validationResult.errors, ...lintIssues];

    const grouped: GroupedIssues = {
      errors: allIssues.filter((e) => e.severity === 'error'),
      warnings: allIssues.filter((e) => e.severity === 'warning'),
      info: allIssues.filter((e) => e.severity === 'info'),
    };

    return grouped;
  }, [configuration]);

  const totalIssues = issues.errors.length + issues.warnings.length + issues.info.length;

  // Handle clicking on a widget-specific issue
  const handleIssueClick = (issue: ValidationError) => {
    if (issue.widgetId && onSelectWidget) {
      onSelectWidget(issue.widgetId);
    }
  };

  // Render a single issue
  const renderIssue = (issue: ValidationError, index: number) => {
    const severityConfig = {
      error: {
        icon: 'alertCircle' as const,
        color: 'text-red-600 dark:text-red-400',
        bgColor: 'bg-red-50 dark:bg-red-900/20',
        borderColor: 'border-red-200 dark:border-red-800',
      },
      warning: {
        icon: 'alertTriangle' as const,
        color: 'text-orange-600 dark:text-orange-400',
        bgColor: 'bg-orange-50 dark:bg-orange-900/20',
        borderColor: 'border-orange-200 dark:border-orange-800',
      },
      info: {
        icon: 'info' as const,
        color: 'text-blue-600 dark:text-blue-400',
        bgColor: 'bg-blue-50 dark:bg-blue-900/20',
        borderColor: 'border-blue-200 dark:border-blue-800',
      },
    };

    const config = severityConfig[issue.severity];
    const isClickable = !!issue.widgetId && !!onSelectWidget;

    return (
      <div
        key={`${issue.code}-${index}`}
        className={`
          flex gap-2 p-2 rounded border ${config.bgColor} ${config.borderColor}
          ${isClickable ? 'cursor-pointer hover:opacity-80' : ''}
        `}
        onClick={() => handleIssueClick(issue)}
      >
        <Icon name={config.icon} className={`w-4 h-4 mt-0.5 flex-shrink-0 ${config.color}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm break-words">{issue.message}</p>
          {issue.widgetId && (
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
              Widget: {issue.widgetId}
            </p>
          )}
          <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-0.5">
            {issue.code}
          </p>
        </div>
      </div>
    );
  };

  return (
    <Panel className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-700 pb-2">
        <h3 className="text-sm font-semibold">Validation</h3>
        {totalIssues === 0 ? (
          <span className="text-xs px-2 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
            <Icon name="check" className="inline w-3 h-3 mr-1" />
            All good
          </span>
        ) : (
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            {totalIssues} {totalIssues === 1 ? 'issue' : 'issues'}
          </span>
        )}
      </div>

      {/* Issues */}
      {totalIssues > 0 ? (
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {/* Errors */}
          {issues.errors.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase tracking-wide">
                Errors ({issues.errors.length})
              </h4>
              {issues.errors.map((issue, index) => renderIssue(issue, index))}
            </div>
          )}

          {/* Warnings */}
          {issues.warnings.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-orange-600 dark:text-orange-400 uppercase tracking-wide">
                Warnings ({issues.warnings.length})
              </h4>
              {issues.warnings.map((issue, index) => renderIssue(issue, index))}
            </div>
          )}

          {/* Info */}
          {issues.info.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide">
                Info ({issues.info.length})
              </h4>
              {issues.info.map((issue, index) => renderIssue(issue, index))}
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-8 text-sm text-neutral-500 dark:text-neutral-400">
          <Icon name="check" className="w-12 h-12 mx-auto mb-2 text-green-500" />
          <p>No validation issues found</p>
        </div>
      )}
    </Panel>
  );
}

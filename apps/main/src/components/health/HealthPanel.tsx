import { useState, useEffect, useRef } from 'react';
import { useGraphStore, type GraphState } from '@features/graph';
import { validateScene, type ValidationIssue, type ValidationResult } from '@domain/sceneBuilder/validation';
import { useSelectionStore } from '@features/graph';
import { Button } from '@pixsim7/shared.ui';

interface HealthPanelProps {
  /**
   * Compact mode shows a badge/dropdown instead of full panel
   * Useful for toolbar integration
   */
  compact?: boolean;
}

export function HealthPanel({ compact = false }: HealthPanelProps) {
  const { setSelectedNodeId } = useSelectionStore();
  const draft = useGraphStore((s: GraphState) => s.draft);
  const [validation, setValidation] = useState<ValidationResult>({
    valid: true,
    issues: [],
    errors: [],
    warnings: [],
  });
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Run validation when draft changes
  useEffect(() => {
    const result = validateScene(draft);
    setValidation(result);
  }, [draft]);

  // Close compact panel when clicking outside
  useEffect(() => {
    if (!compact || !isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [compact, isOpen]);

  const handleFocusNode = (nodeId: string) => {
    setSelectedNodeId(nodeId);
    if (compact) {
      setIsOpen(false); // Auto-close dropdown in compact mode
    }
  };

  const getIssueIcon = (severity: 'error' | 'warning' | 'info') => {
    switch (severity) {
      case 'error':
        return '🔴';
      case 'warning':
        return '⚠️';
      case 'info':
        return 'ℹ️';
    }
  };

  const getIssueColor = (severity: 'error' | 'warning' | 'info') => {
    switch (severity) {
      case 'error':
        return 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
      case 'warning':
        return 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800';
      case 'info':
        return 'text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800';
    }
  };

  // Compact mode: Status badge with dropdown
  if (compact) {
    const statusBadge = (() => {
      if (validation.valid && validation.issues.length === 0) {
        return (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded text-xs font-medium text-green-700 dark:text-green-300 cursor-pointer hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors">
            <span>✅</span>
            <span>Valid</span>
          </div>
        );
      }

      const errorCount = validation.errors.length;
      const warningCount = validation.warnings.length;

      return (
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-xs font-medium text-red-700 dark:text-red-300 cursor-pointer hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors">
          <span>⚠️</span>
          <span>
            {errorCount > 0 && `${errorCount} error${errorCount !== 1 ? 's' : ''}`}
            {errorCount > 0 && warningCount > 0 && ', '}
            {warningCount > 0 && `${warningCount} warning${warningCount !== 1 ? 's' : ''}`}
          </span>
        </div>
      );
    })();

    return (
      <div className="relative" ref={panelRef}>
        {/* Status Badge - Toggle Button */}
        <div onClick={() => setIsOpen(!isOpen)}>
          {statusBadge}
        </div>

        {/* Dropdown Panel */}
        {isOpen && (
          <div className="absolute top-full right-0 mt-2 w-96 max-h-96 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 rounded-lg shadow-2xl overflow-hidden z-50">
            {/* Header */}
            <div className="p-3 bg-neutral-100 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-700">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                  Scene Health
                </h3>
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-neutral-600 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors"
                  title="Close"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Issues List */}
            <div className="max-h-80 overflow-y-auto p-3 space-y-2">
              {validation.issues.length === 0 ? (
                <div className="text-center py-8 space-y-2">
                  <div className="text-4xl">🎉</div>
                  <div className="text-sm text-neutral-600 dark:text-neutral-400">
                    No issues found!
                  </div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-500">
                    Your scene graph looks healthy
                  </div>
                </div>
              ) : (
                validation.issues.map((issue, index) => (
                  <IssueCard
                    key={index}
                    issue={issue}
                    onFocusNode={handleFocusNode}
                    getIssueIcon={getIssueIcon}
                    getIssueColor={getIssueColor}
                    compact={true}
                  />
                ))
              )}
            </div>

            {/* Footer */}
            {validation.issues.length > 0 && (
              <div className="p-2 bg-neutral-50 dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-700 text-xs text-neutral-500 dark:text-neutral-400">
                💡 Click "Focus" to jump to problem nodes
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Full panel mode
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b p-4 bg-neutral-50 dark:bg-neutral-900">
        <div className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 mb-2">
          SCENE HEALTH
        </div>

        {/* Summary */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            {validation.valid ? (
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                <span className="text-lg">✅</span>
                <span className="text-sm font-medium">Valid</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                <span className="text-lg">❌</span>
                <span className="text-sm font-medium">Issues Found</span>
              </div>
            )}
          </div>

          {validation.errors.length > 0 && (
            <div className="px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded text-xs font-medium">
              {validation.errors.length} error{validation.errors.length !== 1 ? 's' : ''}
            </div>
          )}

          {validation.warnings.length > 0 && (
            <div className="px-2 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded text-xs font-medium">
              {validation.warnings.length} warning{validation.warnings.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      </div>

      {/* Issues List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {validation.issues.length === 0 ? (
          <div className="text-center py-8 space-y-2">
            <div className="text-4xl">🎉</div>
            <div className="text-sm text-neutral-600 dark:text-neutral-400">
              No issues found!
            </div>
            <div className="text-xs text-neutral-500 dark:text-neutral-500">
              Your scene graph looks healthy
            </div>
          </div>
        ) : (
          validation.issues.map((issue, index) => (
            <IssueCard
              key={index}
              issue={issue}
              onFocusNode={handleFocusNode}
              getIssueIcon={getIssueIcon}
              getIssueColor={getIssueColor}
              compact={false}
            />
          ))
        )}
      </div>

      {/* Footer Help */}
      {validation.issues.length > 0 && (
        <div className="border-t p-3 bg-neutral-50 dark:bg-neutral-900 text-xs text-neutral-500 dark:text-neutral-400">
          💡 Click "Focus" to jump to problem nodes
        </div>
      )}
    </div>
  );
}

interface IssueCardProps {
  issue: ValidationIssue;
  onFocusNode: (nodeId: string) => void;
  getIssueIcon: (severity: 'error' | 'warning' | 'info') => string;
  getIssueColor: (severity: 'error' | 'warning' | 'info') => string;
  compact: boolean;
}

function IssueCard({ issue, onFocusNode, getIssueIcon, getIssueColor, compact }: IssueCardProps) {
  const padding = compact ? 'p-2' : 'p-3';
  const iconSize = compact ? 'text-base' : 'text-lg';
  const titleSize = compact ? 'text-xs' : 'text-sm';
  const detailsSize = compact ? 'text-[10px]' : 'text-xs';

  return (
    <div className={`${padding} rounded border ${getIssueColor(issue.severity)}`}>
      <div className="flex items-start gap-2">
        <div className={`${iconSize} flex-shrink-0`}>{getIssueIcon(issue.severity)}</div>
        <div className="flex-1 min-w-0">
          <div className={`${titleSize} font-medium mb-1`}>{issue.message}</div>
          {issue.details && (
            <div className={`${detailsSize} opacity-80 mb-2`}>{issue.details}</div>
          )}
          {issue.nodeId && (
            <div className="flex items-center gap-2">
              <code className={`${detailsSize} px-2 py-0.5 bg-black/10 dark:bg-white/10 rounded`}>
                {issue.nodeId}
              </code>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onFocusNode(issue.nodeId!)}
                className={compact ? 'text-xs px-2 py-1' : 'text-xs'}
              >
                Focus
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

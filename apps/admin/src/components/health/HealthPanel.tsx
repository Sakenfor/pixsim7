import { useState, useEffect } from 'react';
import { useGraphStore, type GraphState } from '../../stores/graphStore';
import { validateScene, type ValidationIssue, type ValidationResult } from '../../modules/scene-builder/validation';
import { useSelectionStore } from '../../stores/selectionStore';
import { Button } from '@pixsim7/shared.ui';

export function HealthPanel() {
  const { setSelectedNodeId } = useSelectionStore();
  const draft = useGraphStore((s: GraphState) => s.draft);
  const [validation, setValidation] = useState<ValidationResult>({
    valid: true,
    issues: [],
    errors: [],
    warnings: [],
  });

  // Run validation when draft changes
  useEffect(() => {
    const result = validateScene(draft);
    setValidation(result);
  }, [draft]);

  const handleFocusNode = (nodeId: string) => {
    setSelectedNodeId(nodeId);
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
}

function IssueCard({ issue, onFocusNode, getIssueIcon, getIssueColor }: IssueCardProps) {
  return (
    <div className={`p-3 rounded border ${getIssueColor(issue.severity)}`}>
      <div className="flex items-start gap-2">
        <div className="text-lg flex-shrink-0">{getIssueIcon(issue.severity)}</div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium mb-1">{issue.message}</div>
          {issue.details && (
            <div className="text-xs opacity-80 mb-2">{issue.details}</div>
          )}
          {issue.nodeId && (
            <div className="flex items-center gap-2">
              <code className="text-xs px-2 py-0.5 bg-black/10 dark:bg-white/10 rounded">
                {issue.nodeId}
              </code>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onFocusNode(issue.nodeId!)}
                className="text-xs"
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

import { useState, useEffect, useRef } from 'react';
import { useGraphStore, type GraphState } from '../../stores/graphStore';
import { validateScene, type ValidationIssue, type ValidationResult } from '../../modules/scene-builder/validation';
import { useSelectionStore } from '../../stores/selectionStore';
import { Button } from '@pixsim7/ui';

/**
 * Compact validation panel that can be toggled from toolbar
 * Shows validation status badge and expandable issues list
 */
export function ValidationPanel() {
  const { setSelectedNodeId } = useSelectionStore();
  const getCurrentScene = useGraphStore((s: GraphState) => s.getCurrentScene);
  const [isOpen, setIsOpen] = useState(false);
  const [validation, setValidation] = useState<ValidationResult>({
    valid: true,
    issues: [],
    errors: [],
    warnings: [],
  });
  const panelRef = useRef<HTMLDivElement>(null);

  // Get current scene
  const currentScene = getCurrentScene();

  // Run validation when scene changes
  useEffect(() => {
    const result = validateScene(currentScene);
    setValidation(result);
  }, [currentScene]);

  // Close panel when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const handleFocusNode = (nodeId: string) => {
    setSelectedNodeId(nodeId);
    setIsOpen(false); // Close panel after focusing
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

  // Status badge content
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
                Validation Results
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

interface IssueCardProps {
  issue: ValidationIssue;
  onFocusNode: (nodeId: string) => void;
  getIssueIcon: (severity: 'error' | 'warning' | 'info') => string;
  getIssueColor: (severity: 'error' | 'warning' | 'info') => string;
}

function IssueCard({ issue, onFocusNode, getIssueIcon, getIssueColor }: IssueCardProps) {
  return (
    <div className={`p-2 rounded border text-xs ${getIssueColor(issue.severity)}`}>
      <div className="flex items-start gap-2">
        <div className="text-base flex-shrink-0">{getIssueIcon(issue.severity)}</div>
        <div className="flex-1 min-w-0">
          <div className="font-medium mb-1">{issue.message}</div>
          {issue.details && (
            <div className="opacity-80 mb-2">{issue.details}</div>
          )}
          {issue.nodeId && (
            <div className="flex items-center gap-2">
              <code className="px-2 py-0.5 bg-black/10 dark:bg-white/10 rounded">
                {issue.nodeId}
              </code>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onFocusNode(issue.nodeId!)}
                className="text-xs px-2 py-1"
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

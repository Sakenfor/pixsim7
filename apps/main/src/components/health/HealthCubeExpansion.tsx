import { useEffect, useState } from 'react';

import type { ExpansionComponentProps } from '@features/cubes';
import { useGraphStore, type GraphState } from '@features/graph';

import { validateScene, type ValidationResult } from '@domain/sceneBuilder/validation';

/**
 * Health status expansion for cube
 * Shows compact summary of scene validation issues
 */
export function HealthCubeExpansion(props: ExpansionComponentProps) {
  void props;
  const currentScene = useGraphStore((s: GraphState) => s.getCurrentScene());
  const [validation, setValidation] = useState<ValidationResult>({
    valid: true,
    issues: [],
    errors: [],
    warnings: [],
  });

  useEffect(() => {
    const result = validateScene(currentScene);
    setValidation(result);
  }, [currentScene]);

  const errorCount = validation.errors.length;
  const warningCount = validation.warnings.length;
  const infoCount = validation.issues.filter(i => i.severity === 'info').length;

  return (
    <div className="p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="text-lg">❤️</span>
        <span className="text-sm font-semibold text-white">Scene Health</span>
      </div>

      {/* Status summary */}
      <div className="space-y-2">
        {validation.valid ? (
          <div className="flex items-center gap-2 text-green-400">
            <span className="text-2xl">✓</span>
            <span className="text-sm font-medium">All Good!</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-red-400">
            <span className="text-2xl">✗</span>
            <span className="text-sm font-medium">Issues Found</span>
          </div>
        )}

        {/* Metrics */}
        <div className="grid grid-cols-3 gap-2">
          {/* Errors */}
          <div className="bg-red-500/20 border border-red-500/30 rounded p-2 text-center">
            <div className="text-xs text-red-300 mb-1">Errors</div>
            <div className="text-xl font-bold text-red-400">{errorCount}</div>
          </div>

          {/* Warnings */}
          <div className="bg-amber-500/20 border border-amber-500/30 rounded p-2 text-center">
            <div className="text-xs text-amber-300 mb-1">Warnings</div>
            <div className="text-xl font-bold text-amber-400">{warningCount}</div>
          </div>

          {/* Info */}
          <div className="bg-blue-500/20 border border-blue-500/30 rounded p-2 text-center">
            <div className="text-xs text-blue-300 mb-1">Info</div>
            <div className="text-xl font-bold text-blue-400">{infoCount}</div>
          </div>
        </div>

        {/* Recent issues preview */}
        {validation.issues.length > 0 && (
          <div className="mt-2 space-y-1">
            <div className="text-[10px] text-white/40 uppercase tracking-wide">Recent</div>
            {validation.issues.slice(0, 3).map((issue, i) => (
              <div
                key={i}
                className="text-xs text-white/70 truncate flex items-start gap-1"
              >
                <span className="flex-shrink-0">
                  {issue.severity === 'error' && '🔴'}
                  {issue.severity === 'warning' && '⚠️'}
                  {issue.severity === 'info' && 'ℹ️'}
                </span>
                <span className="truncate">{issue.message}</span>
              </div>
            ))}
            {validation.issues.length > 3 && (
              <div className="text-[10px] text-white/40">
                +{validation.issues.length - 3} more...
              </div>
            )}
          </div>
        )}

        {/* Click hint */}
        <div className="pt-2 border-t border-white/10 text-[10px] text-white/30 text-center">
          Click cube to restore panel
        </div>
      </div>
    </div>
  );
}

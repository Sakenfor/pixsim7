/**
 * World Validation Panel
 *
 * Surfaces backend validation capability that previously had no UI:
 * - Behavior config validation (POST /game/worlds/{id}/behavior/validate)
 * - Link integrity report (GET /game/links/integrity/report)
 *
 * Both are read-only / dry-run checks; nothing here mutates world state.
 */
import { Badge, Button, Panel } from '@pixsim7/shared.ui';
import { useCallback, useEffect, useState } from 'react';

import type { BehaviorValidationResult, LinkIntegrityReport } from '@lib/api/game';
import {
  getLinkIntegrityReport,
  getWorldBehaviorConfig,
  validateWorldBehaviorConfig,
} from '@lib/api/game';

interface WorldValidationPanelProps {
  worldId: number;
}

interface BehaviorCheckState {
  result: BehaviorValidationResult;
  /** True when the stored config has nothing beyond the version marker. */
  isEmptyConfig: boolean;
}

function countConfigEntries(config: Record<string, unknown>): number {
  return Object.entries(config).filter(
    ([key, value]) => key !== 'version' && value != null,
  ).length;
}

export function WorldValidationPanel({ worldId }: WorldValidationPanelProps) {
  const [behaviorCheck, setBehaviorCheck] = useState<BehaviorCheckState | null>(null);
  const [isValidatingBehavior, setIsValidatingBehavior] = useState(false);
  const [behaviorError, setBehaviorError] = useState<string | null>(null);

  const [report, setReport] = useState<LinkIntegrityReport | null>(null);
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const runBehaviorValidation = useCallback(async () => {
    setIsValidatingBehavior(true);
    setBehaviorError(null);
    try {
      const config = await getWorldBehaviorConfig(worldId);
      const result = await validateWorldBehaviorConfig(worldId, config);
      setBehaviorCheck({ result, isEmptyConfig: countConfigEntries(config) === 0 });
    } catch (e: unknown) {
      setBehaviorCheck(null);
      setBehaviorError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsValidatingBehavior(false);
    }
  }, [worldId]);

  const loadIntegrityReport = useCallback(async () => {
    setIsLoadingReport(true);
    setReportError(null);
    try {
      const loaded = await getLinkIntegrityReport();
      setReport(loaded);
    } catch (e: unknown) {
      setReport(null);
      setReportError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoadingReport(false);
    }
  }, []);

  useEffect(() => {
    setBehaviorCheck(null);
    setBehaviorError(null);
    void runBehaviorValidation();
    void loadIntegrityReport();
  }, [runBehaviorValidation, loadIntegrityReport]);

  return (
    <div className="space-y-4">
      <Panel className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Behavior Config</h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Dry-run validation of this world's stored behavior configuration.
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={runBehaviorValidation}
            disabled={isValidatingBehavior}
          >
            {isValidatingBehavior ? 'Validating...' : 'Re-validate'}
          </Button>
        </div>

        {isValidatingBehavior && !behaviorCheck && (
          <p className="text-xs text-neutral-500">Validating behavior config...</p>
        )}
        {behaviorError && (
          <p className="text-sm text-red-500">Error: {behaviorError}</p>
        )}
        {behaviorCheck && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge color={behaviorCheck.result.is_valid ? 'green' : 'red'}>
                {behaviorCheck.result.is_valid ? 'Valid' : 'Invalid'}
              </Badge>
              {behaviorCheck.isEmptyConfig && (
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  No behavior config authored for this world yet.
                </span>
              )}
            </div>
            {behaviorCheck.result.errors.length > 0 && (
              <ul className="space-y-1 text-xs text-red-600 dark:text-red-400">
                {behaviorCheck.result.errors.map((message, index) => (
                  <li key={`error-${index}`}>{message}</li>
                ))}
              </ul>
            )}
            {behaviorCheck.result.warnings.length > 0 && (
              <ul className="space-y-1 text-xs text-amber-600 dark:text-amber-400">
                {behaviorCheck.result.warnings.map((message, index) => (
                  <li key={`warning-${index}`}>{message}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Panel>

      <Panel className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Link Integrity</h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Template-to-runtime link health across the object link system.
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={loadIntegrityReport}
            disabled={isLoadingReport}
          >
            {isLoadingReport ? 'Loading...' : 'Refresh'}
          </Button>
        </div>

        {isLoadingReport && !report && (
          <p className="text-xs text-neutral-500">Loading link integrity report...</p>
        )}
        {reportError && <p className="text-sm text-red-500">Error: {reportError}</p>}
        {report && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge color={report.has_integrity_issues ? 'red' : 'green'}>
                {report.has_integrity_issues ? 'Issues found' : 'Healthy'}
              </Badge>
              <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                Generated {report.generated_at}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
              <div className="rounded border border-neutral-300 p-2 dark:border-neutral-700">
                <div className="text-neutral-500 dark:text-neutral-400">Total links</div>
                <div className="mt-1 font-mono">{report.total_links}</div>
              </div>
              <div className="rounded border border-neutral-300 p-2 dark:border-neutral-700">
                <div className="text-neutral-500 dark:text-neutral-400">Enabled</div>
                <div className="mt-1 font-mono">{report.enabled_links}</div>
              </div>
              <div className="rounded border border-neutral-300 p-2 dark:border-neutral-700">
                <div className="text-neutral-500 dark:text-neutral-400">Disabled</div>
                <div className="mt-1 font-mono">{report.disabled_links}</div>
              </div>
              <div className="rounded border border-neutral-300 p-2 dark:border-neutral-700">
                <div className="text-neutral-500 dark:text-neutral-400">Orphaned (sample)</div>
                <div className="mt-1 font-mono">{report.orphaned_links_sample}</div>
              </div>
            </div>

            {Object.keys(report.orphans_by_type).length > 0 && (
              <div className="space-y-1">
                <h4 className="text-xs font-semibold">Orphans by link type</h4>
                <ul className="space-y-0.5 text-xs text-neutral-600 dark:text-neutral-300">
                  {Object.entries(report.orphans_by_type).map(([linkType, count]) => (
                    <li key={linkType} className="font-mono">
                      {linkType}: {count}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {report.sample_orphans.length > 0 && (
              <div className="space-y-1">
                <h4 className="text-xs font-semibold">
                  Sample orphaned links ({report.sample_orphans.length})
                </h4>
                <div className="max-h-48 overflow-y-auto rounded border border-neutral-300 p-2 dark:border-neutral-700">
                  <pre className="whitespace-pre-wrap break-all font-mono text-[11px] text-neutral-600 dark:text-neutral-300">
                    {JSON.stringify(report.sample_orphans, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}
      </Panel>
    </div>
  );
}

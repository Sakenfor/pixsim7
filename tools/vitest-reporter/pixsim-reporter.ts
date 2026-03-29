/**
 * Vitest custom reporter — auto-submits test run results to the pixsim backend.
 *
 * Each test file that exports a `TEST_SUITE` object gets its own run record
 * with per-suite pass/fail counts.
 *
 * Configuration (environment variables):
 *   PIXSIM_TEST_SUBMIT=1        Enable auto-submission (off by default)
 *   PIXSIM_API_URL              Backend base URL (default: http://localhost:8000)
 *   PIXSIM_API_TOKEN            Bearer token for auth (optional in debug mode)
 *
 * Usage in vitest config:
 *   test: {
 *     reporters: process.env.PIXSIM_TEST_SUBMIT
 *       ? ['default', ['../../tools/vitest-reporter/pixsim-reporter.ts', {}]]
 *       : ['default'],
 *   }
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Vitest v4 Reporter hooks
interface Reporter {
  onInit?: (ctx: unknown) => void;
  onTestModuleCollected?: (testModule: any) => void;
  onTestRunEnd?: (testModules: ReadonlyArray<any>, unhandledErrors: ReadonlyArray<any>, reason: string) => void | Promise<void>;
}

interface SuiteResult {
  suiteId: string;
  label: string;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  failures: { test: string; error: string; message: string }[];
}

function isEnabled(): boolean {
  return ['1', 'true', 'yes'].includes((process.env.PIXSIM_TEST_SUBMIT ?? '').trim());
}

function apiBase(): string {
  return (process.env.PIXSIM_API_URL ?? 'http://localhost:8000').replace(/\/$/, '');
}

function apiToken(): string {
  return process.env.PIXSIM_API_TOKEN ?? '';
}

function detectEnvironment(): Record<string, string> {
  const env: Record<string, string> = {
    node_version: process.version,
    platform: process.platform,
  };
  try {
    const sha = execSync('git rev-parse --short HEAD', { timeout: 5000 }).toString().trim();
    if (sha) env.git_sha = sha;
  } catch { /* ignore */ }
  return env;
}

/**
 * Extract TEST_SUITE.id from a test file by reading the source and parsing
 * the export with a regex. Avoids importing the module.
 */
function extractSuiteId(filepath: string): { id: string; label: string } | null {
  try {
    const content = readFileSync(filepath, 'utf-8');
    const suiteMatch = content.match(
      /(?:export\s+)?(?:const|let|var)\s+TEST_SUITE\s*=\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/s,
    );
    if (!suiteMatch) return null;
    const block = suiteMatch[1];
    const idMatch = block.match(/id:\s*['"]([^'"]+)['"]/);
    const labelMatch = block.match(/label:\s*['"]([^'"]+)['"]/);
    if (!idMatch) return null;
    return { id: idMatch[1], label: labelMatch?.[1] ?? idMatch[1] };
  } catch {
    return null;
  }
}

async function postJson(url: string, data: Record<string, unknown>, token: string): Promise<unknown> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(10000),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`HTTP ${resp.status}: ${body.slice(0, 200)}`);
  }
  return resp.json();
}

export default class PixsimReporter implements Reporter {
  private startTime = 0;
  private suiteResults = new Map<string, SuiteResult>();
  private fileToSuite = new Map<string, string>();

  onInit(): void {
    this.startTime = Date.now();
  }

  onTestModuleCollected(testModule: any): void {
    if (!isEnabled()) return;
    const filepath: string = testModule?.filepath ?? testModule?.moduleId ?? '';
    if (!filepath) return;

    const suite = extractSuiteId(filepath);
    if (!suite) return;

    this.fileToSuite.set(filepath, suite.id);
    if (!this.suiteResults.has(suite.id)) {
      this.suiteResults.set(suite.id, {
        suiteId: suite.id,
        label: suite.label,
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        failures: [],
      });
    }
  }

  async onTestRunEnd(testModules: ReadonlyArray<any>): Promise<void> {
    if (!isEnabled()) return;
    if (!testModules || testModules.length === 0) return;

    // Tally results per suite from TestModule objects
    for (const mod of testModules) {
      const filepath: string = mod?.filepath ?? mod?.moduleId ?? '';
      const suiteId = this.fileToSuite.get(filepath);
      if (!suiteId) continue;
      const result = this.suiteResults.get(suiteId);
      if (!result) continue;

      // Vitest v4 TestModule has .children() iterator for TestSuite/TestCase
      this._tallyModule(mod, result);
    }

    // Submit results
    const endTime = Date.now();
    const durationMs = endTime - this.startTime;
    const env = detectEnvironment();
    const base = apiBase();
    const token = apiToken();
    const url = `${base}/api/v1/dev/testing/runs`;

    // Best-effort sync
    try { await postJson(`${base}/api/v1/dev/testing/sync`, {}, token); } catch { /* non-fatal */ }

    let submitted = 0;

    for (const [, result] of this.suiteResults) {
      if (result.total === 0) continue;

      const status = result.failed === 0 ? 'pass' : 'fail';
      const payload = {
        suite_id: result.suiteId,
        status,
        started_at: new Date(this.startTime).toISOString(),
        finished_at: new Date(endTime).toISOString(),
        duration_ms: durationMs,
        summary: {
          total: result.total,
          passed: result.passed,
          failed: result.failed,
          skipped: result.skipped,
          failures: result.failures.slice(0, 20),
        },
        environment: env,
      };

      try {
        await postJson(url, payload, token);
        submitted++;
      } catch (e) {
        console.log(`\n[pixsim] Failed to submit run for '${result.suiteId}': ${e}`);
      }
    }

    if (submitted) {
      console.log(`\n[pixsim] Submitted ${submitted} vitest run(s) to ${base}`);
    }
  }

  private _tallyModule(mod: any, result: SuiteResult): void {
    // Vitest v4: TestModule has .children() that returns TestSuite/TestCase
    // TestCase has .result() returning { state: 'passed'|'failed'|'skipped' }
    const children = typeof mod.children === 'function' ? mod.children() : mod.children ?? mod.tasks ?? [];
    for (const child of children) {
      const type: string = child?.type ?? '';
      if (type === 'test' || type === 'custom') {
        this._tallyTestCase(child, result);
      } else if (type === 'suite' || type === 'collector' || child.children || child.tasks) {
        this._tallyModule(child, result);
      }
    }
  }

  private _tallyTestCase(testCase: any, result: SuiteResult): void {
    result.total++;
    // Vitest v4: testCase.result() returns TestResult with .state
    const testResult = typeof testCase.result === 'function' ? testCase.result() : testCase.result;
    const state: string = testResult?.state ?? '';

    if (state === 'passed' || state === 'pass') {
      result.passed++;
    } else if (state === 'skipped' || state === 'skip' || state === 'todo') {
      result.skipped++;
    } else {
      result.failed++;
      const errors = testResult?.errors ?? [];
      const msg = errors[0]?.message ?? (errors[0]?.toString?.()) ?? (state || 'unknown');
      result.failures.push({
        test: testCase.name ?? testCase.id ?? '?',
        error: state || 'fail',
        message: String(msg).slice(0, 300),
      });
    }
  }
}

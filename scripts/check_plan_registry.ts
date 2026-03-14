#!/usr/bin/env node
/**
 * Plan Registry Checker — thin wrapper.
 *
 * All governance logic now lives in the Python backend:
 *   pixsim7/backend/main/services/docs/plan_governance.py
 *
 * This wrapper delegates to the Python CLI and is kept only for
 * backwards compatibility. Prefer:
 *   python scripts/plan_governance_cli.py check
 *
 * @deprecated Use `pnpm docs:plans:check` (which calls plan_governance_cli.py directly).
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const PROJECT_ROOT = process.cwd();
const CLI = path.join(PROJECT_ROOT, 'scripts', 'plan_governance_cli.py');

try {
  execFileSync('python', [CLI, 'check'], {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
  });
} catch {
  process.exit(1);
}

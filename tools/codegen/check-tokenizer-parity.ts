#!/usr/bin/env tsx
/**
 * Tokenizer parity checker (Python -> TS drift guard).
 *
 * Asserts that the TS tokenizer (packages/core/prompt/src/tokenizer.ts)
 * reproduces, byte-for-byte (offsets included), the AUTHORITATIVE Python
 * tokenizer output recorded in tokenizer.parity.fixtures.json.
 *
 * The fixtures are produced by scripts/gen_tokenizer_parity_fixtures.py from
 * the shared corpus. Run the Python `--check` first (CI) to confirm the
 * fixtures are fresh vs Python, then this to confirm TS matches the fixtures;
 * the two together prove TS == Python.
 *
 * Part of plan prompt-variable-placeholders, checkpoint cp-structure-decouple.
 *
 * Usage:
 *   pnpm tokenizer-parity:check   (runs the Python freshness check + this)
 *   tsx tools/codegen/check-tokenizer-parity.ts
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { tokenize } from '../../packages/core/prompt/src/tokenizer';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');
const FIXTURES_PATH = path.join(
  REPO_ROOT,
  'packages',
  'core',
  'prompt',
  'src',
  '__tests__',
  'tokenizer.parity.fixtures.json',
);

interface FixtureCase {
  id: string;
  text: string;
  output: unknown;
}

/** Stable JSON with sorted keys — compares values + offsets, ignoring key order. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      return Object.fromEntries(Object.entries(val as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
    }
    return val;
  });
}

function main(): void {
  const fixtures = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf-8')) as { cases: FixtureCase[] };
  const cases = fixtures.cases ?? [];

  const failures: string[] = [];
  for (const c of cases) {
    const ts = tokenize(c.text);
    const actual = canonical(ts);
    const expected = canonical(c.output);
    if (actual !== expected) {
      failures.push(
        `  [${c.id}] text=${JSON.stringify(c.text)}\n` +
          `    expected (py): ${expected}\n` +
          `    actual   (ts): ${actual}`,
      );
    }
  }

  if (failures.length > 0) {
    console.error(
      `[tokenizer-parity] ${failures.length}/${cases.length} case(s) diverge from Python:\n` +
        failures.join('\n') +
        '\n\nThe TS tokenizer (tokenizer.ts) drifted from the Python tokenizer.\n' +
        'If the grammar changed intentionally, regenerate fixtures:\n' +
        '  python scripts/gen_tokenizer_parity_fixtures.py',
    );
    process.exit(1);
  }

  console.log(`[tokenizer-parity] OK — TS matches Python over ${cases.length} cases (byte-for-byte).`);
}

main();

#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const appRoot = path.resolve(__dirname, '..');
const srcRoot = path.join(appRoot, 'src');
const repoRoot = path.resolve(appRoot, '..', '..');

const allowlistPath = path.join(repoRoot, 'docs', 'architecture', 'hmr-wildcard-allowlist.json');
const baselinePath = path.join(repoRoot, 'docs', 'architecture', 'hmr-wildcard-baseline.json');

const shouldPrintAll = process.argv.includes('--all');
const shouldWriteBaseline = process.argv.includes('--write-baseline');
const shouldCheckBaseline = process.argv.includes('--check-baseline');

const exportStarPattern =
  /^\s*export\s+\*\s*(?:as\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*)?from\s+['"]([^'"]+)['"]\s*;?\s*$/;

function normalizeRelative(filePath) {
  return path.relative(appRoot, filePath).split(path.sep).join('/');
}

function classifyArea(file) {
  const parts = file.split('/');
  if (parts.length < 2) return 'other';
  return parts[1];
}

function entryKey(file, source) {
  return `${file}|${source}`;
}

function entryFingerprint(item) {
  return `${item.file}|${item.source}|${item.namespace ?? ''}`;
}

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      files.push(...(await walk(full)));
      continue;
    }
    if (/\.(ts|tsx|mts|cts)$/.test(entry.name)) {
      files.push(full);
    }
  }

  return files;
}

async function readAllowlist() {
  const raw = await fs.readFile(allowlistPath, 'utf8');
  const parsed = JSON.parse(raw);
  const allowed = new Set();

  for (const entry of parsed.entries ?? []) {
    if (!entry.file || !entry.source) continue;
    allowed.add(entryKey(entry.file, entry.source));
  }

  return { parsed, allowed };
}

async function collectWildcardExports() {
  const files = await walk(srcRoot);
  const matches = [];

  for (const full of files) {
    const raw = await fs.readFile(full, 'utf8');
    const lines = raw.split(/\r?\n/);
    const file = normalizeRelative(full);

    lines.forEach((lineText, idx) => {
      const match = lineText.match(exportStarPattern);
      if (!match) return;
      const namespace = match[1] ?? null;
      const source = match[2];
      const isExternal = !source.startsWith('.');
      matches.push({
        file,
        line: idx + 1,
        source,
        namespace,
        isExternal,
        area: classifyArea(file),
      });
    });
  }

  matches.sort((a, b) => {
    if (a.file === b.file) return a.line - b.line;
    return a.file.localeCompare(b.file);
  });

  return matches;
}

function toCountMap(items, pick) {
  const out = new Map();
  for (const item of items) {
    const key = pick(item);
    out.set(key, (out.get(key) ?? 0) + 1);
  }
  return out;
}

function printSummary(matches, allowlisted, remaining) {
  const now = new Date().toISOString();
  console.log(`[hmr-wildcards] ${now}`);
  console.log(`[hmr-wildcards] Total: ${matches.length}`);
  console.log(`[hmr-wildcards] Allowlisted: ${allowlisted.length}`);
  console.log(`[hmr-wildcards] Remaining: ${remaining.length}`);

  const externalCount = remaining.filter((m) => m.isExternal).length;
  const localCount = remaining.length - externalCount;
  console.log(`[hmr-wildcards] Remaining (local): ${localCount}`);
  console.log(`[hmr-wildcards] Remaining (external): ${externalCount}`);

  const byArea = [...toCountMap(remaining, (m) => m.area).entries()].sort((a, b) => b[1] - a[1]);
  if (byArea.length > 0) {
    console.log('\nRemaining by area:');
    for (const [area, count] of byArea) {
      console.log(`- ${area}: ${count}`);
    }
  }

  const byFile = [...toCountMap(remaining, (m) => m.file).entries()].sort((a, b) => b[1] - a[1]);
  if (byFile.length > 0) {
    console.log('\nTop files (remaining wildcard exports):');
    for (const [file, count] of byFile.slice(0, 20)) {
      console.log(`- ${file}: ${count}`);
    }
  }

  if (!shouldPrintAll && remaining.length > 0) {
    console.log('\nUse --all to print every remaining wildcard export entry.');
  }

  if (shouldPrintAll && remaining.length > 0) {
    console.log('\nRemaining entries:');
    for (const item of remaining) {
      const ns = item.namespace ? ` as ${item.namespace}` : '';
      console.log(`- ${item.file}:${item.line} -> export *${ns} from '${item.source}'`);
    }
  }
}

async function writeBaseline(matches, allowlisted, remaining) {
  const payload = {
    generatedAt: new Date().toISOString(),
    sourceRoot: 'apps/main/src',
    totals: {
      all: matches.length,
      allowlisted: allowlisted.length,
      remaining: remaining.length,
      remainingLocal: remaining.filter((m) => !m.isExternal).length,
      remainingExternal: remaining.filter((m) => m.isExternal).length,
    },
    remainingByArea: Object.fromEntries(
      [...toCountMap(remaining, (m) => m.area).entries()].sort((a, b) => b[1] - a[1]),
    ),
    entries: matches,
  };

  await fs.writeFile(baselinePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`\n[hmr-wildcards] Baseline written: ${path.relative(repoRoot, baselinePath)}`);
}

async function checkAgainstBaseline(allowlistSet, remaining) {
  let baseline;
  try {
    const raw = await fs.readFile(baselinePath, 'utf8');
    baseline = JSON.parse(raw);
  } catch (error) {
    console.error('[hmr-wildcards] Baseline check failed: could not read baseline file.');
    console.error(`[hmr-wildcards] Expected: ${path.relative(repoRoot, baselinePath)}`);
    throw error;
  }

  const baselineEntries = Array.isArray(baseline.entries) ? baseline.entries : [];
  const baselineRemaining = baselineEntries.filter(
    (item) => !allowlistSet.has(entryKey(item.file, item.source))
  );

  const baselineSet = new Set(baselineRemaining.map(entryFingerprint));
  const currentSet = new Set(remaining.map(entryFingerprint));
  const newlyIntroduced = remaining.filter((item) => !baselineSet.has(entryFingerprint(item)));

  if (newlyIntroduced.length === 0) {
    console.log('\n[hmr-wildcards] Baseline check passed (no new wildcard exports).');
    return;
  }

  console.error('\n[hmr-wildcards] Baseline check failed: new wildcard exports detected.');
  for (const item of newlyIntroduced) {
    const ns = item.namespace ? ` as ${item.namespace}` : '';
    console.error(`- ${item.file}:${item.line} -> export *${ns} from '${item.source}'`);
  }
  console.error(
    `[hmr-wildcards] New entries: ${newlyIntroduced.length} (baseline remaining: ${baselineSet.size}, current remaining: ${currentSet.size})`
  );
  process.exit(1);
}

async function main() {
  const { allowed } = await readAllowlist();
  const matches = await collectWildcardExports();

  const allowlisted = matches.filter((item) => allowed.has(entryKey(item.file, item.source)));
  const remaining = matches.filter((item) => !allowed.has(entryKey(item.file, item.source)));

  printSummary(matches, allowlisted, remaining);

  if (shouldWriteBaseline) {
    await writeBaseline(matches, allowlisted, remaining);
  }

  if (shouldCheckBaseline) {
    await checkAgainstBaseline(allowed, remaining);
  }
}

main().catch((error) => {
  console.error('[hmr-wildcards] Audit failed.');
  console.error(error);
  process.exit(1);
});

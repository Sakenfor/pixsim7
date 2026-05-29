#!/usr/bin/env tsx
/**
 * Generates TypeScript constants for latin-enhancer domains used by UI surfaces.
 *
 * Sources:
 *   - tools/cue/prompt_packs/latin_*.cue              (domain discovery)
 *   - pixsim7/backend/main/plugins/cue_packs/vocabularies/latin_enhancer_domains.yaml
 *
 * Output:
 *   - packages/shared/types/src/latin-enhancer-domains.generated.ts
 *
 * Usage:
 *   pnpm latin-enhancer-domains:gen
 *   pnpm latin-enhancer-domains:check
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'yaml';

const CHECK_MODE = process.argv.includes('--check');

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const normalizedDir = process.platform === 'win32' && SCRIPT_DIR.startsWith('/')
  ? SCRIPT_DIR.slice(1)
  : SCRIPT_DIR;

const PROMPT_PACKS_DIR = path.resolve(normalizedDir, '../../tools/cue/prompt_packs');
const META_PATH = path.resolve(
  normalizedDir,
  '../../pixsim7/backend/main/plugins/cue_packs/vocabularies/latin_enhancer_domains.yaml'
);
const OUT_PATH = path.resolve(
  normalizedDir,
  '../../packages/shared/types/src/latin-enhancer-domains.generated.ts'
);

const ALLOWED_COLORS = [
  'blue',
  'green',
  'purple',
  'yellow',
  'pink',
  'cyan',
  'orange',
  'gray',
  'amber',
  'red',
  'slate',
] as const;

type DomainMeta = {
  composer_domains?: unknown;
  domain_colors?: unknown;
};

function normalizeDomain(value: string): string {
  return value.trim().toLowerCase();
}

function readLatinDomainsFromCue(): { domains: string[]; sources: Record<string, string[]> } {
  if (!fs.existsSync(PROMPT_PACKS_DIR)) {
    console.error(`✗ Missing CUE prompt-pack directory: ${PROMPT_PACKS_DIR}`);
    process.exit(1);
  }

  const domainSources = new Map<string, Set<string>>();
  const cueFiles = fs
    .readdirSync(PROMPT_PACKS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^latin_.*\.cue$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  const domainArrayRegex = /domain:\s*\[(?<values>[^\]]+)\]/g;
  const quotedValueRegex = /"([^"]+)"/g;

  for (const fileName of cueFiles) {
    const fullPath = path.join(PROMPT_PACKS_DIR, fileName);
    const content = fs.readFileSync(fullPath, 'utf8');
    const packId = fileName.replace(/\.cue$/i, '');

    for (const match of content.matchAll(domainArrayRegex)) {
      const values = match.groups?.values ?? '';
      for (const valueMatch of values.matchAll(quotedValueRegex)) {
        const raw = valueMatch[1] ?? '';
        const domain = normalizeDomain(raw);
        if (!domain) continue;
        if (!domainSources.has(domain)) {
          domainSources.set(domain, new Set<string>());
        }
        domainSources.get(domain)?.add(packId);
      }
    }
  }

  if (domainSources.size === 0) {
    console.error(`✗ No latin domains discovered from ${PROMPT_PACKS_DIR}`);
    process.exit(1);
  }

  const domains = [...domainSources.keys()].sort((a, b) => a.localeCompare(b));
  const sources = Object.fromEntries(
    domains.map((domain) => [
      domain,
      [...(domainSources.get(domain) ?? new Set<string>())].sort((a, b) => a.localeCompare(b)),
    ])
  );

  return { domains, sources };
}

function readMeta(): {
  composerDomains: string[];
  domainColors: Record<string, string>;
} {
  if (!fs.existsSync(META_PATH)) {
    console.error(`✗ Missing latin domain metadata file: ${META_PATH}`);
    process.exit(1);
  }

  let parsed: DomainMeta;
  try {
    parsed = yaml.parse(fs.readFileSync(META_PATH, 'utf8')) as DomainMeta;
  } catch (err) {
    console.error(`✗ Failed to parse ${META_PATH}:`);
    console.error(`  ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  const composerDomainsRaw = parsed.composer_domains;
  const composerDomains = Array.isArray(composerDomainsRaw)
    ? composerDomainsRaw
        .filter((value): value is string => typeof value === 'string')
        .map(normalizeDomain)
        .filter((value) => value.length > 0)
    : [];

  const domainColorsRaw = parsed.domain_colors;
  const domainColors: Record<string, string> = {};
  if (domainColorsRaw && typeof domainColorsRaw === 'object' && !Array.isArray(domainColorsRaw)) {
    for (const [rawDomain, rawColor] of Object.entries(domainColorsRaw as Record<string, unknown>)) {
      if (typeof rawColor !== 'string') continue;
      const domain = normalizeDomain(rawDomain);
      const color = rawColor.trim().toLowerCase();
      if (!domain || !color) continue;
      domainColors[domain] = color;
    }
  }

  return { composerDomains, domainColors };
}

function validate(
  discoveredDomains: string[],
  composerDomains: string[],
  domainColors: Record<string, string>
): void {
  if (composerDomains.length === 0) {
    console.error(`✗ composer_domains is empty in ${META_PATH}`);
    process.exit(1);
  }

  if (Object.keys(domainColors).length === 0) {
    console.error(`✗ domain_colors is empty in ${META_PATH}`);
    process.exit(1);
  }

  const discoveredSet = new Set(discoveredDomains);
  const colorKeys = Object.keys(domainColors).sort((a, b) => a.localeCompare(b));

  const invalidComposerDomains = composerDomains.filter((domain) => !discoveredSet.has(domain));
  if (invalidComposerDomains.length > 0) {
    console.error('✗ composer_domains contains unknown domains (not discovered from latin CUE packs):');
    for (const domain of invalidComposerDomains) {
      console.error(`  - ${domain}`);
    }
    process.exit(1);
  }

  const composerMissingColors = composerDomains.filter((domain) => !domainColors[domain]);
  if (composerMissingColors.length > 0) {
    console.error('✗ composer_domains contains entries with no domain_colors mapping:');
    for (const domain of composerMissingColors) {
      console.error(`  - ${domain}`);
    }
    process.exit(1);
  }

  const missingDomainColors = discoveredDomains.filter((domain) => !domainColors[domain]);
  if (missingDomainColors.length > 0) {
    console.error('✗ Some discovered latin domains are missing color mappings:');
    for (const domain of missingDomainColors) {
      console.error(`  - ${domain}`);
    }
    process.exit(1);
  }

  const extraDomainColors = colorKeys.filter((domain) => !discoveredSet.has(domain));
  if (extraDomainColors.length > 0) {
    console.error('✗ domain_colors contains stale/unknown domains (not discovered in latin CUE packs):');
    for (const domain of extraDomainColors) {
      console.error(`  - ${domain}`);
    }
    process.exit(1);
  }

  const allowedSet = new Set<string>(ALLOWED_COLORS);
  const invalidColors = colorKeys.filter((domain) => !allowedSet.has(domainColors[domain]));
  if (invalidColors.length > 0) {
    console.error(`✗ domain_colors contains unsupported color tokens. Allowed: ${ALLOWED_COLORS.join(', ')}`);
    for (const domain of invalidColors) {
      console.error(`  - ${domain}: ${domainColors[domain]}`);
    }
    process.exit(1);
  }
}

function generateOutput(params: {
  domains: string[];
  composerDomains: string[];
  colors: Record<string, string>;
  sources: Record<string, string[]>;
}): string {
  const { domains, composerDomains, colors, sources } = params;
  const colorMap = Object.fromEntries(domains.map((domain) => [domain, colors[domain]]));
  const sourceMap = Object.fromEntries(domains.map((domain) => [domain, sources[domain] ?? []]));

  return `// Auto-generated from latin prompt-pack domains metadata - DO NOT EDIT
// Re-run: pnpm latin-enhancer-domains:gen
//
// Sources:
//   - tools/cue/prompt_packs/latin_*.cue (domain tags)
//   - pixsim7/backend/main/plugins/cue_packs/vocabularies/latin_enhancer_domains.yaml (UI metadata)

/**
 * All discovered latin-enhancer domain tags from CUE prompt packs.
 */
export const LATIN_ENHANCER_DOMAINS = ${JSON.stringify(domains)} as const;

export type LatinEnhancerDomain = typeof LATIN_ENHANCER_DOMAINS[number];

/**
 * Preferred domain order for the Latin Composer chips.
 */
export const LATIN_COMPOSER_DOMAINS = ${JSON.stringify(composerDomains)} as const satisfies readonly LatinEnhancerDomain[];

/**
 * Allowed color tokens for latin domain UI chips.
 */
export const LATIN_ENHANCER_DOMAIN_COLOR_TOKENS = ${JSON.stringify(ALLOWED_COLORS)} as const;

export type LatinEnhancerDomainColor = typeof LATIN_ENHANCER_DOMAIN_COLOR_TOKENS[number];

/**
 * Latin domain -> color token mapping.
 */
export const LATIN_ENHANCER_DOMAIN_COLORS = ${JSON.stringify(colorMap, null, 2)} as const satisfies Record<LatinEnhancerDomain, LatinEnhancerDomainColor>;

/**
 * Latin domain -> source CUE pack IDs where the domain appears.
 */
export const LATIN_ENHANCER_DOMAIN_SOURCES = ${JSON.stringify(sourceMap, null, 2)} as const satisfies Record<LatinEnhancerDomain, readonly string[]>;

export function isLatinEnhancerDomain(value: string): value is LatinEnhancerDomain {
  return (LATIN_ENHANCER_DOMAINS as readonly string[]).includes(value);
}
`;
}

function main(): void {
  const { domains, sources } = readLatinDomainsFromCue();
  const { composerDomains, domainColors } = readMeta();

  validate(domains, composerDomains, domainColors);

  const output = generateOutput({
    domains,
    composerDomains,
    colors: domainColors,
    sources,
  });

  if (CHECK_MODE) {
    if (!fs.existsSync(OUT_PATH)) {
      console.error(`✗ Generated file missing: ${OUT_PATH}`);
      console.error('  Run: pnpm latin-enhancer-domains:gen');
      process.exit(1);
    }
    const existing = fs.readFileSync(OUT_PATH, 'utf8');
    if (existing !== output) {
      console.error(`✗ Generated file out of date: ${OUT_PATH}`);
      console.error('  Run: pnpm latin-enhancer-domains:gen');
      process.exit(1);
    }
    console.log(`✓ Generated file is current: ${OUT_PATH}`);
    return;
  }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, output, 'utf8');
  console.log(`✓ Generated: ${OUT_PATH}`);
}

main();

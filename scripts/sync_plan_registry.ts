#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import {
  buildRegistryFromActiveManifests,
  generatePlanIndexMarkdown,
  loadPlanManifests,
  stringifyRegistryYaml,
  toPosix,
} from './plan_manifest_utils';

const PROJECT_ROOT = process.cwd();
const REGISTRY_PATH = path.join(PROJECT_ROOT, 'docs', 'plans', 'registry.yaml');
const README_PATH = path.join(PROJECT_ROOT, 'docs', 'plans', 'README.md');
const INDEX_BEGIN = '<!-- BEGIN:GENERATED_PLAN_INDEX -->';
const INDEX_END = '<!-- END:GENERATED_PLAN_INDEX -->';
const CHECK_MODE = process.argv.includes('--check');

function normalizedContent(raw: string): string {
  return raw.replace(/\r\n/g, '\n').trimEnd() + '\n';
}

function injectBetweenMarkers(content: string, beginMarker: string, endMarker: string, generated: string): string | null {
  const beginIdx = content.indexOf(beginMarker);
  const endIdx = content.indexOf(endMarker);
  if (beginIdx === -1 || endIdx === -1 || endIdx <= beginIdx) return null;
  return content.slice(0, beginIdx + beginMarker.length) + '\n' + generated + '\n' + content.slice(endIdx);
}

function main(): number {
  const manifestResult = loadPlanManifests(PROJECT_ROOT, ['active']);
  if (manifestResult.warnings.length > 0) {
    console.log('Warnings:');
    for (const warning of manifestResult.warnings) {
      console.log(`  - ${warning}`);
    }
  }
  if (manifestResult.errors.length > 0) {
    console.error('Errors:');
    for (const err of manifestResult.errors) {
      console.error(`  - ${err}`);
    }
    return 1;
  }

  if (manifestResult.manifests.length === 0) {
    console.error('No active manifests found under docs/plans/active.');
    return 1;
  }

  const registry = buildRegistryFromActiveManifests(manifestResult.manifests);
  const generated = normalizedContent(stringifyRegistryYaml(registry));

  const indexMarkdown = generatePlanIndexMarkdown(manifestResult.manifests);

  if (CHECK_MODE) {
    let ok = true;

    if (!fs.existsSync(REGISTRY_PATH)) {
      console.error(`Missing registry file: ${toPosix(path.relative(PROJECT_ROOT, REGISTRY_PATH))}`);
      ok = false;
    } else {
      const existing = normalizedContent(fs.readFileSync(REGISTRY_PATH, 'utf8'));
      if (existing !== generated) {
        console.error('docs/plans/registry.yaml is out of sync with manifests.');
        ok = false;
      } else {
        console.log('docs/plans/registry.yaml is in sync with manifests.');
      }
    }

    if (fs.existsSync(README_PATH)) {
      const readmeContent = fs.readFileSync(README_PATH, 'utf8');
      const expectedReadme = injectBetweenMarkers(readmeContent, INDEX_BEGIN, INDEX_END, indexMarkdown);
      if (expectedReadme !== null) {
        if (normalizedContent(readmeContent) !== normalizedContent(expectedReadme)) {
          console.error('docs/plans/README.md plan index is out of sync with manifests.');
          ok = false;
        } else {
          console.log('docs/plans/README.md plan index is in sync with manifests.');
        }
      }
    }

    if (!ok) {
      console.error('Run: pnpm docs:plans:sync');
      return 1;
    }
    return 0;
  }

  fs.writeFileSync(REGISTRY_PATH, generated, 'utf8');
  console.log(`Wrote ${toPosix(path.relative(PROJECT_ROOT, REGISTRY_PATH))} from active manifests.`);

  if (fs.existsSync(README_PATH)) {
    const readmeContent = fs.readFileSync(README_PATH, 'utf8');
    const updatedReadme = injectBetweenMarkers(readmeContent, INDEX_BEGIN, INDEX_END, indexMarkdown);
    if (updatedReadme !== null) {
      fs.writeFileSync(README_PATH, normalizedContent(updatedReadme), 'utf8');
      console.log(`Updated plan index in ${toPosix(path.relative(PROJECT_ROOT, README_PATH))}.`);
    }
  }

  return 0;
}

process.exit(main());

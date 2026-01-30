#!/usr/bin/env tsx
/**
 * Run Plugin-Contributed Codegen Tasks
 *
 * Fetches frontend manifests from the running backend and executes
 * any codegen_tasks declared by plugins.
 *
 * This is the "escape hatch" (Option A) for plugins that need custom
 * type generation beyond the standard frontend_manifest schema.
 *
 * Usage:
 *   pnpm codegen -- --only plugin-codegen
 *
 * Requires backend to be running at BACKEND_URL (default: http://localhost:8000)
 */

import { spawn } from 'node:child_process';
import * as path from 'node:path';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';
const FRONTEND_MANIFESTS_ENDPOINT = '/api/v1/admin/plugins/frontend/all';

interface CodegenTask {
  id: string;
  description: string;
  script: string;
  supportsCheck?: boolean;
  groups?: string[];
}

interface FrontendManifest {
  pluginId: string;
  pluginName: string;
  version: string;
  codegenTasks?: CodegenTask[];
}

interface ManifestEntry {
  pluginId: string;
  enabled: boolean;
  manifest: FrontendManifest;
}

interface AllManifestsResponse {
  manifests: ManifestEntry[];
  total: number;
}

async function fetchManifests(): Promise<AllManifestsResponse | null> {
  try {
    const url = `${BACKEND_URL}${FRONTEND_MANIFESTS_ENDPOINT}`;
    console.log(`Fetching plugin manifests from ${url}...`);

    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Failed to fetch manifests: ${response.status} ${response.statusText}`);
      return null;
    }

    return (await response.json()) as AllManifestsResponse;
  } catch (error) {
    console.error('Error fetching manifests:', error);
    console.log('Make sure the backend is running at', BACKEND_URL);
    return null;
  }
}

function collectCodegenTasks(data: AllManifestsResponse): Array<{ pluginId: string; task: CodegenTask }> {
  const tasks: Array<{ pluginId: string; task: CodegenTask }> = [];

  for (const entry of data.manifests) {
    if (!entry.enabled) continue;

    const codegenTasks = entry.manifest.codegenTasks ?? [];
    for (const task of codegenTasks) {
      tasks.push({ pluginId: entry.pluginId, task });
    }
  }

  return tasks;
}

async function runTask(pluginId: string, task: CodegenTask): Promise<boolean> {
  console.log(`\n[${pluginId}] Running: ${task.id}`);
  console.log(`  Description: ${task.description}`);
  console.log(`  Script: ${task.script}`);

  const scriptPath = path.resolve(process.cwd(), task.script);

  return new Promise((resolve) => {
    const child = spawn('npx', ['tsx', scriptPath], {
      stdio: 'inherit',
      shell: true,
    });

    child.on('close', (code) => {
      if (code === 0) {
        console.log(`  ✓ ${task.id} completed successfully`);
        resolve(true);
      } else {
        console.error(`  ✗ ${task.id} failed with exit code ${code}`);
        resolve(false);
      }
    });

    child.on('error', (error) => {
      console.error(`  ✗ ${task.id} failed:`, error);
      resolve(false);
    });
  });
}

async function main() {
  console.log('='.repeat(60));
  console.log('Plugin Codegen Task Runner');
  console.log('='.repeat(60));

  const data = await fetchManifests();
  if (!data) {
    process.exit(1);
  }

  const tasks = collectCodegenTasks(data);

  if (tasks.length === 0) {
    console.log('\nNo plugin codegen tasks found.');
    console.log('Plugins can declare codegen tasks in their frontend_manifest.codegen_tasks field.');
    return;
  }

  console.log(`\nFound ${tasks.length} codegen task(s) from plugins:`);
  for (const { pluginId, task } of tasks) {
    console.log(`  - ${pluginId}: ${task.id}`);
  }

  let succeeded = 0;
  let failed = 0;

  for (const { pluginId, task } of tasks) {
    const success = await runTask(pluginId, task);
    if (success) {
      succeeded++;
    } else {
      failed++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`Results: ${succeeded} succeeded, ${failed} failed`);
  console.log('='.repeat(60));

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});

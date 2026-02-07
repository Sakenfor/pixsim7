#!/usr/bin/env tsx
/**
 * Unified codegen runner.
 *
 * Usage:
 *   pnpm codegen
 *   pnpm codegen -- --check
 *   pnpm codegen -- --group types
 *   pnpm codegen -- --only openapi,branded
 *   pnpm codegen -- --skip openapi
 *   pnpm codegen -- --list
 */

import { spawn } from 'node:child_process';
import { CODEGEN_TASKS, type CodegenTask } from './manifest';

function resolveBin(name: string): string {
  return process.platform === 'win32' ? `${name}.cmd` : name;
}

function getArgValue(flag: string, args: string[]): string | undefined {
  const prefix = `${flag}=`;
  const direct = args.find((arg) => arg.startsWith(prefix));
  if (direct) {
    return direct.slice(prefix.length);
  }
  const index = args.indexOf(flag);
  if (index !== -1 && index + 1 < args.length) {
    return args[index + 1];
  }
  return undefined;
}

function parseList(value?: string): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function listTasks(tasks: CodegenTask[]): void {
  for (const task of tasks) {
    const groups = task.groups?.length ? ` [${task.groups.join(', ')}]` : '';
    console.log(`- ${task.id}${groups}: ${task.description}`);
  }
}

function getKnownGroups(tasks: CodegenTask[]): Set<string> {
  const groups = new Set<string>();
  for (const task of tasks) {
    for (const group of task.groups ?? []) {
      groups.add(group);
    }
  }
  return groups;
}

function validateSelections(
  tasks: CodegenTask[],
  ids: string[],
  groups: string[]
): void {
  const knownIds = new Set(tasks.map((task) => task.id));
  const unknownIds = ids.filter((id) => !knownIds.has(id));
  if (unknownIds.length) {
    throw new Error(`Unknown task id(s): ${unknownIds.join(', ')}`);
  }

  const knownGroups = getKnownGroups(tasks);
  const unknownGroups = groups.filter((group) => !knownGroups.has(group));
  if (unknownGroups.length) {
    throw new Error(`Unknown group(s): ${unknownGroups.join(', ')}`);
  }
}

function runCommand(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed (${code}): ${command} ${args.join(' ')}`));
      }
    });
  });
}

async function runTask(task: CodegenTask, checkMode: boolean): Promise<void> {
  const runner = resolveBin('tsx');
  const args = [task.script, ...(task.args ?? [])];

  if (checkMode) {
    if (!task.supportsCheck) {
      throw new Error(`Task "${task.id}" does not support --check mode.`);
    }
    args.push('--check');
  }

  await runCommand(runner, args);
}

async function main() {
  const args = process.argv.slice(2);
  const checkMode = args.includes('--check');
  const listMode = args.includes('--list');
  const groupFilter = parseList(getArgValue('--group', args));
  const onlyFilter = parseList(getArgValue('--only', args));
  const skipFilter = parseList(getArgValue('--skip', args));

  validateSelections(CODEGEN_TASKS, onlyFilter.concat(skipFilter), groupFilter);

  let selected = CODEGEN_TASKS;
  if (groupFilter.length) {
    selected = selected.filter((task) =>
      task.groups?.some((group) => groupFilter.includes(group))
    );
  }
  if (onlyFilter.length) {
    selected = selected.filter((task) => onlyFilter.includes(task.id));
  }
  if (skipFilter.length) {
    selected = selected.filter((task) => !skipFilter.includes(task.id));
  }

  if (listMode) {
    listTasks(selected);
    return;
  }

  if (!selected.length) {
    throw new Error('No codegen tasks selected.');
  }

  for (const task of selected) {
    console.log(`\n[codegen] ${task.id}`);
    await runTask(task, checkMode);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

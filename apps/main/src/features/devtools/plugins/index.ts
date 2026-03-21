/**
 * Dev Tools Plugins Index
 *
 * Re-exports all tool definitions from tools.ts and auto-collects them
 * into `builtInDevTools` for bulk registration — no manual listing needed.
 * To add a new dev tool, just export it from tools.ts.
 */

import type { DevToolDefinition } from '@pixsim7/shared.devtools.core';

import * as allTools from './tools';

// Re-export all individual tool definitions
export * from './tools';

// Auto-collect: every export from tools.ts that looks like a DevToolDefinition
export const builtInDevTools: DevToolDefinition[] = Object.values(allTools).filter(
  (v): v is DevToolDefinition =>
    v != null && typeof v === 'object' && 'id' in v && 'label' in v,
);

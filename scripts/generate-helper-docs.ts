#!/usr/bin/env ts-node
/**
 * Generate Session Helper Documentation
 *
 * This script generates markdown documentation for all registered session helpers.
 * Run with: npx ts-node scripts/generate-helper-docs.ts
 */

import { registerBuiltinHelpers } from '../packages/game/engine/src/session/builtinHelpers.js';
import { generateHelperDocs } from '../packages/game/engine/src/session/generateDocs.js';
import fs from 'fs';
import path from 'path';

// Register all builtin helpers
registerBuiltinHelpers();

// Generate docs
const docs = generateHelperDocs();

// Write to file
const outputPath = path.join(__dirname, '..', 'docs', 'SESSION_HELPER_REFERENCE.md');
fs.writeFileSync(outputPath, docs, 'utf-8');

console.log('✅ Session helper documentation generated!');
console.log(`📝 Output: ${outputPath}`);
console.log(`📊 Size: ${(docs.length / 1024).toFixed(2)} KB`);

#!/usr/bin/env tsx
/**
 * Documentation Pipeline Generator
 *
 * This script generates comprehensive documentation from all registries:
 * - Session Helpers (from sessionHelperRegistry)
 * - Node Types (from nodeTypeRegistry)
 * - Interactions (from InteractionRegistry)
 *
 * Output: docs/generated/*.md
 * Run: npm run generate-registry-docs
 */

import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Import registries and their registration functions
import { sessionHelperRegistry } from '../packages/game/engine/src/session/helperRegistry.js';
import { registerBuiltinHelpers } from '../packages/game/engine/src/session/builtinHelpers.js';
import { generateHelperDocs } from '../packages/game/engine/src/session/generateDocs.js';
import { nodeTypeRegistry } from '../packages/shared/graph-core/src/nodeTypeRegistry.js';
import { registerBuiltinNodeTypes } from '../packages/shared/graph-core/src/builtinNodeTypes.js';

// For interactions, we'll need to handle the frontend registry carefully
// Since it may have browser dependencies, we'll use a try-catch approach

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DOCS_DIR = resolve(__dirname, '../docs/generated');

/**
 * Generate documentation for Node Types from nodeTypeRegistry
 */
function generateNodeTypeDocs(): string {
  const allTypes = nodeTypeRegistry.getAll();

  let markdown = '# Node Type Registry Reference\n\n';
  markdown += '*Auto-generated documentation for all registered node types*\n\n';
  markdown += `**Last Updated:** ${new Date().toISOString()}\n\n`;
  markdown += `**Total Node Types:** ${allTypes.length}\n\n`;
  markdown += '---\n\n';

  // Group by category
  const categories = {
    media: [] as typeof allTypes,
    flow: [] as typeof allTypes,
    logic: [] as typeof allTypes,
    action: [] as typeof allTypes,
    custom: [] as typeof allTypes,
    uncategorized: [] as typeof allTypes,
  };

  for (const type of allTypes) {
    const category = type.category || 'uncategorized';
    if (categories[category]) {
      categories[category].push(type);
    } else {
      categories.uncategorized.push(type);
    }
  }

  // Generate TOC
  markdown += '## Table of Contents\n\n';
  for (const [category, types] of Object.entries(categories)) {
    if (types.length > 0) {
      markdown += `- [${category.charAt(0).toUpperCase() + category.slice(1)}](#${category})\n`;
    }
  }
  markdown += '\n---\n\n';

  // Generate sections for each category
  for (const [category, types] of Object.entries(categories)) {
    if (types.length === 0) continue;

    markdown += `## ${category.charAt(0).toUpperCase() + category.slice(1)}\n\n`;

    for (const type of types) {
      markdown += `### ${type.icon || '📦'} ${type.name}\n\n`;
      markdown += `**ID:** \`${type.id}\`\n\n`;

      if (type.description) {
        markdown += `**Description:** ${type.description}\n\n`;
      }

      if (type.scope) {
        markdown += `**Scope:** \`${type.scope}\`\n\n`;
      }

      if (type.category) {
        markdown += `**Category:** \`${type.category}\`\n\n`;
      }

      if (type.userCreatable !== undefined) {
        markdown += `**User Creatable:** ${type.userCreatable ? '✅ Yes' : '❌ No'}\n\n`;
      }

      if (type.color) {
        markdown += `**Color:** \`${type.color}\`\n\n`;
      }

      if (type.bgColor) {
        markdown += `**Background Color:** \`${type.bgColor}\`\n\n`;
      }

      // Show ports configuration if available
      if (type.ports) {
        markdown += '**Ports:**\n\n';
        if (type.ports.inputs?.length) {
          markdown += '- **Inputs:**\n';
          for (const input of type.ports.inputs) {
            markdown += `  - \`${input.id}\`${input.label ? ` - ${input.label}` : ''}\n`;
          }
        }
        if (type.ports.outputs?.length) {
          markdown += '- **Outputs:**\n';
          for (const output of type.ports.outputs) {
            markdown += `  - \`${output.id}\`${output.label ? ` - ${output.label}` : ''}\n`;
          }
        }
        markdown += '\n';
      }

      // Show default data structure (without values for brevity)
      if (type.defaultData && Object.keys(type.defaultData).length > 0) {
        markdown += '**Default Data Fields:**\n\n';
        markdown += '```typescript\n';
        for (const key of Object.keys(type.defaultData)) {
          markdown += `${key}\n`;
        }
        markdown += '```\n\n';
      }

      // Editor component if specified
      if (type.editorComponent) {
        markdown += `**Editor Component:** \`${type.editorComponent}\`\n\n`;
      }

      // Renderer component if specified
      if (type.rendererComponent) {
        markdown += `**Renderer Component:** \`${type.rendererComponent}\`\n\n`;
      }

      markdown += '---\n\n';
    }
  }

  return markdown;
}

/**
 * Generate documentation for Interactions
 * Note: This is a stub that documents the expected structure
 * since InteractionRegistry may have browser dependencies
 */
function generateInteractionDocs(): string {
  let markdown = '# Interaction Registry Reference\n\n';
  markdown += '*Auto-generated documentation for all registered interaction plugins*\n\n';
  markdown += `**Last Updated:** ${new Date().toISOString()}\n\n`;
  markdown += '---\n\n';

  markdown += '## Overview\n\n';
  markdown += 'The Interaction Registry manages all interaction plugins available in the game engine.\n\n';
  markdown += 'Each interaction plugin defines:\n';
  markdown += '- **ID**: Unique identifier\n';
  markdown += '- **Name**: Display name\n';
  markdown += '- **Description**: What the interaction does\n';
  markdown += '- **Icon**: Visual identifier (emoji or icon name)\n';
  markdown += '- **Config Fields**: Form fields for configuration\n';
  markdown += '- **Execute Function**: Business logic\n';
  markdown += '- **Validation**: Optional validation logic\n';
  markdown += '- **Availability**: Optional conditional availability\n\n';

  markdown += '## Plugin Structure\n\n';
  markdown += '```typescript\n';
  markdown += 'interface InteractionPlugin<TConfig extends BaseInteractionConfig> {\n';
  markdown += '  id: string;\n';
  markdown += '  name: string;\n';
  markdown += '  description: string;\n';
  markdown += '  icon?: string;\n';
  markdown += '  defaultConfig: TConfig;\n';
  markdown += '  configFields: FormField[];\n';
  markdown += '  execute: (config: TConfig, context: InteractionContext) => Promise<InteractionResult>;\n';
  markdown += '  validate?: (config: TConfig) => string | null;\n';
  markdown += '  isAvailable?: (context: InteractionContext) => boolean;\n';
  markdown += '}\n';
  markdown += '```\n\n';

  markdown += '## Registered Interactions\n\n';

  // Try to dynamically import and document interactions if possible
  markdown += '*Note: Interaction registry documentation requires runtime access to the frontend environment.*\n';
  markdown += '*To view registered interactions, start the development server and inspect the registry at runtime.*\n\n';

  markdown += '**Registry Location:** `frontend/src/lib/game/interactions/types.ts`\n\n';
  markdown += '**Global Instance:** `interactionRegistry`\n\n';

  markdown += '### Example Interaction Plugins\n\n';
  markdown += 'The following interaction types are typically available:\n\n';
  markdown += '- **pickpocket** - Attempt to steal items from NPCs\n';
  markdown += '- **persuade** - Convince NPCs through dialogue\n';
  markdown += '- **intimidate** - Use threats to influence behavior\n';
  markdown += '- **bribe** - Offer money or items for cooperation\n';
  markdown += '- **seduce** - Use charm and attraction\n';
  markdown += '- **deceive** - Mislead through lies and trickery\n\n';

  markdown += '### Creating Custom Interactions\n\n';
  markdown += 'To create a custom interaction plugin:\n\n';
  markdown += '```typescript\n';
  markdown += 'import { interactionRegistry } from \'@/lib/game/interactions/types\';\n\n';
  markdown += 'interactionRegistry.register({\n';
  markdown += '  id: \'my-custom-interaction\',\n';
  markdown += '  name: \'My Custom Interaction\',\n';
  markdown += '  description: \'Does something interesting\',\n';
  markdown += '  icon: \'✨\',\n';
  markdown += '  defaultConfig: { enabled: true },\n';
  markdown += '  configFields: [\n';
  markdown += '    {\n';
  markdown += '      key: \'enabled\',\n';
  markdown += '      label: \'Enabled\',\n';
  markdown += '      type: \'boolean\',\n';
  markdown += '      description: \'Enable this interaction\'\n';
  markdown += '    }\n';
  markdown += '  ],\n';
  markdown += '  execute: async (config, context) => {\n';
  markdown += '    // Your interaction logic here\n';
  markdown += '    return { success: true, message: \'Interaction completed!\' };\n';
  markdown += '  }\n';
  markdown += '});\n';
  markdown += '```\n\n';

  markdown += '---\n\n';
  markdown += '*For runtime documentation of registered interactions, use the developer console:*\n';
  markdown += '```javascript\n';
  markdown += 'import { interactionRegistry } from \'@/lib/game/interactions/types\';\n';
  markdown += 'console.log(interactionRegistry.getAll());\n';
  markdown += '```\n';

  return markdown;
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Starting documentation generation pipeline...\n');

  // Ensure output directory exists
  mkdirSync(DOCS_DIR, { recursive: true });
  console.log(`✅ Created output directory: ${DOCS_DIR}\n`);

  // Register all built-in items
  console.log('📦 Registering built-in components...');
  registerBuiltinHelpers(sessionHelperRegistry);
  registerBuiltinNodeTypes(nodeTypeRegistry);
  console.log('✅ Built-in components registered\n');

  // Generate SESSION_HELPERS.md
  console.log('📝 Generating SESSION_HELPERS.md...');
  const helpersDoc = generateHelperDocs();
  const helpersPath = resolve(DOCS_DIR, 'SESSION_HELPERS.md');
  writeFileSync(helpersPath, helpersDoc, 'utf-8');
  console.log(`✅ Generated: ${helpersPath}\n`);

  // Generate NODE_TYPES.md
  console.log('📝 Generating NODE_TYPES.md...');
  const nodeTypesDoc = generateNodeTypeDocs();
  const nodeTypesPath = resolve(DOCS_DIR, 'NODE_TYPES.md');
  writeFileSync(nodeTypesPath, nodeTypesDoc, 'utf-8');
  console.log(`✅ Generated: ${nodeTypesPath}\n`);

  // Generate INTERACTIONS.md
  console.log('📝 Generating INTERACTIONS.md...');
  const interactionsDoc = generateInteractionDocs();
  const interactionsPath = resolve(DOCS_DIR, 'INTERACTIONS.md');
  writeFileSync(interactionsPath, interactionsDoc, 'utf-8');
  console.log(`✅ Generated: ${interactionsPath}\n`);

  console.log('✨ Documentation generation complete!\n');
  console.log('Generated files:');
  console.log(`  - ${helpersPath}`);
  console.log(`  - ${nodeTypesPath}`);
  console.log(`  - ${interactionsPath}`);
}

main().catch((error) => {
  console.error('❌ Error generating documentation:', error);
  process.exit(1);
});

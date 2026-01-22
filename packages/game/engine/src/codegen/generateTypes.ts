#!/usr/bin/env node

/**
 * Plugin Type Generation System
 *
 * Scans registered plugins at build time and generates:
 * - TypeScript type definitions for autocomplete
 * - Runtime validation schemas
 * - Extended SessionHelpers interface
 *
 * Usage:
 *   npx ts-node packages/game/engine/src/codegen/generateTypes.ts
 *   npm run codegen:types
 */

import * as fs from 'fs';
import * as path from 'path';

// ===== Type Definitions =====

interface PluginMetadata {
  id: string;
  name: string;
  type: 'interaction' | 'node' | 'renderer' | 'helper';
  configInterface?: string;
  helperClass?: string;
  sourceFile: string;
}

interface GeneratedOutput {
  typeDefs: string;
  helperExtensions: string;
  validationSchemas: string;
}

// ===== Plugin Discovery =====

/**
 * Scan directories for plugin files
 */
function discoverPlugins(searchPaths: string[]): PluginMetadata[] {
  const plugins: PluginMetadata[] = [];

  for (const searchPath of searchPaths) {
    if (!fs.existsSync(searchPath)) {
      console.warn(`Search path does not exist: ${searchPath}`);
      continue;
    }

    scanDirectory(searchPath, plugins);
  }

  return plugins;
}

/**
 * Recursively scan directory for plugin files
 */
function scanDirectory(dir: string, plugins: PluginMetadata[]): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip node_modules and hidden directories
      if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
        scanDirectory(fullPath, plugins);
      }
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      analyzeFile(fullPath, plugins);
    }
  }
}

/**
 * Analyze a file for plugin exports
 */
function analyzeFile(filePath: string, plugins: PluginMetadata[]): void {
  const content = fs.readFileSync(filePath, 'utf8');

  // Look for plugin patterns
  const patterns = [
    // Interaction plugins
    {
      regex: /export\s+const\s+(\w+Plugin)\s*:\s*InteractionPlugin<(\w+)>/g,
      type: 'interaction' as const,
      extract: (match: RegExpMatchArray) => ({
        id: extractPluginId(content, match[1]),
        name: match[1],
        configInterface: match[2],
      }),
    },
    // Node type plugins
    {
      regex: /export\s+const\s+(\w+NodeType)\s*:\s*NodeTypeDefinition/g,
      type: 'node' as const,
      extract: (match: RegExpMatchArray) => ({
        id: extractPluginId(content, match[1]),
        name: match[1],
      }),
    },
    // Renderer plugins
    {
      regex: /export\s+const\s+(\w+Renderer)\s*:\s*NodeRenderer/g,
      type: 'renderer' as const,
      extract: (match: RegExpMatchArray) => ({
        id: extractPluginId(content, match[1]),
        name: match[1],
      }),
    },
    // Helper plugins
    {
      regex: /export\s+class\s+(\w+Helper)/g,
      type: 'helper' as const,
      extract: (match: RegExpMatchArray) => ({
        id: toKebabCase(match[1].replace(/Helper$/, '')),
        name: match[1],
        helperClass: match[1],
      }),
    },
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.regex.exec(content)) !== null) {
      const extracted = pattern.extract(match);
      plugins.push({
        ...extracted,
        type: pattern.type,
        sourceFile: filePath,
      });
    }
  }
}

/**
 * Extract plugin ID from source code
 */
function extractPluginId(content: string, varName: string): string {
  // Look for id: 'something' in the plugin definition
  const idPattern = new RegExp(`${varName}[^}]*?id:\\s*['"]([^'"]+)['"]`, 's');
  const match = content.match(idPattern);
  return match ? match[1] : toKebabCase(varName);
}

/**
 * Convert string to kebab-case
 */
function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
}

// ===== Code Generation =====

/**
 * Generate TypeScript type definitions
 */
function generateTypeDefs(plugins: PluginMetadata[]): string {
  const imports = new Set<string>();
  const typeExports: string[] = [];

  // Group by type
  const byType = {
    interaction: plugins.filter(p => p.type === 'interaction'),
    node: plugins.filter(p => p.type === 'node'),
    renderer: plugins.filter(p => p.type === 'renderer'),
    helper: plugins.filter(p => p.type === 'helper'),
  };

  // Generate interaction types
  if (byType.interaction.length > 0) {
    imports.add("import type { InteractionPlugin } from '@pixsim7/shared.types';");

    const interactionIds = byType.interaction.map(p => `'${p.id}'`).join(' | ');
    typeExports.push(`export type RegisteredInteractionId = ${interactionIds};`);

    typeExports.push(`
export interface RegisteredInteractions {
${byType.interaction.map(p => `  '${p.id}': InteractionPlugin<any>;`).join('\n')}
}`);
  }

  // Generate node types
  if (byType.node.length > 0) {
    imports.add("import type { NodeTypeDefinition } from '@pixsim7/shared.types';");

    const nodeIds = byType.node.map(p => `'${p.id}'`).join(' | ');
    typeExports.push(`export type RegisteredNodeTypeId = ${nodeIds};`);

    typeExports.push(`
export interface RegisteredNodeTypes {
${byType.node.map(p => `  '${p.id}': NodeTypeDefinition;`).join('\n')}
}`);
  }

  // Generate renderer types
  if (byType.renderer.length > 0) {
    imports.add("import type { NodeRenderer } from '@/lib/graph/nodeRendererRegistry';");

    const rendererIds = byType.renderer.map(p => `'${p.id}'`).join(' | ');
    typeExports.push(`export type RegisteredRendererId = ${rendererIds};`);
  }

  // Generate helper types
  if (byType.helper.length > 0) {
    const helperNames = byType.helper.map(p => p.helperClass || p.name).join(', ');
    typeExports.push(`// Helper classes: ${helperNames}`);
  }

  return `/**
 * Auto-generated plugin type definitions
 * DO NOT EDIT MANUALLY
 *
 * Generated on: ${new Date().toISOString()}
 * Total plugins: ${plugins.length}
 */

${Array.from(imports).join('\n')}

${typeExports.join('\n\n')}

/**
 * Lookup type for getting plugin by ID
 */
export type GetPluginType<T extends string> =
  T extends RegisteredInteractionId ? RegisteredInteractions[T] :
  T extends RegisteredNodeTypeId ? RegisteredNodeTypes[T] :
  never;
`;
}

/**
 * Generate SessionHelpers interface extensions
 */
function generateHelperExtensions(plugins: PluginMetadata[]): string {
  const helpers = plugins.filter(p => p.type === 'helper');

  if (helpers.length === 0) {
    return '// No helper plugins found';
  }

  const imports = helpers.map(h =>
    `import { ${h.helperClass} } from '${getRelativeImportPath(h.sourceFile)}';`
  ).join('\n');

  const extensions = helpers.map(h => {
    const methodName = toCamelCase(h.id);
    return `  ${methodName}: typeof ${h.helperClass};`;
  }).join('\n');

  return `/**
 * Auto-generated SessionHelpers extensions
 * DO NOT EDIT MANUALLY
 *
 * Generated on: ${new Date().toISOString()}
 */

${imports}

/**
 * Extended SessionHelpers interface with custom helper plugins
 */
declare module '@pixsim7/types' {
  interface SessionHelpers {
${extensions}
  }
}

export {};
`;
}

/**
 * Generate runtime validation schemas
 */
function generateValidationSchemas(plugins: PluginMetadata[]): string {
  const schemas: string[] = [];

  // Generate schema for each plugin type
  for (const plugin of plugins) {
    if (plugin.type === 'interaction' && plugin.configInterface) {
      schemas.push(`
/**
 * Runtime validation for ${plugin.name}
 */
export function validate${plugin.configInterface}(config: any): config is ${plugin.configInterface} {
  if (typeof config !== 'object' || config === null) {
    return false;
  }

  // Check required fields
  if (typeof config.enabled !== 'boolean') {
    return false;
  }

  // Add custom validation here
  return true;
}`);
    }
  }

  return `/**
 * Auto-generated runtime validation schemas
 * DO NOT EDIT MANUALLY
 *
 * Generated on: ${new Date().toISOString()}
 */

${schemas.join('\n')}

/**
 * Validate any plugin config
 */
export function validatePluginConfig(pluginId: string, config: any): boolean {
  // Add plugin-specific validation here
  return typeof config === 'object' && config !== null;
}
`;
}

/**
 * Get relative import path
 */
function getRelativeImportPath(filePath: string): string {
  // Simplify: just return a placeholder
  // In a real implementation, calculate relative path
  return filePath.replace(/\.(ts|tsx)$/, '');
}

/**
 * Convert to camelCase
 */
function toCamelCase(str: string): string {
  return str
    .split(/[-_]/)
    .map((word, i) => i === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

// ===== Main Function =====

/**
 * Main code generation function
 */
export async function generatePluginTypes(config?: {
  searchPaths?: string[];
  outputDir?: string;
}): Promise<void> {
  console.log('🔧 Generating plugin types...\n');

  const searchPaths = config?.searchPaths || [
    'packages/game/engine/src',
    'frontend/src',
    'plugins',
  ];

  const outputDir = config?.outputDir || 'packages/types/src/generated';

  // Discover plugins
  console.log('📂 Scanning for plugins...');
  const plugins = discoverPlugins(searchPaths);
  console.log(`   Found ${plugins.length} plugins:\n`);

  const byType = plugins.reduce((acc, p) => {
    acc[p.type] = (acc[p.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  for (const [type, count] of Object.entries(byType)) {
    console.log(`   - ${type}: ${count}`);
  }

  // Generate code
  console.log('\n📝 Generating type definitions...');
  const typeDefs = generateTypeDefs(plugins);

  console.log('📝 Generating SessionHelpers extensions...');
  const helperExtensions = generateHelperExtensions(plugins);

  console.log('📝 Generating runtime validation...');
  const validationSchemas = generateValidationSchemas(plugins);

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write files
  const files = [
    { name: 'plugin-types.d.ts', content: typeDefs },
    { name: 'helper-extensions.d.ts', content: helperExtensions },
    { name: 'validation-schemas.ts', content: validationSchemas },
  ];

  console.log('\n💾 Writing files...');
  for (const file of files) {
    const filePath = path.join(outputDir, file.name);
    fs.writeFileSync(filePath, file.content);
    console.log(`   ✓ ${filePath}`);
  }

  console.log('\n✨ Type generation complete!\n');
  console.log('💡 Tips:');
  console.log('   - Import generated types from @pixsim7/types/generated');
  console.log('   - Restart your IDE to see autocomplete updates');
  console.log('   - Re-run this script after adding new plugins\n');
}

// ===== CLI Entry Point =====

if (require.main === module) {
  generatePluginTypes().catch(error => {
    console.error('❌ Error generating types:', error);
    process.exit(1);
  });
}

#!/usr/bin/env tsx
/**
 * Generates APP_MAP.md and action registry from code metadata.
 *
 * Sources (in priority order):
 *   1. Code parsing: module page.appMap (docs, backend, frontend, notes)
 *   2. Code parsing: routes, capabilities, module pages, actions
 *   3. DEPRECATED: docs/app_map.sources.json (fallback only)
 *
 * Outputs:
 *   - docs/APP_MAP.md (table updated between markers)
 *   - docs/app_map.generated.json (intermediate, for debugging)
 *   - docs/architecture/action-registry.md
 *
 * Usage:
 *   pnpm docs:app-map        # Generate all outputs
 *   pnpm docs:app-map:check  # Verify outputs are current (CI)
 *
 * Migration: Move metadata from app_map.sources.json into module.ts page.appMap
 */

import fs from 'fs';
import path from 'path';
import * as ts from 'typescript';

// =============================================================================
// Configuration
// =============================================================================

const CHECK_MODE = process.argv.includes('--check');

const PROJECT_ROOT = process.cwd();
const ROUTES_FILE = path.join(
  PROJECT_ROOT,
  'apps/main/src/lib/capabilities/routeConstants.ts'
);
const CAPABILITIES_FILE = path.join(
  PROJECT_ROOT,
  'apps/main/src/lib/capabilities/registerCoreFeatures.ts'
);
const MODULE_PAGES_FILE = path.join(
  PROJECT_ROOT,
  'apps/main/src/app/modules/pages.ts'
);
const FEATURES_DIR = path.join(PROJECT_ROOT, 'apps/main/src/features');

// Input files
const MANUAL_REGISTRY_FILE = path.join(PROJECT_ROOT, 'docs/app_map.sources.json');

// Output files
const GENERATED_JSON_FILE = path.join(PROJECT_ROOT, 'docs/app_map.generated.json');
const APP_MAP_FILE = path.join(PROJECT_ROOT, 'docs/APP_MAP.md');
const ACTIONS_DOC_FILE = path.join(PROJECT_ROOT, 'docs/architecture/action-registry.md');

// =============================================================================
// Types
// =============================================================================

type AppMapEntry = {
  id: string;
  label?: string;
  routes?: string[];
  frontend?: string[];
  docs?: string[];
  backend?: string[];
  sources?: string[];
};

type ManualRegistryEntry = {
  id: string;
  label?: string;
  docs?: string[];
  frontend?: string[];
  backend?: string[];
  routes?: string[];
};

type ManualRegistry = {
  version: string;
  entries: ManualRegistryEntry[];
};

type ActionDocEntry = {
  id: string;
  title: string;
  featureId?: string;
  description?: string;
  icon?: string;
  shortcut?: string;
  route?: string;
  visibility?: string;
  contexts?: string[];
  category?: string;
  tags?: string[];
  sources?: string[];
};

// =============================================================================
// TypeScript Parsing Helpers
// =============================================================================

function readSource(filePath: string): ts.SourceFile {
  const text = fs.readFileSync(filePath, 'utf8');
  return ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function getPropNameText(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name)) return name.text;
  if (ts.isStringLiteral(name)) return name.text;
  return null;
}

function getObjectProp(
  obj: ts.ObjectLiteralExpression,
  propName: string
): ts.Expression | undefined {
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const name = getPropNameText(prop.name);
    if (name === propName) {
      return prop.initializer;
    }
  }
  return undefined;
}

function resolveString(
  expr: ts.Expression | undefined,
  routesMap?: Record<string, string>
): string | null {
  if (!expr) return null;
  if (ts.isStringLiteral(expr)) return expr.text;
  if (ts.isNoSubstitutionTemplateLiteral(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) {
    if (ts.isIdentifier(expr.expression) && expr.expression.text === 'ROUTES') {
      const key = expr.name.text;
      return routesMap?.[key] ?? null;
    }
  }
  return null;
}

function resolveStringArray(
  expr: ts.Expression | undefined,
  routesMap?: Record<string, string>
): string[] | null {
  if (!expr || !ts.isArrayLiteralExpression(expr)) return null;
  const values: string[] = [];

  for (const el of expr.elements) {
    if (!ts.isExpression(el)) continue;
    const value = resolveString(el, routesMap);
    if (value) values.push(value);
  }

  return values.length > 0 ? values : null;
}

function resolveBoolean(expr: ts.Expression | undefined): boolean | null {
  if (!expr) return null;
  if (expr.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (expr.kind === ts.SyntaxKind.FalseKeyword) return false;
  return null;
}

// =============================================================================
// List Merging
// =============================================================================

function mergeList<T>(left: T[] | undefined, right: T[] | undefined): T[] {
  const result: T[] = [];
  const seen = new Set<string>();

  const add = (items: T[] | undefined) => {
    if (!items) return;
    for (const item of items) {
      const key = String(item);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(item);
    }
  };

  add(left);
  add(right);
  return result;
}

// =============================================================================
// Code Parsing
// =============================================================================

function parseRoutesMap(filePath: string): Record<string, string> {
  const source = readSource(filePath);
  const routes: Record<string, string> = {};

  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      if (node.name.text === 'ROUTES' && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
        for (const prop of node.initializer.properties) {
          if (!ts.isPropertyAssignment(prop)) continue;
          const key = getPropNameText(prop.name);
          const value = resolveString(prop.initializer);
          if (key && value) {
            routes[key] = value;
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
  return routes;
}

function parseCapabilities(
  filePath: string,
  routesMap: Record<string, string>
): Map<string, AppMapEntry> {
  const source = readSource(filePath);
  const entries = new Map<string, AppMapEntry>();

  const addEntry = (entry: AppMapEntry) => {
    const existing = entries.get(entry.id) ?? { id: entry.id };
    entries.set(entry.id, {
      ...existing,
      label: existing.label ?? entry.label,
      routes: mergeList(existing.routes, entry.routes),
      frontend: mergeList(existing.frontend, entry.frontend),
      sources: mergeList(existing.sources, entry.sources),
    });
  };

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      if (node.expression.text === 'registerCompleteFeature') {
        const arg = node.arguments[0];
        if (arg && ts.isObjectLiteralExpression(arg)) {
          const featureExpr = getObjectProp(arg, 'feature');
          if (featureExpr && ts.isObjectLiteralExpression(featureExpr)) {
            const id = resolveString(getObjectProp(featureExpr, 'id'));
            const name = resolveString(getObjectProp(featureExpr, 'name'));

            if (id) {
              const routesExpr = getObjectProp(arg, 'routes');
              const routes: string[] = [];
              if (routesExpr && ts.isArrayLiteralExpression(routesExpr)) {
                for (const el of routesExpr.elements) {
                  if (!ts.isObjectLiteralExpression(el)) continue;
                  const routePath = resolveString(getObjectProp(el, 'path'), routesMap);
                  if (routePath) routes.push(routePath);
                }
              }

              addEntry({
                id,
                label: name ?? id,
                routes,
                sources: ['capabilities'],
              });
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
  return entries;
}

function parseModuleFile(
  filePath: string,
  routesMap: Record<string, string>
): { entries: AppMapEntry[]; actions: ActionDocEntry[] } {
  const source = readSource(filePath);
  const entries: AppMapEntry[] = [];
  const actions: ActionDocEntry[] = [];

  const frontendPath = (() => {
    const normalized = filePath.replace(/\\/g, '/');
    const match = normalized.match(/apps\/main\/src\/features\/([^/]+)\//);
    if (match) {
      return [`apps/main/src/features/${match[1]}/`];
    }
    return undefined;
  })();

  const sourcePath = path.relative(PROJECT_ROOT, filePath).replace(/\\/g, '/');
  const actionDefinitions = new Map<string, ts.ObjectLiteralExpression>();

  const collectActions = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      if (node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
        const obj = node.initializer;
        const id = resolveString(getObjectProp(obj, 'id'), routesMap);
        const featureId = resolveString(getObjectProp(obj, 'featureId'), routesMap);
        const title = resolveString(getObjectProp(obj, 'title'), routesMap);
        if (id && featureId && title) {
          actionDefinitions.set(node.name.text, obj);
        }
      }
    }
    ts.forEachChild(node, collectActions);
  };

  collectActions(source);

  const parseActionObject = (obj: ts.ObjectLiteralExpression): ActionDocEntry | null => {
    const id = resolveString(getObjectProp(obj, 'id'), routesMap);
    if (!id) return null;

    const title = resolveString(getObjectProp(obj, 'title'), routesMap) ?? id;
    const featureId = resolveString(getObjectProp(obj, 'featureId'), routesMap) ?? undefined;
    const description = resolveString(getObjectProp(obj, 'description'), routesMap) ?? undefined;
    const icon = resolveString(getObjectProp(obj, 'icon'), routesMap) ?? undefined;
    const shortcut = resolveString(getObjectProp(obj, 'shortcut'), routesMap) ?? undefined;
    const route = resolveString(getObjectProp(obj, 'route'), routesMap) ?? undefined;
    const visibility = resolveString(getObjectProp(obj, 'visibility'), routesMap) ?? undefined;
    const contexts = resolveStringArray(getObjectProp(obj, 'contexts'), routesMap) ?? undefined;
    const category = resolveString(getObjectProp(obj, 'category'), routesMap) ?? undefined;
    const tags = resolveStringArray(getObjectProp(obj, 'tags'), routesMap) ?? undefined;

    return {
      id,
      title,
      featureId,
      description,
      icon,
      shortcut,
      route,
      visibility,
      contexts,
      category,
      tags,
      sources: [sourcePath],
    };
  };

  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
      const obj = node.initializer;
      const id = resolveString(getObjectProp(obj, 'id'));
      const name = resolveString(getObjectProp(obj, 'name'));
      const pageExpr = getObjectProp(obj, 'page');

      if (id && pageExpr && ts.isObjectLiteralExpression(pageExpr)) {
        const route = resolveString(getObjectProp(pageExpr, 'route'), routesMap);
        const hidden = resolveBoolean(getObjectProp(pageExpr, 'hidden'));
        const featureId = resolveString(getObjectProp(pageExpr, 'featureId'), routesMap);

        // Extract appMap metadata from page definition
        const appMapExpr = getObjectProp(pageExpr, 'appMap');
        let appMapDocs: string[] | undefined;
        let appMapBackend: string[] | undefined;
        let appMapFrontend: string[] | undefined;
        let appMapNotes: string[] | undefined;

        if (appMapExpr && ts.isObjectLiteralExpression(appMapExpr)) {
          appMapDocs = resolveStringArray(getObjectProp(appMapExpr, 'docs')) ?? undefined;
          appMapBackend = resolveStringArray(getObjectProp(appMapExpr, 'backend')) ?? undefined;
          appMapFrontend = resolveStringArray(getObjectProp(appMapExpr, 'frontend')) ?? undefined;
          appMapNotes = resolveStringArray(getObjectProp(appMapExpr, 'notes')) ?? undefined;
        }

        // Use featureId as the entry id if available (for grouping)
        const entryId = featureId ?? id;

        if (route && hidden !== true) {
          entries.push({
            id: entryId,
            label: name ?? entryId,
            routes: [route],
            frontend: mergeList(frontendPath, appMapFrontend),
            docs: appMapDocs,
            backend: appMapBackend,
            sources: appMapDocs || appMapBackend ? ['modules:appMap'] : ['modules'],
          });
        } else if (appMapDocs || appMapBackend) {
          // Entry has appMap but no visible route - still include it
          entries.push({
            id: entryId,
            label: name ?? entryId,
            routes: route ? [route] : undefined,
            frontend: mergeList(frontendPath, appMapFrontend),
            docs: appMapDocs,
            backend: appMapBackend,
            sources: ['modules:appMap'],
          });
        }

        const actionsExpr = getObjectProp(pageExpr, 'actions');
        if (actionsExpr && ts.isArrayLiteralExpression(actionsExpr)) {
          for (const el of actionsExpr.elements) {
            if (ts.isObjectLiteralExpression(el)) {
              const action = parseActionObject(el);
              if (action) actions.push(action);
            } else if (ts.isIdentifier(el)) {
              const actionObj = actionDefinitions.get(el.text);
              if (actionObj) {
                const action = parseActionObject(actionObj);
                if (action) actions.push(action);
              }
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
  return { entries, actions };
}

function getFeatureModuleFiles(): string[] {
  if (!fs.existsSync(FEATURES_DIR)) return [];
  const files: string[] = [];

  const walk = (dir: string) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!fullPath.endsWith('.ts')) continue;
      files.push(fullPath);
    }
  };

  walk(FEATURES_DIR);

  return files;
}

function mergeCodeEntries(
  base: Map<string, AppMapEntry>,
  incoming: AppMapEntry[]
): Map<string, AppMapEntry> {
  const merged = new Map(base);

  for (const entry of incoming) {
    const existing = merged.get(entry.id);
    if (!existing) {
      merged.set(entry.id, entry);
      continue;
    }

    merged.set(entry.id, {
      ...existing,
      label: existing.label ?? entry.label,
      routes: mergeList(existing.routes, entry.routes),
      frontend: mergeList(existing.frontend, entry.frontend),
      sources: mergeList(existing.sources, entry.sources),
    });
  }

  return merged;
}

function mergeActionEntries(
  base: Map<string, ActionDocEntry>,
  incoming: ActionDocEntry[]
): Map<string, ActionDocEntry> {
  const merged = new Map(base);

  for (const entry of incoming) {
    const existing = merged.get(entry.id);
    if (!existing) {
      merged.set(entry.id, entry);
      continue;
    }

    merged.set(entry.id, {
      ...existing,
      title: existing.title ?? entry.title,
      featureId: existing.featureId ?? entry.featureId,
      description: existing.description ?? entry.description,
      icon: existing.icon ?? entry.icon,
      shortcut: existing.shortcut ?? entry.shortcut,
      route: existing.route ?? entry.route,
      visibility: existing.visibility ?? entry.visibility,
      contexts: mergeList(existing.contexts, entry.contexts),
      category: existing.category ?? entry.category,
      tags: mergeList(existing.tags, entry.tags),
      sources: mergeList(existing.sources, entry.sources),
    });
  }

  return merged;
}

// =============================================================================
// Manual Registry Loading & Merging
// =============================================================================

function loadManualRegistry(): ManualRegistry | null {
  if (!fs.existsSync(MANUAL_REGISTRY_FILE)) {
    return null;
  }
  const content = fs.readFileSync(MANUAL_REGISTRY_FILE, 'utf8');
  return JSON.parse(content) as ManualRegistry;
}

function mergeWithManualRegistry(
  generatedEntries: AppMapEntry[],
  manualEntries: ManualRegistryEntry[]
): { merged: AppMapEntry[]; deprecationWarnings: string[] } {
  const generatedById = new Map(generatedEntries.map(e => [e.id, e]));
  const usedGenerated = new Set<string>();
  const merged: AppMapEntry[] = [];
  const deprecationWarnings: string[] = [];

  // Process manual entries - but prefer module-derived appMap data
  for (const manual of manualEntries) {
    const generated = generatedById.get(manual.id);
    if (generated) {
      // Check if module already has appMap data (sources includes 'modules:appMap')
      const hasModuleAppMap = generated.sources?.includes('modules:appMap');

      if (hasModuleAppMap) {
        // Module has appMap - use it as primary, warn about manual registry
        if (manual.docs?.length || manual.backend?.length) {
          deprecationWarnings.push(
            `  "${manual.id}": has appMap in module.ts - remove from app_map.sources.json`
          );
        }
        // Use module-derived data as primary
        merged.push({
          id: manual.id,
          label: generated.label ?? manual.label,
          docs: generated.docs ?? manual.docs ?? [],
          backend: generated.backend ?? manual.backend ?? [],
          routes: mergeList(generated.routes, manual.routes),
          frontend: mergeList(generated.frontend, manual.frontend),
          sources: generated.sources,
        });
      } else {
        // No module appMap - use manual registry (legacy behavior)
        merged.push({
          id: manual.id,
          label: manual.label ?? generated.label,
          docs: manual.docs ?? [],
          backend: manual.backend ?? [],
          routes: mergeList(generated.routes, manual.routes),
          frontend: mergeList(generated.frontend, manual.frontend),
          sources: generated.sources,
        });
      }
      usedGenerated.add(manual.id);
    } else {
      // Manual-only entry - warn that it should be added to a module
      if (manual.docs?.length || manual.backend?.length) {
        deprecationWarnings.push(
          `  "${manual.id}": not found in modules - consider adding module.ts with page.appMap`
        );
      }
      merged.push({
        id: manual.id,
        label: manual.label,
        docs: manual.docs ?? [],
        backend: manual.backend ?? [],
        routes: manual.routes ?? [],
        frontend: manual.frontend ?? [],
        sources: ['manual-only'],
      });
    }
  }

  // Add generated-only entries (not in manual registry)
  for (const generated of generatedEntries) {
    if (!usedGenerated.has(generated.id)) {
      merged.push(generated);
    }
  }

  return { merged, deprecationWarnings };
}

// =============================================================================
// Markdown Formatting (ported from Python)
// =============================================================================

function formatDocs(docs: string[] | undefined): string {
  if (!docs || docs.length === 0) return '-';
  return docs.map(doc => {
    const name = path.basename(doc);
    return `\`${name}\``;
  }).join(', ');
}

function formatFrontend(paths: string[] | undefined): string {
  if (!paths || paths.length === 0) return '-';
  return paths.map(p => {
    // Simplify common prefixes
    let compact = p;
    if (p.startsWith('apps/main/src/')) {
      compact = p.replace('apps/main/src/', '');
    }
    return `\`${compact}\``;
  }).join(', ');
}

function formatBackend(modules: string[] | undefined): string {
  if (!modules || modules.length === 0) return '-';
  return modules.map(mod => {
    // Simplify pixsim7.backend.main prefix
    let compact = mod;
    if (mod.startsWith('pixsim7.backend.main.')) {
      compact = mod.replace('pixsim7.backend.main.', '');
    }
    return `\`${compact}\``;
  }).join(', ');
}

function formatRoutes(routes: string[] | undefined): string {
  if (!routes || routes.length === 0) return '-';
  return routes.map(r => `\`${r}\``).join(', ');
}

function generateMarkdownTable(entries: AppMapEntry[]): string {
  const lines = [
    '| Feature | Routes | Docs | Frontend | Backend |',
    '|---------|--------|------|----------|---------|',
  ];

  for (const entry of entries) {
    const label = entry.label ?? entry.id;
    const routes = formatRoutes(entry.routes);
    const docs = formatDocs(entry.docs);
    const frontend = formatFrontend(entry.frontend);
    const backend = formatBackend(entry.backend);

    lines.push(`| ${label} | ${routes} | ${docs} | ${frontend} | ${backend} |`);
  }

  return lines.join('\n');
}

function updateAppMapMarkdown(table: string): string {
  const content = fs.readFileSync(APP_MAP_FILE, 'utf8');

  // Check markers exist
  if (!content.includes('<!-- APP_MAP:START -->')) {
    throw new Error('APP_MAP:START marker not found in APP_MAP.md');
  }
  if (!content.includes('<!-- APP_MAP:END -->')) {
    throw new Error('APP_MAP:END marker not found in APP_MAP.md');
  }

  // Replace content between markers
  const pattern = /(<!-- APP_MAP:START -->)\n[\s\S]*?\n(<!-- APP_MAP:END -->)/;
  const replacement = `$1\n${table}\n$2`;

  return content.replace(pattern, replacement);
}

// =============================================================================
// Action Registry Formatting
// =============================================================================

function escapeMarkdown(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function formatActionRegistry(actions: ActionDocEntry[]): string {
  const lines = [
    '# Action Registry',
    '',
    'Generated from module page actions by `scripts/generate-app-map.ts`.',
    'Includes actions defined inline or as consts in the same module file.',
    '',
    '| Action ID | Title | Feature | Route | Shortcut | Icon | Visibility | Contexts | Category | Tags | Description | Sources |',
    '|-----------|-------|---------|-------|----------|------|------------|----------|----------|------|-------------|---------|',
  ];

  for (const action of actions) {
    const id = escapeMarkdown(action.id);
    const title = escapeMarkdown(action.title);
    const featureId = action.featureId ? escapeMarkdown(action.featureId) : '-';
    const route = action.route ? `\`${escapeMarkdown(action.route)}\`` : '-';
    const shortcut = action.shortcut ? `\`${escapeMarkdown(action.shortcut)}\`` : '-';
    const icon = action.icon ? escapeMarkdown(action.icon) : '-';
    const visibility = action.visibility ? escapeMarkdown(action.visibility) : '-';
    const contexts = action.contexts && action.contexts.length > 0
      ? action.contexts.map(ctx => `\`${escapeMarkdown(ctx)}\``).join(', ')
      : '-';
    const category = action.category ? escapeMarkdown(action.category) : '-';
    const tags = action.tags && action.tags.length > 0
      ? action.tags.map(tag => `\`${escapeMarkdown(tag)}\``).join(', ')
      : '-';
    const description = action.description ? escapeMarkdown(action.description) : '-';
    const sources = action.sources && action.sources.length > 0
      ? action.sources.map(src => `\`${escapeMarkdown(src)}\``).join(', ')
      : '-';

    lines.push(
      `| ${id} | ${title} | ${featureId} | ${route} | ${shortcut} | ${icon} | ${visibility} | ${contexts} | ${category} | ${tags} | ${description} | ${sources} |`
    );
  }

  return lines.join('\n') + '\n';
}

// =============================================================================
// Main Generation Logic
// =============================================================================

function generateAppMap(): {
  generatedJson: string;
  appMapMd: string;
  actionRegistryMd: string;
  entriesCount: number;
  actionsCount: number;
  deprecationWarnings: string[];
} {
  // 1. Parse code for routes, capabilities, modules
  const routesMap = parseRoutesMap(ROUTES_FILE);
  const capabilityEntries = parseCapabilities(CAPABILITIES_FILE, routesMap);

  const moduleEntries: AppMapEntry[] = [];
  const actionEntries: ActionDocEntry[] = [];
  if (fs.existsSync(MODULE_PAGES_FILE)) {
    const parsed = parseModuleFile(MODULE_PAGES_FILE, routesMap);
    moduleEntries.push(...parsed.entries);
    actionEntries.push(...parsed.actions);
  }

  for (const moduleFile of getFeatureModuleFiles()) {
    const parsed = parseModuleFile(moduleFile, routesMap);
    moduleEntries.push(...parsed.entries);
    actionEntries.push(...parsed.actions);
  }

  // 2. Merge code-derived entries
  const mergedCodeEntries = mergeCodeEntries(capabilityEntries, moduleEntries);
  const codeEntries = Array.from(mergedCodeEntries.values()).sort((a, b) => a.id.localeCompare(b.id));

  // 3. Generate JSON output (for debugging/intermediate use)
  const generatedJson = JSON.stringify({
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    entries: codeEntries,
  }, null, 2) + '\n';

  // 4. Load and merge with manual registry (deprecated - will be removed)
  const manualRegistry = loadManualRegistry();
  let finalEntries: AppMapEntry[];
  let deprecationWarnings: string[] = [];
  if (manualRegistry) {
    const result = mergeWithManualRegistry(codeEntries, manualRegistry.entries);
    finalEntries = result.merged;
    deprecationWarnings = result.deprecationWarnings;
  } else {
    finalEntries = codeEntries;
  }

  // 5. Generate markdown table and update APP_MAP.md
  const table = generateMarkdownTable(finalEntries);
  const appMapMd = updateAppMapMarkdown(table);

  // 6. Generate action registry
  const mergedActions = mergeActionEntries(new Map(), actionEntries);
  const actions = Array.from(mergedActions.values()).sort((a, b) => a.id.localeCompare(b.id));
  const actionRegistryMd = formatActionRegistry(actions);

  return {
    generatedJson,
    appMapMd,
    actionRegistryMd,
    entriesCount: finalEntries.length,
    actionsCount: actions.length,
    deprecationWarnings,
  };
}

// =============================================================================
// Check Mode
// =============================================================================

function checkOutputs(outputs: {
  generatedJson: string;
  appMapMd: string;
  actionRegistryMd: string;
}): boolean {
  let allCurrent = true;

  // Check generated JSON
  if (!fs.existsSync(GENERATED_JSON_FILE)) {
    console.error(`✗ Missing: ${path.relative(PROJECT_ROOT, GENERATED_JSON_FILE)}`);
    allCurrent = false;
  } else {
    const existing = fs.readFileSync(GENERATED_JSON_FILE, 'utf8');
    // Compare without generatedAt timestamp
    const normalizeJson = (json: string) => {
      const parsed = JSON.parse(json);
      delete parsed.generatedAt;
      return JSON.stringify(parsed, null, 2);
    };
    if (normalizeJson(existing) !== normalizeJson(outputs.generatedJson)) {
      console.error(`✗ Out of date: ${path.relative(PROJECT_ROOT, GENERATED_JSON_FILE)}`);
      allCurrent = false;
    }
  }

  // Check APP_MAP.md
  if (!fs.existsSync(APP_MAP_FILE)) {
    console.error(`✗ Missing: ${path.relative(PROJECT_ROOT, APP_MAP_FILE)}`);
    allCurrent = false;
  } else {
    const existing = fs.readFileSync(APP_MAP_FILE, 'utf8');
    if (existing !== outputs.appMapMd) {
      console.error(`✗ Out of date: ${path.relative(PROJECT_ROOT, APP_MAP_FILE)}`);
      allCurrent = false;
    }
  }

  // Check action registry
  if (!fs.existsSync(ACTIONS_DOC_FILE)) {
    console.error(`✗ Missing: ${path.relative(PROJECT_ROOT, ACTIONS_DOC_FILE)}`);
    allCurrent = false;
  } else {
    const existing = fs.readFileSync(ACTIONS_DOC_FILE, 'utf8');
    if (existing !== outputs.actionRegistryMd) {
      console.error(`✗ Out of date: ${path.relative(PROJECT_ROOT, ACTIONS_DOC_FILE)}`);
      allCurrent = false;
    }
  }

  return allCurrent;
}

// =============================================================================
// Main Entry Point
// =============================================================================

function main() {
  try {
    const outputs = generateAppMap();

    if (CHECK_MODE) {
      const allCurrent = checkOutputs(outputs);
      if (allCurrent) {
        console.log('✓ All app-map outputs are current');
        process.exit(0);
      } else {
        console.error('\nRun: pnpm docs:app-map');
        process.exit(1);
      }
    }

    // Write outputs
    fs.mkdirSync(path.dirname(GENERATED_JSON_FILE), { recursive: true });
    fs.writeFileSync(GENERATED_JSON_FILE, outputs.generatedJson, 'utf8');

    fs.writeFileSync(APP_MAP_FILE, outputs.appMapMd, 'utf8');

    fs.mkdirSync(path.dirname(ACTIONS_DOC_FILE), { recursive: true });
    fs.writeFileSync(ACTIONS_DOC_FILE, outputs.actionRegistryMd, 'utf8');

    console.log(`✓ Generated: ${path.relative(PROJECT_ROOT, GENERATED_JSON_FILE)}`);
    console.log(`✓ Updated: ${path.relative(PROJECT_ROOT, APP_MAP_FILE)}`);
    console.log(`✓ Generated: ${path.relative(PROJECT_ROOT, ACTIONS_DOC_FILE)}`);
    console.log(`  Entries: ${outputs.entriesCount}`);
    console.log(`  Actions: ${outputs.actionsCount}`);

    // Show deprecation warnings for entries that should be migrated to module.ts
    if (outputs.deprecationWarnings.length > 0) {
      console.log('');
      console.log('⚠ DEPRECATION: app_map.sources.json entries to migrate:');
      for (const warning of outputs.deprecationWarnings) {
        console.log(warning);
      }
      console.log('');
      console.log('  Move metadata to module.ts page.appMap property.');
      console.log('  See: apps/main/src/features/automation/module.ts for example.');
    }
  } catch (error) {
    console.error(`✗ Error: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

main();

/**
 * Generates APP_MAP.md and action registry from code metadata.
 *
 * Sources (in priority order):
 *   1. Code parsing: module JSDoc @appMap.* tags (page.appMap fallback)
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
 * Migration: Move metadata from app_map.sources.json into module JSDoc @appMap.* tags
 */

import fs from 'fs';
import path from 'path';
import * as ts from 'typescript';
import { Project, SyntaxKind, type JSDoc } from 'ts-morph';

// =============================================================================
// Configuration
// =============================================================================

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
  notes?: string[];
  sources?: string[];
};

type ManualRegistryEntry = {
  id: string;
  label?: string;
  docs?: string[];
  frontend?: string[];
  backend?: string[];
  routes?: string[];
  notes?: string[];
};

type ManualRegistry = {
  version: string;
  entries: ManualRegistryEntry[];
};

type JsDocAppMap = {
  docs?: string[];
  backend?: string[];
  frontend?: string[];
  notes?: string[];
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

type PanelRegistryEntry = {
  id: string;
  title: string;
  category: string;
  icon?: string;
  description?: string;
  tags?: string[];
  order?: number;
  internal?: boolean;
  supportsCompactMode?: boolean;
  supportsMultipleInstances?: boolean;
  maxInstances?: number;
  availableIn?: string[];
  orchestrationType?: string;
  defaultZone?: string;
  coreEditorRole?: string;
  source: string;
};

type ModuleRegistryEntry = {
  id: string;
  name: string;
  priority?: number;
  dependsOn?: string[];
  hasInitialize: boolean;
  hasCleanup: boolean;
  hasIsReady: boolean;
  hasPage: boolean;
  route?: string;
  controlCenterPanelCount?: number;
  source: string;
};

type StoreEntry = {
  name: string;
  feature: string;
  source: string;
};

type HookEntry = {
  name: string;
  feature: string;
  source: string;
};

// =============================================================================
// TypeScript Parsing Helpers
// =============================================================================

function readSource(filePath: string): ts.SourceFile {
  const text = fs.readFileSync(filePath, 'utf8');
  const kind = filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, kind);
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

function getDefinitionObjectLiteral(
  initializer: ts.Expression | undefined,
  helperNames: string[]
): ts.ObjectLiteralExpression | undefined {
  if (!initializer) return undefined;
  if (ts.isObjectLiteralExpression(initializer)) return initializer;
  if (!ts.isCallExpression(initializer) || initializer.arguments.length === 0) return undefined;

  const callee = initializer.expression;
  const calleeName = ts.isIdentifier(callee)
    ? callee.text
    : ts.isPropertyAccessExpression(callee)
      ? callee.name.text
      : null;
  if (!calleeName || !helperNames.includes(calleeName)) return undefined;

  const firstArg = initializer.arguments[0];
  if (!ts.isObjectLiteralExpression(firstArg)) return undefined;
  return firstArg;
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

function resolveNumber(expr: ts.Expression | undefined): number | null {
  if (!expr) return null;
  if (ts.isNumericLiteral(expr)) return Number(expr.text);
  if (ts.isPrefixUnaryExpression(expr) && expr.operator === ts.SyntaxKind.MinusToken) {
    if (ts.isNumericLiteral(expr.operand)) return -Number(expr.operand.text);
  }
  return null;
}

// =============================================================================
// JSDoc App Map Parsing
// =============================================================================

function parseTagValues(comment: string | undefined): string[] {
  const text = (comment ?? '').trim();
  if (!text) return [];
  if (text.includes(',')) {
    return text
      .split(',')
      .map(value => value.trim())
      .filter(Boolean);
  }
  return text
    .split(/\s+/)
    .map(value => value.trim())
    .filter(Boolean);
}

function parseNotes(comment: string | undefined): string[] {
  const text = (comment ?? '').trim();
  if (!text) return [];
  if (text.includes('|')) {
    return text
      .split('|')
      .map(value => value.trim())
      .filter(Boolean);
  }
  return [text];
}

function extractAppMapMetaFromJsDocs(jsDocs: JSDoc[]): JsDocAppMap | null {
  let meta: JsDocAppMap = {};

  for (const jsDoc of jsDocs) {
    for (const tag of jsDoc.getTags()) {
      const tagName = tag.getTagName();
      const comment = tag.getComment() ?? '';

      if (tagName === 'appMap.docs') {
        meta = mergeAppMapMeta(meta, { docs: parseTagValues(comment) });
      } else if (tagName === 'appMap.backend') {
        meta = mergeAppMapMeta(meta, { backend: parseTagValues(comment) });
      } else if (tagName === 'appMap.frontend') {
        meta = mergeAppMapMeta(meta, { frontend: parseTagValues(comment) });
      } else if (tagName === 'appMap.notes') {
        meta = mergeAppMapMeta(meta, { notes: parseNotes(comment) });
      }
    }
  }

  return hasAppMapMeta(meta) ? meta : null;
}

function parseJsDocAppMap(filePath: string): Map<string, JsDocAppMap> {
  const map = new Map<string, JsDocAppMap>();
  let sourceFile;

  try {
    const project = new Project({
      useInMemoryFileSystem: false,
      skipAddingFilesFromTsConfig: true,
    });
    sourceFile = project.addSourceFileAtPath(filePath);
  } catch {
    return map;
  }

  for (const declaration of sourceFile.getVariableDeclarations()) {
    const name = declaration.getName();
    if (typeof declaration.getJsDocs !== 'function') continue;
    const jsDocs = declaration.getJsDocs();
    const statement = declaration.getFirstAncestorByKind(SyntaxKind.VariableStatement);
    const statementDocs = (statement && typeof statement.getJsDocs === 'function') ? statement.getJsDocs() : [];
    const docsToRead = jsDocs.length > 0 ? jsDocs : statementDocs;

    if (docsToRead.length === 0) continue;

    const meta = extractAppMapMetaFromJsDocs(docsToRead);
    if (!meta) continue;

    const existing = map.get(name);
    map.set(name, mergeAppMapMeta(existing, meta));
  }

  return map;
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

function hasAppMapMeta(meta?: JsDocAppMap | null): boolean {
  return Boolean(
    meta &&
      ((meta.docs?.length ?? 0) > 0 ||
        (meta.backend?.length ?? 0) > 0 ||
        (meta.frontend?.length ?? 0) > 0 ||
        (meta.notes?.length ?? 0) > 0)
  );
}

function mergeAppMapMeta(left?: JsDocAppMap, right?: JsDocAppMap): JsDocAppMap {
  return {
    docs: mergeList(left?.docs, right?.docs),
    backend: mergeList(left?.backend, right?.backend),
    frontend: mergeList(left?.frontend, right?.frontend),
    notes: mergeList(left?.notes, right?.notes),
  };
}

function normalizeList(values?: string[]): string[] {
  if (!values || values.length === 0) return [];
  return [...values].map(v => v.trim()).filter(Boolean).sort();
}

function listsEqual(a?: string[], b?: string[]): boolean {
  const left = normalizeList(a);
  const right = normalizeList(b);
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
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
): { entries: AppMapEntry[]; actions: ActionDocEntry[]; warnings: string[] } {
  const source = readSource(filePath);
  const entries: AppMapEntry[] = [];
  const actions: ActionDocEntry[] = [];
  const warnings: string[] = [];
  const jsDocAppMap = parseJsDocAppMap(filePath);

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
    if (ts.isVariableDeclaration(node)) {
      const obj = getDefinitionObjectLiteral(node.initializer, ['defineModule']);
      if (!obj) {
        ts.forEachChild(node, visit);
        return;
      }
      const id = resolveString(getObjectProp(obj, 'id'));
      const name = resolveString(getObjectProp(obj, 'name'));
      const pageExpr = getObjectProp(obj, 'page');
      const declarationName = ts.isIdentifier(node.name) ? node.name.text : undefined;

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

        const jsDocMeta = declarationName ? jsDocAppMap.get(declarationName) : undefined;
        const hasJsDoc = hasAppMapMeta(jsDocMeta);
        const hasPageAppMap = Boolean(
          (appMapDocs && appMapDocs.length > 0) ||
            (appMapBackend && appMapBackend.length > 0) ||
            (appMapFrontend && appMapFrontend.length > 0) ||
            (appMapNotes && appMapNotes.length > 0)
        );

        if (hasJsDoc && hasPageAppMap && jsDocMeta) {
          if (appMapDocs && !listsEqual(jsDocMeta.docs, appMapDocs)) {
            warnings.push(
              `  "${featureId ?? id}": @appMap.docs overrides page.appMap.docs in ${sourcePath}`
            );
          }
          if (appMapBackend && !listsEqual(jsDocMeta.backend, appMapBackend)) {
            warnings.push(
              `  "${featureId ?? id}": @appMap.backend overrides page.appMap.backend in ${sourcePath}`
            );
          }
          if (appMapFrontend && !listsEqual(jsDocMeta.frontend, appMapFrontend)) {
            warnings.push(
              `  "${featureId ?? id}": @appMap.frontend overrides page.appMap.frontend in ${sourcePath}`
            );
          }
          if (appMapNotes && !listsEqual(jsDocMeta.notes, appMapNotes)) {
            warnings.push(
              `  "${featureId ?? id}": @appMap.notes overrides page.appMap.notes in ${sourcePath}`
            );
          }
        }

        const finalDocs = jsDocMeta?.docs?.length ? jsDocMeta.docs : appMapDocs;
        const finalBackend = jsDocMeta?.backend?.length ? jsDocMeta.backend : appMapBackend;
        const finalFrontend = jsDocMeta?.frontend?.length ? jsDocMeta.frontend : appMapFrontend;
        const finalNotes = jsDocMeta?.notes?.length ? jsDocMeta.notes : appMapNotes;
        const hasFinalAppMap = Boolean(
          (finalDocs && finalDocs.length > 0) ||
            (finalBackend && finalBackend.length > 0) ||
            (finalFrontend && finalFrontend.length > 0) ||
            (finalNotes && finalNotes.length > 0)
        );

        // Use featureId as the entry id if available (for grouping)
        const entryId = featureId ?? id;

        if (route && hidden !== true) {
          entries.push({
            id: entryId,
            label: name ?? entryId,
            routes: [route],
            frontend: mergeList(frontendPath, finalFrontend),
            docs: finalDocs,
            backend: finalBackend,
            notes: finalNotes,
            sources: hasJsDoc ? ['modules:jsdoc'] : hasFinalAppMap ? ['modules:appMap'] : ['modules'],
          });
        } else if (hasFinalAppMap) {
          // Entry has appMap but no visible route - still include it
          entries.push({
            id: entryId,
            label: name ?? entryId,
            routes: route ? [route] : undefined,
            frontend: mergeList(frontendPath, finalFrontend),
            docs: finalDocs,
            backend: finalBackend,
            notes: finalNotes,
            sources: hasJsDoc ? ['modules:jsdoc'] : ['modules:appMap'],
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
  return { entries, actions, warnings };
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
      notes: mergeList(existing.notes, entry.notes),
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
      // Check if module already has appMap metadata (JSDoc or page.appMap)
      const hasModuleAppMap =
        generated.sources?.includes('modules:jsdoc') ||
        generated.sources?.includes('modules:appMap');

      if (hasModuleAppMap) {
        // Module has appMap - use it as primary, warn about manual registry
        if (manual.docs?.length || manual.backend?.length) {
          deprecationWarnings.push(
            `  \"${manual.id}\": has appMap metadata in module - remove from app_map.sources.json`
          );
        }
        // Use module-derived data as primary
        merged.push({
          id: manual.id,
          label: generated.label ?? manual.label,
          docs: generated.docs ?? manual.docs ?? [],
          notes: generated.notes ?? manual.notes ?? [],
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
          notes: generated.notes ?? manual.notes ?? [],
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
          `  \"${manual.id}\": not found in modules - consider adding JSDoc @appMap.* tags`
        );
      }
      merged.push({
        id: manual.id,
        label: manual.label,
        docs: manual.docs ?? [],
        notes: manual.notes ?? [],
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

function updateMarkdownSection(content: string, marker: string, table: string): string {
  const startTag = `<!-- ${marker}:START -->`;
  const endTag = `<!-- ${marker}:END -->`;

  if (!content.includes(startTag)) {
    throw new Error(`${startTag} marker not found in APP_MAP.md`);
  }
  if (!content.includes(endTag)) {
    throw new Error(`${endTag} marker not found in APP_MAP.md`);
  }

  const escStart = startTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escEnd = endTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(${escStart})\\n[\\s\\S]*?(${escEnd})`);
  return content.replace(pattern, `$1\n${table}\n$2`);
}

function updateAppMapMarkdown(table: string): string {
  const content = fs.readFileSync(APP_MAP_FILE, 'utf8');
  return updateMarkdownSection(content, 'APP_MAP', table);
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
    'Generated from module page actions by `packages/shared/app-map`.',
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
// Panel Registry Extraction
// =============================================================================

const PANEL_DEFINITIONS_DIR = path.join(
  PROJECT_ROOT,
  'apps/main/src/features/panels/domain/definitions'
);

function getPanelDefinitionFiles(): string[] {
  if (!fs.existsSync(PANEL_DEFINITIONS_DIR)) return [];
  const files: string[] = [];
  const entries = fs.readdirSync(PANEL_DEFINITIONS_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(PANEL_DEFINITIONS_DIR, entry.name);
    for (const ext of ['index.ts', 'index.tsx']) {
      const filePath = path.join(dir, ext);
      if (fs.existsSync(filePath)) {
        files.push(filePath);
        break;
      }
    }
  }
  return files;
}

function parsePanelDefinition(filePath: string): PanelRegistryEntry | null {
  const source = readSource(filePath);
  let result: PanelRegistryEntry | null = null;
  const sourcePath = path.relative(PROJECT_ROOT, filePath).replace(/\\/g, '/');

  const visit = (node: ts.Node) => {
    if (result) return;

    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (
        ts.isIdentifier(callee) &&
        (callee.text === 'definePanel' || callee.text === 'definePanelWithMeta') &&
        node.arguments.length > 0
      ) {
        const arg = node.arguments[0];
        if (ts.isObjectLiteralExpression(arg)) {
          const id = resolveString(getObjectProp(arg, 'id'));
          const title = resolveString(getObjectProp(arg, 'title'));
          if (!id || !title) return;

          const category = resolveString(getObjectProp(arg, 'category')) ?? 'tools';
          const icon = resolveString(getObjectProp(arg, 'icon')) ?? undefined;
          const description = resolveString(getObjectProp(arg, 'description')) ?? undefined;
          const tags = resolveStringArray(getObjectProp(arg, 'tags')) ?? undefined;
          const order = resolveNumber(getObjectProp(arg, 'order')) ?? undefined;
          const internal = resolveBoolean(getObjectProp(arg, 'internal')) ?? undefined;
          const supportsCompactMode = resolveBoolean(getObjectProp(arg, 'supportsCompactMode')) ?? undefined;
          const supportsMultipleInstances = resolveBoolean(getObjectProp(arg, 'supportsMultipleInstances')) ?? undefined;
          const maxInstances = resolveNumber(getObjectProp(arg, 'maxInstances')) ?? undefined;
          const availableIn = resolveStringArray(getObjectProp(arg, 'availableIn')) ?? undefined;
          const coreEditorRole = resolveString(getObjectProp(arg, 'coreEditorRole')) ?? undefined;

          // Extract orchestration sub-object
          let orchestrationType: string | undefined;
          let defaultZone: string | undefined;
          const orchExpr = getObjectProp(arg, 'orchestration');
          if (orchExpr && ts.isObjectLiteralExpression(orchExpr)) {
            orchestrationType = resolveString(getObjectProp(orchExpr, 'type')) ?? undefined;
            defaultZone = resolveString(getObjectProp(orchExpr, 'defaultZone')) ?? undefined;
          }

          result = {
            id, title, category, icon, description, tags, order, internal,
            supportsCompactMode, supportsMultipleInstances, maxInstances,
            availableIn, orchestrationType, defaultZone, coreEditorRole,
            source: sourcePath,
          };
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(source);
  return result;
}

function generatePanelTable(panels: PanelRegistryEntry[]): string {
  const lines = [
    '| Panel | Category | Zone | Type | Available In | Flags | Description |',
    '|-------|----------|------|------|-------------|-------|-------------|',
  ];

  for (const p of panels) {
    const flags: string[] = [];
    if (p.internal) flags.push('internal');
    if (p.supportsMultipleInstances) flags.push('multi');
    if (p.supportsCompactMode) flags.push('compact');
    if (p.coreEditorRole) flags.push(`role:${p.coreEditorRole}`);

    const zone = p.defaultZone ?? '-';
    const type = p.orchestrationType ?? '-';
    const availIn = p.availableIn?.join(', ') || '-';
    const flagsStr = flags.length > 0 ? flags.join(', ') : '-';
    const desc = p.description ? escapeMarkdown(p.description) : '-';

    lines.push(`| ${p.title} | ${p.category} | ${zone} | ${type} | ${availIn} | ${flagsStr} | ${desc} |`);
  }

  return lines.join('\n');
}

// =============================================================================
// Infrastructure Modules Extraction
// =============================================================================

function getModuleFiles(): string[] {
  if (!fs.existsSync(FEATURES_DIR)) return [];
  const files: string[] = [];
  const entries = fs.readdirSync(FEATURES_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const filePath = path.join(FEATURES_DIR, entry.name, 'module.ts');
    if (fs.existsSync(filePath)) {
      files.push(filePath);
    }
  }
  return files;
}

function parseModuleDefinition(
  filePath: string,
  routesMap: Record<string, string>
): ModuleRegistryEntry | null {
  const source = readSource(filePath);
  let result: ModuleRegistryEntry | null = null;
  const sourcePath = path.relative(PROJECT_ROOT, filePath).replace(/\\/g, '/');

  const visit = (node: ts.Node) => {
    if (result) return;

    if (ts.isVariableDeclaration(node)) {
      const obj = getDefinitionObjectLiteral(node.initializer, ['defineModule']);
      if (!obj) {
        ts.forEachChild(node, visit);
        return;
      }
      const id = resolveString(getObjectProp(obj, 'id'));
      const name = resolveString(getObjectProp(obj, 'name'));
      if (!id || !name) return;

      const priority = resolveNumber(getObjectProp(obj, 'priority')) ?? undefined;
      const dependsOn = resolveStringArray(getObjectProp(obj, 'dependsOn')) ?? undefined;
      const hasInitialize = getObjectProp(obj, 'initialize') !== undefined;
      const hasCleanup = getObjectProp(obj, 'cleanup') !== undefined;
      const hasIsReady = getObjectProp(obj, 'isReady') !== undefined;

      const pageExpr = getObjectProp(obj, 'page');
      const hasPage = pageExpr !== undefined;
      let route: string | undefined;
      if (pageExpr && ts.isObjectLiteralExpression(pageExpr)) {
        route = resolveString(getObjectProp(pageExpr, 'route'), routesMap) ?? undefined;
      }

      const ccExpr = getObjectProp(obj, 'controlCenterPanels');
      let controlCenterPanelCount: number | undefined;
      if (ccExpr && ts.isArrayLiteralExpression(ccExpr)) {
        controlCenterPanelCount = ccExpr.elements.length;
      }

      result = {
        id, name, priority, dependsOn, hasInitialize, hasCleanup,
        hasIsReady, hasPage, route, controlCenterPanelCount, source: sourcePath,
      };
    }

    ts.forEachChild(node, visit);
  };

  visit(source);
  return result;
}

function generateModulesTable(modules: ModuleRegistryEntry[]): string {
  const lines = [
    '| Module | Priority | Dependencies | Lifecycle | Route | CC Panels |',
    '|--------|----------|-------------|-----------|-------|-----------|',
  ];

  for (const m of modules) {
    const priority = m.priority != null ? String(m.priority) : '-';
    const deps = m.dependsOn?.join(', ') || '-';

    const lifecycle: string[] = [];
    if (m.hasInitialize) lifecycle.push('init');
    if (m.hasCleanup) lifecycle.push('cleanup');
    if (m.hasIsReady) lifecycle.push('ready');
    const lifecycleStr = lifecycle.length > 0 ? lifecycle.join(', ') : '-';

    const route = m.route ? `\`${m.route}\`` : '-';
    const cc = m.controlCenterPanelCount != null ? String(m.controlCenterPanelCount) : '-';

    lines.push(`| ${m.name} | ${priority} | ${deps} | ${lifecycleStr} | ${route} | ${cc} |`);
  }

  return lines.join('\n');
}

// =============================================================================
// Store Inventory
// =============================================================================

function scanStores(): StoreEntry[] {
  const stores: StoreEntry[] = [];
  const storePattern = /export const (use\w+Store)\s*=\s*create[<(]/;

  const walk = (dir: string) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!entry.isFile() || !fullPath.endsWith('.ts')) continue;

      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');
      for (const line of lines) {
        const match = line.match(storePattern);
        if (match) {
          const sourcePath = path.relative(PROJECT_ROOT, fullPath).replace(/\\/g, '/');
          const featureMatch = sourcePath.match(/features\/([^/]+)\//);
          stores.push({
            name: match[1],
            feature: featureMatch ? featureMatch[1] : 'unknown',
            source: sourcePath,
          });
        }
      }
    }
  };

  walk(FEATURES_DIR);
  return stores;
}

function generateStoresTable(stores: StoreEntry[]): string {
  const lines = [
    '| Store | Feature | Source |',
    '|-------|---------|--------|',
  ];

  for (const s of stores) {
    const source = s.source.replace('apps/main/src/', '');
    lines.push(`| \`${s.name}\` | ${s.feature} | \`${source}\` |`);
  }

  return lines.join('\n');
}

// =============================================================================
// Hook Index
// =============================================================================

function scanHooks(): HookEntry[] {
  const hooks: HookEntry[] = [];
  const hookPattern = /export (?:function|const) (use[A-Z]\w+)/;
  const storePattern = /use\w+Store$/;

  const walk = (dir: string) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!fullPath.endsWith('.ts') && !fullPath.endsWith('.tsx')) continue;

      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');
      for (const line of lines) {
        const match = line.match(hookPattern);
        if (match) {
          const name = match[1];
          // Skip stores — they're in the store inventory
          if (storePattern.test(name)) continue;

          const sourcePath = path.relative(PROJECT_ROOT, fullPath).replace(/\\/g, '/');
          const featureMatch = sourcePath.match(/features\/([^/]+)\//);
          hooks.push({
            name,
            feature: featureMatch ? featureMatch[1] : 'unknown',
            source: sourcePath,
          });
        }
      }
    }
  };

  walk(FEATURES_DIR);
  return hooks;
}

function generateHooksTable(hooks: HookEntry[]): string {
  const lines = [
    '| Hook | Feature | Source |',
    '|------|---------|--------|',
  ];

  for (const h of hooks) {
    const source = h.source.replace('apps/main/src/', '');
    lines.push(`| \`${h.name}\` | ${h.feature} | \`${source}\` |`);
  }

  return lines.join('\n');
}

// =============================================================================
// Main Generation Logic
// =============================================================================

export function generateAppMap(): {
  generatedJson: string;
  appMapMd: string;
  actionRegistryMd: string;
  entriesCount: number;
  actionsCount: number;
  panelsCount: number;
  modulesCount: number;
  storesCount: number;
  hooksCount: number;
  deprecationWarnings: string[];
  jsdocWarnings: string[];
} {
  // 1. Parse code for routes, capabilities, modules
  const routesMap = parseRoutesMap(ROUTES_FILE);
  const capabilityEntries = parseCapabilities(CAPABILITIES_FILE, routesMap);

  const moduleEntries: AppMapEntry[] = [];
  const actionEntries: ActionDocEntry[] = [];
  const jsdocWarnings: string[] = [];
  if (fs.existsSync(MODULE_PAGES_FILE)) {
    const parsed = parseModuleFile(MODULE_PAGES_FILE, routesMap);
    moduleEntries.push(...parsed.entries);
    actionEntries.push(...parsed.actions);
    jsdocWarnings.push(...parsed.warnings);
  }

  for (const moduleFile of getFeatureModuleFiles()) {
    const parsed = parseModuleFile(moduleFile, routesMap);
    moduleEntries.push(...parsed.entries);
    actionEntries.push(...parsed.actions);
    jsdocWarnings.push(...parsed.warnings);
  }

  // 2. Merge code-derived entries
  const mergedCodeEntries = mergeCodeEntries(capabilityEntries, moduleEntries);
  const codeEntries = Array.from(mergedCodeEntries.values()).sort((a, b) => a.id.localeCompare(b.id));

  // 3. Extract panels, modules, stores, hooks
  const panels = getPanelDefinitionFiles()
    .map(f => parsePanelDefinition(f))
    .filter((p): p is PanelRegistryEntry => p !== null)
    .sort((a, b) => a.category.localeCompare(b.category) || (a.order ?? 999) - (b.order ?? 999) || a.title.localeCompare(b.title));

  const modules = getModuleFiles()
    .map(f => parseModuleDefinition(f, routesMap))
    .filter((m): m is ModuleRegistryEntry => m !== null)
    .sort((a, b) => (b.priority ?? 50) - (a.priority ?? 50) || a.name.localeCompare(b.name));

  const stores = scanStores()
    .sort((a, b) => a.feature.localeCompare(b.feature) || a.name.localeCompare(b.name));

  const hooks = scanHooks()
    .sort((a, b) => a.feature.localeCompare(b.feature) || a.name.localeCompare(b.name));

  // 4. Generate JSON output (for debugging/intermediate use)
  const generatedJson = JSON.stringify({
    version: '2.0.0',
    generatedAt: new Date().toISOString(),
    entries: codeEntries,
    panels,
    modules,
    stores,
    hooks,
  }, null, 2) + '\n';

  // 5. Load and merge with manual registry (deprecated - will be removed)
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

  // 6. Generate markdown table and update APP_MAP.md
  const table = generateMarkdownTable(finalEntries);
  let appMapMd = updateAppMapMarkdown(table);

  // 7. Update new markdown sections
  appMapMd = updateMarkdownSection(appMapMd, 'PANEL_REGISTRY', generatePanelTable(panels));
  appMapMd = updateMarkdownSection(appMapMd, 'MODULES', generateModulesTable(modules));
  appMapMd = updateMarkdownSection(appMapMd, 'STORES', generateStoresTable(stores));
  appMapMd = updateMarkdownSection(appMapMd, 'HOOKS', generateHooksTable(hooks));

  // 8. Generate action registry
  const mergedActions = mergeActionEntries(new Map(), actionEntries);
  const actions = Array.from(mergedActions.values()).sort((a, b) => a.id.localeCompare(b.id));
  const actionRegistryMd = formatActionRegistry(actions);

  return {
    generatedJson,
    appMapMd,
    actionRegistryMd,
    entriesCount: finalEntries.length,
    actionsCount: actions.length,
    panelsCount: panels.length,
    modulesCount: modules.length,
    storesCount: stores.length,
    hooksCount: hooks.length,
    deprecationWarnings,
    jsdocWarnings,
  };
}

// =============================================================================
// Check Mode
// =============================================================================

export function checkOutputs(outputs: {
  generatedJson: string;
  appMapMd: string;
  actionRegistryMd: string;
}): boolean {
  let allCurrent = true;

  // Check generated JSON
  if (!fs.existsSync(GENERATED_JSON_FILE)) {
    console.error(`âœ— Missing: ${path.relative(PROJECT_ROOT, GENERATED_JSON_FILE)}`);
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
      console.error(`âœ— Out of date: ${path.relative(PROJECT_ROOT, GENERATED_JSON_FILE)}`);
      allCurrent = false;
    }
  }

  // Check APP_MAP.md
  if (!fs.existsSync(APP_MAP_FILE)) {
    console.error(`âœ— Missing: ${path.relative(PROJECT_ROOT, APP_MAP_FILE)}`);
    allCurrent = false;
  } else {
    const existing = fs.readFileSync(APP_MAP_FILE, 'utf8');
    if (existing !== outputs.appMapMd) {
      console.error(`âœ— Out of date: ${path.relative(PROJECT_ROOT, APP_MAP_FILE)}`);
      allCurrent = false;
    }
  }

  // Check action registry
  if (!fs.existsSync(ACTIONS_DOC_FILE)) {
    console.error(`âœ— Missing: ${path.relative(PROJECT_ROOT, ACTIONS_DOC_FILE)}`);
    allCurrent = false;
  } else {
    const existing = fs.readFileSync(ACTIONS_DOC_FILE, 'utf8');
    if (existing !== outputs.actionRegistryMd) {
      console.error(`âœ— Out of date: ${path.relative(PROJECT_ROOT, ACTIONS_DOC_FILE)}`);
      allCurrent = false;
    }
  }

  return allCurrent;
}

// =============================================================================
// CLI Entry Point
// =============================================================================

export function runAppMapGenerator(argv: string[] = process.argv) {
  const checkMode = argv.includes('--check');

  try {
    const outputs = generateAppMap();

    if (checkMode) {
      const allCurrent = checkOutputs(outputs);
      if (allCurrent) {
        console.log('âœ“ All app-map outputs are current');
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

    console.log(`âœ“ Generated: ${path.relative(PROJECT_ROOT, GENERATED_JSON_FILE)}`);
    console.log(`âœ“ Updated: ${path.relative(PROJECT_ROOT, APP_MAP_FILE)}`);
    console.log(`âœ“ Generated: ${path.relative(PROJECT_ROOT, ACTIONS_DOC_FILE)}`);
    console.log(`  Entries: ${outputs.entriesCount}`);
    console.log(`  Actions: ${outputs.actionsCount}`);
    console.log(`  Panels: ${outputs.panelsCount}`);
    console.log(`  Modules: ${outputs.modulesCount}`);
    console.log(`  Stores: ${outputs.storesCount}`);
    console.log(`  Hooks: ${outputs.hooksCount}`);

    // Show deprecation warnings for entries that should be migrated to module.ts
    if (outputs.deprecationWarnings.length > 0) {
      console.log('');
      console.log('âš  DEPRECATION: app_map.sources.json entries to migrate:');
      for (const warning of outputs.deprecationWarnings) {
        console.log(warning);
      }
      console.log('');
      console.log('  Move metadata to module JSDoc @appMap.* tags.');
      console.log('  See: docs/APP_MAP.md for example.');
    }


    if (outputs.jsdocWarnings.length > 0) {
      console.log('');
      console.log('WARN: JSDOC conflicts detected (JSDoc overrides page.appMap):');
      for (const warning of outputs.jsdocWarnings) {
        console.log(warning);
      }
      console.log('');
      console.log('  Prefer @appMap.* tags on module declarations.');
    }
  } catch (error) {
    console.error(`âœ— Error: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

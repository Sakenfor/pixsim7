import fs from 'fs';
import path from 'path';
import * as ts from 'typescript';

type AppMapEntry = {
  id: string;
  label?: string;
  routes?: string[];
  frontend?: string[];
  sources?: string[];
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
const OUTPUT_FILE = path.join(PROJECT_ROOT, 'docs/app_map.generated.json');
const ACTIONS_DOC_FILE = path.join(PROJECT_ROOT, 'docs/architecture/action-registry.md');

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

        if (route && hidden !== true) {
          entries.push({
            id,
            label: name ?? id,
            routes: [route],
            frontend: frontendPath,
            sources: ['modules'],
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

function mergeEntries(
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

function generateAppMap(): void {
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

  const merged = mergeEntries(capabilityEntries, moduleEntries);
  const entries = Array.from(merged.values()).sort((a, b) => a.id.localeCompare(b.id));

  const output = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    entries,
  };

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2) + '\n', 'utf8');

  const mergedActions = mergeActionEntries(new Map(), actionEntries);
  const actions = Array.from(mergedActions.values()).sort((a, b) => a.id.localeCompare(b.id));
  fs.mkdirSync(path.dirname(ACTIONS_DOC_FILE), { recursive: true });
  fs.writeFileSync(ACTIONS_DOC_FILE, formatActionRegistry(actions), 'utf8');

  console.log(`Generated app map: ${path.relative(PROJECT_ROOT, OUTPUT_FILE)}`);
  console.log(`Entries: ${entries.length}`);
  console.log(`Actions: ${actions.length}`);
}

generateAppMap();

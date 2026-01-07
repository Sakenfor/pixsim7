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
): AppMapEntry[] {
  const source = readSource(filePath);
  const entries: AppMapEntry[] = [];

  const frontendPath = (() => {
    const normalized = filePath.replace(/\\/g, '/');
    const match = normalized.match(/apps\/main\/src\/features\/([^/]+)\/module\.ts$/);
    if (match) {
      return [`apps/main/src/features/${match[1]}/`];
    }
    return undefined;
  })();

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
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
  return entries;
}

function getFeatureModuleFiles(): string[] {
  if (!fs.existsSync(FEATURES_DIR)) return [];
  const dirs = fs.readdirSync(FEATURES_DIR, { withFileTypes: true });
  const files: string[] = [];

  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;
    const modulePath = path.join(FEATURES_DIR, dir.name, 'module.ts');
    if (fs.existsSync(modulePath)) {
      files.push(modulePath);
    }
  }

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

function generateAppMap(): void {
  const routesMap = parseRoutesMap(ROUTES_FILE);
  const capabilityEntries = parseCapabilities(CAPABILITIES_FILE, routesMap);

  const moduleEntries: AppMapEntry[] = [];
  if (fs.existsSync(MODULE_PAGES_FILE)) {
    moduleEntries.push(...parseModuleFile(MODULE_PAGES_FILE, routesMap));
  }

  for (const moduleFile of getFeatureModuleFiles()) {
    moduleEntries.push(...parseModuleFile(moduleFile, routesMap));
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

  console.log(`Generated app map: ${path.relative(PROJECT_ROOT, OUTPUT_FILE)}`);
  console.log(`Entries: ${entries.length}`);
}

generateAppMap();

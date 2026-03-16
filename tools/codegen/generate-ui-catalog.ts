#!/usr/bin/env tsx
/**
 * Generates a UI component catalog from the shared UI package exports.
 *
 * Source:  packages/shared/ui/src/ (index.ts + individual component files)
 * Output:  docs/ui-component-catalog.generated.json
 *
 * The catalog enables AI tools to discover available shared UI components
 * and their props, preventing ad-hoc inline UI when a shared component exists.
 *
 * Usage:
 *   pnpm codegen -- --only ui-catalog
 *   pnpm codegen -- --only ui-catalog --check
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const CHECK_MODE = process.argv.includes('--check');

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const normalizedDir =
  process.platform === 'win32' && SCRIPT_DIR.startsWith('/')
    ? SCRIPT_DIR.slice(1)
    : SCRIPT_DIR;

const ROOT = path.resolve(normalizedDir, '../..');
const UI_SRC = path.resolve(ROOT, 'packages/shared/ui/src');
const INDEX_PATH = path.resolve(UI_SRC, 'index.ts');
const ICONS_PATH = path.resolve(ROOT, 'apps/main/src/lib/icons.tsx');
const APPEARANCE_PATH = path.resolve(ROOT, 'apps/main/src/features/appearance/stores/appearanceStore.ts');
const OUT_PATH = path.resolve(ROOT, 'docs/ui-component-catalog.generated.json');

// ============================================================================
// Parsing
// ============================================================================

interface PropInfo {
  name: string;
  type: string;
  required: boolean;
  description: string;
  default?: string;
}

interface ComponentInfo {
  name: string;
  kind: 'component' | 'hook' | 'utility';
  sourceFile: string;
  description: string;
  props: PropInfo[];
  examples: string[];
  useInsteadOf?: string;
}

/** Extract re-export paths from index.ts */
function getExportPaths(indexContent: string): string[] {
  const paths: string[] = [];
  for (const match of indexContent.matchAll(/export\s+\*\s+from\s+['"](.+?)['"]/g)) {
    paths.push(match[1]);
  }
  // Also handle named re-exports like: export { Foo } from './Foo'
  for (const match of indexContent.matchAll(/export\s+\{[^}]+\}\s+from\s+['"](.+?)['"]/g)) {
    if (!paths.includes(match[1])) {
      paths.push(match[1]);
    }
  }
  return paths;
}

/** Resolve a relative import path to an absolute file path */
function resolveFilePath(importPath: string, baseDir: string): string | null {
  const candidates = [
    path.resolve(baseDir, `${importPath}.tsx`),
    path.resolve(baseDir, `${importPath}.ts`),
    path.resolve(baseDir, importPath, 'index.tsx'),
    path.resolve(baseDir, importPath, 'index.ts'),
  ];
  return candidates.find((c) => fs.existsSync(c)) ?? null;
}

/** Extract JSDoc block immediately above a position in the source */
function extractJsDoc(source: string, position: number): string {
  // Look backwards from position for a JSDoc comment with only whitespace between
  const before = source.slice(Math.max(0, position - 2000), position);
  const match = before.match(/\/\*\*([\s\S]*?)\*\/\s*$/);
  if (!match) return '';
  // Verify the matched block is close (no code between JSDoc and export)
  const gap = before.slice(match.index! + match[0].length);
  if (gap.trim().length > 0) return '';
  return match[1]
    .split('\n')
    .map((line) => line.replace(/^\s*\*\s?/, '').trim())
    .filter((line) => line.length > 0 && !line.startsWith('@'))
    .join(' ')
    .trim();
}

/** Extract @example blocks from JSDoc */
function extractExamples(source: string, position: number): string[] {
  const before = source.slice(Math.max(0, position - 2000), position);
  const docMatch = before.match(/\/\*\*([\s\S]*?)\*\/\s*$/);
  if (!docMatch) return [];
  const gap = before.slice(docMatch.index! + docMatch[0].length);
  if (gap.trim().length > 0) return [];

  const examples: string[] = [];
  const docBody = docMatch[1];
  const exampleBlocks = docBody.split(/@example/);

  for (let i = 1; i < exampleBlocks.length; i++) {
    const block = exampleBlocks[i];
    const codeMatch = block.match(/```\w*\n([\s\S]*?)```/);
    if (codeMatch) {
      examples.push(codeMatch[1].trim());
    }
  }

  return examples;
}

/** Extract "use instead of" hints from JSDoc (custom @useInsteadOf tag or description keywords) */
function extractUseInsteadOf(source: string, position: number): string | undefined {
  const before = source.slice(Math.max(0, position - 2000), position);
  const docMatch = before.match(/\/\*\*([\s\S]*?)\*\/\s*$/);
  if (!docMatch) return undefined;
  const gap = before.slice(docMatch.index! + docMatch[0].length);
  if (gap.trim().length > 0) return undefined;

  // Look for explicit pattern in JSDoc: "use instead of" or "replaces"
  const body = docMatch[1];
  const hint = body.match(/[Uu]se\s+instead\s+of\s+(.+?)(?:\.|$)/m);
  if (hint) return hint[1].trim().replace(/^\*\s*/, '');

  return undefined;
}

/**
 * Static useInsteadOf hints for components that don't have JSDoc annotations yet.
 * These tell AI agents what ad-hoc pattern this component replaces.
 */
const USE_INSTEAD_OF_HINTS: Record<string, string> = {
  SearchInput: 'raw <input type="text"> with hand-rolled search/filter styling',
  Checkbox: 'raw <input type="checkbox"> with manual styling',
  Badge: 'inline <span> elements with bg-*/text-* color pill styling',
  SectionHeader: 'inline <h3>/<div> with text-xs font-semibold uppercase styling for section labels',
  EmptyState: 'inline "No items found" text with ad-hoc styling',
  Button: 'raw <button> with hand-rolled variant/size styling',
  FilterPillGroup: 'custom pill/tab filter bars with manual active-state styling',
  SidebarContentLayout: 'hand-rolled flex sidebar + content layouts with manual resize/collapse',
  SidebarPaneShell: 'ad-hoc sidebar wrapper divs with manual title/collapse logic',
  IconBadge: 'inline icon-in-colored-circle with manual bg/rounded-full styling',
  Tooltip: 'title attributes or custom hover popover divs',
  Modal: 'custom portal-based dialog overlays',
};

/**
 * Extract the file-level JSDoc comment (first /** block at the top of the file).
 * Used as fallback description when the component-level JSDoc is empty.
 */
function extractFileJsDoc(source: string): string {
  const match = source.match(/^\s*\/\*\*([\s\S]*?)\*\//);
  if (!match) return '';
  return match[1]
    .split('\n')
    .map((line) => line.replace(/^\s*\*\s?/, '').trim())
    .filter((line) => line.length > 0 && !line.startsWith('@'))
    .join(' ')
    .trim();
}

/** Parse interface props from TypeScript source */
function parsePropsInterface(source: string, interfaceName: string): PropInfo[] {
  // Find the interface block
  const interfaceRegex = new RegExp(
    `export\\s+interface\\s+${interfaceName}[^{]*\\{([\\s\\S]*?)\\n\\}`,
  );
  const match = source.match(interfaceRegex);
  if (!match) return [];

  const body = match[1];
  const props: PropInfo[] = [];

  // Match property lines: /** comment */ name?: type;
  const propRegex =
    /(?:\/\*\*\s*([\s\S]*?)\s*\*\/\s*)?(\w+)(\??):\s*([^;]+);/g;

  let propMatch: RegExpExecArray | null;
  while ((propMatch = propRegex.exec(body)) !== null) {
    const [, rawDoc, name, optional, rawType] = propMatch;
    // Skip internal/private props
    if (name.startsWith('_')) continue;

    const doc = rawDoc
      ? rawDoc
          .split('\n')
          .map((l) => l.replace(/^\s*\*\s?/, '').trim())
          .filter(Boolean)
          .join(' ')
      : '';

    // Extract default from doc: "Default: X", "(default: X)", "Defaults to X"
    // Skip bare "(default)" with no value — that means "this is the default behavior"
    const defaultMatch = doc.match(
      /[Dd]efaults?\s+to\s+(\S+)|[Dd]efault[s:]?\s*[:=`]\s*(\S+?)[\s)`,]|\(default:\s*(\S+?)\)/,
    );

    props.push({
      name,
      type: rawType.trim(),
      required: optional !== '?',
      description: doc
        .replace(/[Dd]efaults?\s+to\s+\S+\.?/, '')
        .replace(/\(default:\s*\S+?\)/, '')
        .replace(/[Dd]efault[s:]?\s*[:=`]\s*\S+[\s)`,]?/, '')
        .trim(),
      ...(defaultMatch ? { default: (defaultMatch[1] || defaultMatch[2] || defaultMatch[3]) } : {}),
    });
  }

  return props;
}

/** Determine component kind from name */
function classifyExport(name: string): 'component' | 'hook' | 'utility' {
  if (name.startsWith('use')) return 'hook';
  if (/^[A-Z]/.test(name)) return 'component';
  return 'utility';
}

/** Scan a source file for exported components/hooks and their props */
function scanFile(filePath: string, relPath: string): ComponentInfo[] {
  const source = fs.readFileSync(filePath, 'utf-8');
  const results: ComponentInfo[] = [];
  const fileDoc = extractFileJsDoc(source);

  // Find exported functions/components
  const exportRegex =
    /export\s+(?:const|function)\s+(\w+)/g;

  let match: RegExpExecArray | null;
  while ((match = exportRegex.exec(source)) !== null) {
    const name = match[1];
    const kind = classifyExport(name);

    // Skip internal helpers, types-only exports
    if (name.startsWith('_')) continue;
    if (/^[a-z]/.test(name) && kind === 'utility') continue; // skip small utils

    let description = extractJsDoc(source, match.index);
    const examples = extractExamples(source, match.index);
    const useInsteadOf = extractUseInsteadOf(source, match.index) ?? USE_INSTEAD_OF_HINTS[name];

    // Fall back to file-level JSDoc if the primary export has no description
    if (!description && fileDoc) {
      description = fileDoc;
    }

    // Try to find matching Props interface
    let props: PropInfo[] = [];
    const propsInterfaceName = `${name}Props`;
    props = parsePropsInterface(source, propsInterfaceName);

    // For hooks, try Options interface
    if (kind === 'hook' && props.length === 0) {
      const optionsName = `${name.charAt(0).toUpperCase()}${name.slice(1)}Options`
        .replace(/^Use/, 'Use');
      props = parsePropsInterface(source, optionsName);
    }

    results.push({
      name,
      kind,
      sourceFile: relPath,
      description,
      props,
      examples,
      ...(useInsteadOf ? { useInsteadOf } : {}),
    });
  }

  // Also find forwardRef components: export const X = React.forwardRef<...>
  const forwardRefRegex =
    /export\s+const\s+(\w+)\s*=\s*React\.forwardRef/g;

  while ((match = forwardRefRegex.exec(source)) !== null) {
    const name = match[1];
    if (results.some((r) => r.name === name)) continue;

    let description = extractJsDoc(source, match.index);
    const examples = extractExamples(source, match.index);
    const useInsteadOf = extractUseInsteadOf(source, match.index) ?? USE_INSTEAD_OF_HINTS[name];

    if (!description && fileDoc) {
      description = fileDoc;
    }

    const props = parsePropsInterface(source, `${name}Props`);

    results.push({
      name,
      kind: 'component',
      sourceFile: relPath,
      description,
      props,
      examples,
      ...(useInsteadOf ? { useInsteadOf } : {}),
    });
  }

  return results;
}

// ============================================================================
// Composition patterns
// ============================================================================

interface CompositionPattern {
  name: string;
  description: string;
  components: string[];
  example: string;
}

function buildCompositionPatterns(): CompositionPattern[] {
  return [
    {
      name: 'Sidebar navigation panel',
      description:
        'Panel with left sidebar for category/section navigation and scrollable content area. ' +
        'Use for any tool discovery, settings, or browsable list UI.',
      components: [
        'SidebarContentLayout',
        'useSidebarNav',
        'useTheme',
        'SearchInput',
        'SectionHeader',
        'EmptyState',
      ],
      example: [
        'const { theme } = useTheme();',
        'const nav = useSidebarNav({ sections, initial: "first", storageKey: "my-panel:nav" });',
        '',
        '<SidebarContentLayout',
        '  sections={sections}',
        '  activeSectionId={nav.activeSectionId}',
        '  onSelectSection={nav.selectSection}',
        '  variant={theme}',
        '  collapsible',
        '  persistKey="my-panel-sidebar"',
        '>',
        '  <SectionHeader>Title</SectionHeader>',
        '  <SearchInput value={query} onChange={setQuery} placeholder="Filter..." size="sm" />',
        '  {items.length === 0 && <EmptyState message="No items found" />}',
        '</SidebarContentLayout>',
      ].join('\n'),
    },
    {
      name: 'Filterable list with badges',
      description:
        'List with category filter pills, search, and items showing status/tag badges. ' +
        'Use for plugin lists, tool catalogs, registry views.',
      components: ['FilterPillGroup', 'SearchInput', 'Badge', 'EmptyState'],
      example: [
        '<FilterPillGroup options={categories} value={filter} onChange={setFilter} allLabel="All" />',
        '<SearchInput value={query} onChange={setQuery} />',
        '{items.map(item => (',
        '  <div key={item.id}>',
        '    {item.label}',
        '    <Badge color="blue">{item.status}</Badge>',
        '    {item.tags.map(t => <Badge key={t} color="gray">{t}</Badge>)}',
        '  </div>',
        '))}',
        '{items.length === 0 && <EmptyState message="No items match" />}',
      ].join('\n'),
    },
    {
      name: 'Sidebar pane (standalone)',
      description:
        'Single sidebar panel with title, optional collapse, and scrollable body. ' +
        'Use for sidebar panels that don\'t need multi-section navigation.',
      components: ['SidebarPaneShell', 'SectionHeader', 'EmptyState'],
      example: [
        '<SidebarPaneShell title="My Panel" collapsible persistKey="my-panel">',
        '  <SectionHeader>Section</SectionHeader>',
        '  {content}',
        '</SidebarPaneShell>',
      ].join('\n'),
    },
  ];
}

// ============================================================================
// Main
// ============================================================================

function main() {
  if (!fs.existsSync(INDEX_PATH)) {
    console.error(`✗ Missing shared UI index: ${INDEX_PATH}`);
    process.exit(1);
  }

  const indexContent = fs.readFileSync(INDEX_PATH, 'utf-8');
  const exportPaths = getExportPaths(indexContent);

  const allComponents: ComponentInfo[] = [];
  const scannedFiles = new Set<string>();

  // Resolve export paths, following nested barrel files
  const queue = exportPaths.map((p) => ({ importPath: p, baseDir: UI_SRC }));
  while (queue.length > 0) {
    const { importPath, baseDir } = queue.shift()!;
    const filePath = resolveFilePath(importPath, baseDir);
    if (!filePath || scannedFiles.has(filePath)) continue;
    scannedFiles.add(filePath);

    const content = fs.readFileSync(filePath, 'utf-8');

    // If this file is a barrel (only re-exports, no function/const exports), follow its exports
    const hasOwnExports = /export\s+(?:const|function)\s+\w+/.test(content);
    if (!hasOwnExports) {
      const nestedPaths = getExportPaths(content);
      const nestedDir = path.dirname(filePath);
      for (const nested of nestedPaths) {
        queue.push({ importPath: nested, baseDir: nestedDir });
      }
      continue;
    }

    const relPath = path.relative(ROOT, filePath).replace(/\\/g, '/');
    const components = scanFile(filePath, relPath);
    allComponents.push(...components);
  }

  // Sort by kind then name
  const kindOrder = { component: 0, hook: 1, utility: 2 };
  allComponents.sort((a, b) => {
    const kindDiff = kindOrder[a.kind] - kindOrder[b.kind];
    if (kindDiff !== 0) return kindDiff;
    return a.name.localeCompare(b.name);
  });

  const icons = extractIcons();
  const theme = extractTheme();
  const patterns = buildCompositionPatterns();

  const catalog = {
    $schema: 'ui-component-catalog',
    generatedAt: new Date().toISOString().split('T')[0],
    description:
      'Auto-generated catalog of shared UI components, icons, and theme tokens. ' +
      'Use these instead of writing inline UI with raw Tailwind classes.',
    agentGuidance: {
      rules: [
        'Before writing any inline UI element, check this catalog for an existing shared component.',
        'If a component has a "useInsteadOf" field, NEVER use the described ad-hoc pattern.',
        'Use the "patterns" section to find the right combination of components for common layouts.',
        'Import from "@pixsim7/shared.ui" — do not duplicate component logic inline.',
      ],
      checklistBeforeCoding: [
        'Search input needed? → SearchInput (not raw <input>)',
        'Empty list state? → EmptyState (not inline "No items" text)',
        'Section label? → SectionHeader (not ad-hoc <h3>/<div>)',
        'Small colored label? → Badge (not inline <span> with color classes)',
        'Checkbox? → Checkbox (not raw <input type="checkbox">)',
        'Filter pills/tabs? → FilterPillGroup (not custom pill bar)',
        'Sidebar + content layout? → SidebarContentLayout + useSidebarNav',
        'Tooltip? → Tooltip (not title attribute or custom hover div)',
      ],
    },
    componentCount: allComponents.filter((c) => c.kind === 'component').length,
    hookCount: allComponents.filter((c) => c.kind === 'hook').length,
    package: '@pixsim7/shared.ui',
    components: allComponents,
    patterns,
    icons,
    theme,
  };

  const output = JSON.stringify(catalog, null, 2) + '\n';

  if (CHECK_MODE) {
    if (!fs.existsSync(OUT_PATH)) {
      console.error(`✗ Missing generated file: ${OUT_PATH}`);
      console.error('  Run: pnpm codegen -- --only ui-catalog');
      process.exit(1);
    }
    const existing = fs.readFileSync(OUT_PATH, 'utf-8');
    // Compare ignoring generatedAt timestamp
    const normalize = (s: string) => s.replace(/"generatedAt":\s*"[^"]*"/, '"generatedAt": ""');
    if (normalize(existing) !== normalize(output)) {
      console.error('✗ UI component catalog is out of date.');
      console.error('  Run: pnpm codegen -- --only ui-catalog');
      process.exit(1);
    }
    console.log('✓ UI component catalog is up to date.');
    return;
  }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, output, 'utf-8');

  console.log(`✓ Generated UI catalog: ${path.relative(ROOT, OUT_PATH)}`);
  console.log(
    `  ${catalog.componentCount} components, ${catalog.hookCount} hooks, ` +
    `${icons.names.length} icons, ${theme.colorSchemes.length} color schemes`,
  );
}

// ============================================================================
// Icon extraction
// ============================================================================

interface IconsCatalog {
  sourceFile: string;
  names: string[];
  count: number;
  usage: string;
}

function extractIcons(): IconsCatalog {
  const content = fs.readFileSync(ICONS_PATH, 'utf-8');

  // Extract keys from `export const Icons = { ... } as const;`
  const iconsBlockMatch = content.match(
    /export\s+const\s+Icons\s*=\s*\{([\s\S]*?)\}\s*as\s+const/,
  );
  if (!iconsBlockMatch) {
    console.warn('⚠ Could not find Icons map in icons.tsx');
    return { sourceFile: '', names: [], count: 0, usage: '' };
  }

  const block = iconsBlockMatch[1];
  const names: string[] = [];

  // Match keys: `  iconName: Component,` or `  'kebab-name': Component,`
  for (const m of block.matchAll(/^\s*(?:'([^']+)'|"([^"]+)"|(\w+))\s*:/gm)) {
    const name = m[1] ?? m[2] ?? m[3];
    if (name) names.push(name);
  }

  return {
    sourceFile: path.relative(ROOT, ICONS_PATH).replace(/\\/g, '/'),
    names: names.sort(),
    count: names.length,
    usage:
      'Import { Icon, IconName } from "@lib/icons". ' +
      'Use <Icon name="iconName" size={16} />. ' +
      'For white icons on colored backgrounds use color="#fff" prop.',
  };
}

// ============================================================================
// Theme extraction
// ============================================================================

interface ThemeCatalog {
  sourceFile: string;
  colorSchemes: string[];
  accentColors: string[];
  sidebarVariants: string[];
  hooks: {
    name: string;
    from: string;
    description: string;
  }[];
  usage: string;
}

function extractTheme(): ThemeCatalog {
  let content = '';
  try {
    content = fs.readFileSync(APPEARANCE_PATH, 'utf-8');
  } catch {
    console.warn('⚠ Could not read appearanceStore.ts');
  }

  // Extract type union members like: type ColorScheme = 'light' | 'dark' | 'system'
  function extractUnion(name: string): string[] {
    const re = new RegExp(`type\\s+${name}\\s*=\\s*([^;]+);`);
    const m = content.match(re);
    if (!m) return [];
    return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  }

  return {
    sourceFile: path.relative(ROOT, APPEARANCE_PATH).replace(/\\/g, '/'),
    colorSchemes: extractUnion('ColorScheme'),
    accentColors: extractUnion('AccentColor'),
    sidebarVariants: ['light', 'dark'],
    hooks: [
      {
        name: 'useTheme',
        from: '@pixsim7/shared.ui',
        description:
          'Returns { theme: "light" | "dark", toggle }. ' +
          'Use theme as variant prop for SidebarContentLayout and similar.',
      },
      {
        name: 'useAppearanceStore',
        from: '@features/appearance',
        description:
          'Full appearance state: colorScheme, accentColor, iconTheme, buttonStyle.',
      },
    ],
    usage:
      'Use useTheme().theme as variant prop for sidebar/nav components. ' +
      'Use dark: Tailwind prefix for theme-aware styling (e.g., "bg-white dark:bg-gray-900"). ' +
      'Tailwind dark mode strategy is class-based (.dark on <html>).',
  };
}

main();

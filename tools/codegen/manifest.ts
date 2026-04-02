export type CodegenTask = {
  id: string;
  description: string;
  script: string;
  args?: string[];
  supportsCheck?: boolean;
  groups?: string[];
};

export const CODEGEN_TASKS: CodegenTask[] = [
  {
    id: 'composition-roles',
    description: 'Generate composition role types from roles vocab',
    script: 'tools/codegen/generate-composition-roles.ts',
    supportsCheck: true,
    groups: ['types'],
  },
  {
    id: 'prompt-roles',
    description: 'Generate prompt role types from prompt roles vocab',
    script: 'tools/codegen/generate-prompt-roles.ts',
    supportsCheck: true,
    groups: ['types'],
  },
  {
    id: 'openapi',
    description: 'Generate OpenAPI artifacts (Orval split output)',
    script: 'tools/codegen/generate-openapi-types.ts',
    supportsCheck: true,
    groups: ['types', 'openapi'],
  },
  {
    id: 'openapi-assets',
    description: 'Scoped OpenAPI merge for assets/providers/media tags',
    script: 'tools/codegen/generate-openapi-types.ts',
    args: [
      '--include-tags',
      'assets,assets-search,assets-upload,assets-tags,assets-bulk,assets-enrich,asset-versions,providers,pixverse,media,tags',
      '--merge',
    ],
    supportsCheck: true,
    groups: ['types', 'openapi'],
  },
  {
    id: 'openapi-game',
    description: 'Scoped OpenAPI merge for gameplay/domain tags',
    script: 'tools/codegen/generate-openapi-types.ts',
    args: [
      '--include-tags',
      'game-worlds,game-actions,game-behavior,game-locations,game-objects,game-links,game-npcs,game-scenes,game-quests,game-sessions,game-inventory,game-meta,game-triggers,interactions,characters,character-graph,concepts,composition,generation-chains,generations',
      '--merge',
    ],
    supportsCheck: true,
    groups: ['types', 'openapi'],
  },
  {
    id: 'openapi-dev',
    description: 'Scoped OpenAPI merge for dev/admin tooling tags',
    script: 'tools/codegen/generate-openapi-types.ts',
    args: [
      '--include-tags',
      'dev,devtools,admin,codegen,logs,migrations,meta,plans,files,documents,notifications,plugins,prompt-tools,prompt-packs,prompts,prompts-git,analyzers,analyses,ai,assistants',
      '--merge',
    ],
    supportsCheck: true,
    groups: ['types', 'openapi'],
  },
  {
    id: 'branded',
    description: 'Generate branded type helpers',
    script: 'tools/codegen/generate-branded-types.ts',
    supportsCheck: true,
    groups: ['types'],
  },
  {
    id: 'upload-context',
    description: 'Generate upload context schema/types from YAML',
    script: 'tools/codegen/generate-upload-context.ts',
    supportsCheck: true,
    groups: ['types'],
  },
  {
    id: 'prompt-pack-schemas',
    description:
      'Generate + lint prompt block-pack schema.yaml/manifest.yaml from CUE sources',
    script: 'tools/codegen/generate-prompt-pack-schemas.ts',
    supportsCheck: true,
    groups: ['prompt'],
  },
  {
    id: 'app-map',
    description: 'Generate APP_MAP.md and action registry from code',
    script: 'packages/shared/app-map/src/cli.ts',
    supportsCheck: true,
    groups: ['docs'],
  },
  {
    id: 'plugin-codegen',
    description: 'Run plugin-contributed codegen tasks from backend manifests',
    script: 'tools/codegen/run-plugin-codegen.ts',
    supportsCheck: false,
    groups: ['plugins'],
  },
  {
    id: 'ui-catalog',
    description: 'Generate UI component catalog from shared UI package exports',
    script: 'tools/codegen/generate-ui-catalog.ts',
    supportsCheck: true,
    groups: ['docs'],
  },
];

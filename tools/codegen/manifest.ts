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
    description: 'Generate OpenAPI types from running backend',
    script: 'tools/codegen/generate-openapi-types.ts',
    supportsCheck: true,
    groups: ['types'],
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
];

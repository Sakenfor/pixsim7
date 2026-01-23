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
    description: 'Generate composition role types from YAML',
    script: 'scripts/generate-composition-roles.ts',
    supportsCheck: true,
    groups: ['types'],
  },
  {
    id: 'openapi',
    description: 'Generate OpenAPI types from running backend',
    script: 'scripts/generate-openapi-types.ts',
    supportsCheck: true,
    groups: ['types'],
  },
  {
    id: 'branded',
    description: 'Generate branded type helpers',
    script: 'scripts/generate-branded-types.ts',
    supportsCheck: true,
    groups: ['types'],
  },
  {
    id: 'upload-context',
    description: 'Generate upload context schema/types from YAML',
    script: 'scripts/generate-upload-context.ts',
    supportsCheck: true,
    groups: ['types'],
  },
  {
    id: 'app-map',
    description: 'Generate APP_MAP.md and action registry from code',
    script: 'scripts/generate-app-map.ts',
    supportsCheck: true,
    groups: ['docs'],
  },
];

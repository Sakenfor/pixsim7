export type CodegenTask = {
  id: string;
  description: string;
  script: string;
  args?: string[];
  supportsCheck?: boolean;
  /**
   * If true, the task can only be invoked in `--check` mode. The launcher hides
   * the destructive "Run" button. Used for tag-filtered openapi smoke-checks
   * that would otherwise clobber the shared output dir with only their slice.
   */
  checkOnly?: boolean;
  /**
   * Repo-relative path the task writes to (file or directory). Surfaced to UIs
   * for filesystem stats (file count, size, last-modified, generated-symbol
   * count for openapi). For check-only scoped `<parent>-*` tasks, leave unset
   * — they share their parent's output and the backend resolves it via prefix.
   */
  outputPath?: string;
  /**
   * Service id this task depends on (e.g., `'main-api'`). The launcher's
   * process manager surfaces a "service running" status badge using this.
   * Display labels live in the launcher route's small SERVICE_LABELS map.
   */
  requires?: string;
  /**
   * Per-task subprocess timeout in milliseconds. Defaults to 300_000 (5 min)
   * when unset. Useful when a task is normally fast and a hang means trouble
   * — set a tighter value so the launcher Run button isn't locked for ages.
   */
  timeoutMs?: number;
  groups?: string[];
};

export const CODEGEN_TASKS: CodegenTask[] = [
  {
    id: 'composition-roles',
    description: 'Generate composition role types from roles vocab',
    script: 'tools/codegen/generate-composition-roles.ts',
    outputPath: 'packages/shared/types/src/composition-roles.generated.ts',
    supportsCheck: true,
    groups: ['types', 'ontology'],
  },
  {
    id: 'prompt-roles',
    description: 'Generate prompt role types from prompt roles vocab',
    script: 'tools/codegen/generate-prompt-roles.ts',
    outputPath: 'packages/shared/types/src/prompt-roles.generated.ts',
    supportsCheck: true,
    groups: ['types', 'ontology'],
  },
  {
    id: 'latin-enhancer-domains',
    description: 'Generate latin-enhancer domain constants from CUE + metadata',
    script: 'tools/codegen/generate-latin-enhancer-domains.ts',
    outputPath: 'packages/shared/types/src/latin-enhancer-domains.generated.ts',
    supportsCheck: true,
    groups: ['types', 'ontology'],
  },
  {
    id: 'openapi',
    description: 'Generate OpenAPI artifacts (Orval split output)',
    script: 'tools/codegen/generate-openapi-types.ts',
    outputPath: 'packages/shared/api/model/src/generated/openapi',
    requires: 'main-api',
    supportsCheck: true,
    groups: ['types', 'openapi'],
  },
  // Scoped openapi-* tasks are tag-filtered slices of the canonical `openapi`
  // output. Generate MERGES the slice into the shared output dir (overwrites/adds
  // just the slice's DTO files + rebuilds the barrel) instead of clobbering it —
  // so a scoped Generate means "regenerate just this domain". Caveat: a merge does
  // NOT prune deletions; full `openapi` (clean:true) remains the only task that
  // removes DTO files orphaned by a backend deletion/rename. Check mode compares
  // the slice against canonical (subset compare). Coverage policy: the five scopes
  // form an EXHAUSTIVE, NON-OVERLAPPING partition of every tag in the live spec —
  // each backend tag belongs to exactly one scoped task. When you add a backend
  // router tag, assign it to exactly one scope here (re-audit with the
  // `tag-partition` task / tools/codegen/check-openapi-tag-partition.ts).
  {
    id: 'openapi-assets',
    description: 'Scoped OpenAPI slice for assets/providers/media tags (merge-generate or check)',
    script: 'tools/codegen/generate-openapi-types.ts',
    args: [
      '--include-tags',
      'assets,assets-search,assets-upload,assets-tags,assets-bulk,assets-enrich,assets-maintenance,asset-versions,providers,pixverse,media,tags',
    ],
    requires: 'main-api',
    supportsCheck: true,
    groups: ['types', 'openapi'],
  },
  {
    id: 'openapi-prompts',
    description: 'Scoped OpenAPI slice for prompts/templates/vocabulary tags (merge-generate or check)',
    script: 'tools/codegen/generate-openapi-types.ts',
    args: [
      '--include-tags',
      'prompts,prompt-operations,prompt-packs,prompt-tools,prompts-git,templates,block-templates,block-fit,authoring-modes,vocabulary,semantic-packs,semantic-surface,latin-enhancer,ontology',
    ],
    requires: 'main-api',
    supportsCheck: true,
    groups: ['types', 'openapi'],
  },
  {
    id: 'openapi-game',
    description: 'Scoped OpenAPI slice for gameplay/world/NPC tags (merge-generate or check)',
    script: 'tools/codegen/generate-openapi-types.ts',
    args: [
      '--include-tags',
      'game,game-actions,game-behavior,game-dialogue,game-inventory,game-links,game-locations,game-meta,game-npc,game-npcs,game-objects,game-quests,game-reputation,game-scenes,game-sessions,game-stealth,game-triggers,game-worlds,game_stealth,worlds,scenes,locations,npc,npcs,npc-state,state,memories,emotions,mood,romance,behavior-registry,characters,character-graph,concepts,composition,interactions,dialogue,dialogue-analytics,items,species,timeline,journeys,flows,categories,library,discovery,generation-chains,generations',
    ],
    requires: 'main-api',
    supportsCheck: true,
    groups: ['types', 'openapi'],
  },
  {
    id: 'openapi-runtime',
    description: 'Scoped OpenAPI slice for runtime/agents/automation tags (merge-generate or check)',
    script: 'tools/codegen/generate-openapi-types.ts',
    args: [
      '--include-tags',
      'runtime,automation,testing,contracts,device-agents,agent-profiles,agent-tokens,sync,multi-server,server,service-management,services,Health,Version,accounts,users,auth,identity',
    ],
    requires: 'main-api',
    supportsCheck: true,
    groups: ['types', 'openapi'],
  },
  {
    id: 'openapi-dev',
    description: 'Scoped OpenAPI slice for dev/admin/plugins tags (merge-generate or check)',
    script: 'tools/codegen/generate-openapi-types.ts',
    args: [
      '--include-tags',
      'dev,devtools,admin,codegen,plugins,logs,migrations,meta,plans,files,notifications,chat,chat-tabs,community,analyzers,analyses,analysis,analytics,ai,assistants,cache,llm,llm-cache,models,diagnostics,debug,performance,audit,stats,tools,sql,database,docs,ui-catalog,app-map,architecture,introspection,inspector,preview,metadata,git,versioning,import',
    ],
    requires: 'main-api',
    supportsCheck: true,
    groups: ['types', 'openapi'],
  },
  {
    // Audit task (writes nothing): asserts the five openapi-* scopes above stay
    // an exhaustive, non-overlapping partition of the live spec's tags. Named
    // WITHOUT an `openapi-` prefix on purpose — the output-stats resolver
    // prefix-walks `openapi-*` ids back to the canonical openapi dir, which would
    // attribute that dir's file stats to this task. No output to attribute here.
    id: 'tag-partition',
    description:
      'Audit: scoped openapi-* tasks form an exhaustive, non-overlapping tag partition of the live spec',
    script: 'tools/codegen/check-openapi-tag-partition.ts',
    requires: 'main-api',
    supportsCheck: true,
    checkOnly: true,
    groups: ['types', 'openapi'],
  },
  {
    id: 'branded',
    description: 'Generate branded type helpers',
    script: 'tools/codegen/generate-branded-types.ts',
    outputPath: 'packages/shared/types/src/ids.generated.ts',
    supportsCheck: true,
    groups: ['types'],
  },
  {
    id: 'upload-context',
    description: 'Generate upload context schema/types from YAML',
    script: 'tools/codegen/generate-upload-context.ts',
    // Also writes pixsim7/backend/main/shared/upload_context_schema.py — TS file
    // is the more visible artifact, so we surface it as the canonical output.
    outputPath: 'packages/shared/types/src/upload-context.generated.ts',
    supportsCheck: true,
    groups: ['types'],
  },
  {
    id: 'cue',
    description:
      'Generate + lint prompt block-pack schema.yaml/manifest.yaml from CUE sources',
    script: 'tools/codegen/generate-prompt-pack-schemas.ts',
    outputPath: 'pixsim7/backend/main/content_packs/prompt',
    supportsCheck: true,
    groups: ['prompt', 'cue'],
  },
  {
    id: 'cue-grammar',
    description: 'Generate grammar_rules.json (tokenizer grammar) from CUE sources',
    // Also writes packages/core/prompt/src/grammar_rules.json (TS copy); the
    // backend parser copy is surfaced here as the canonical output.
    script: 'tools/codegen/generate-grammar-rules.ts',
    outputPath: 'pixsim7/backend/main/services/prompt/parser/grammar_rules.json',
    supportsCheck: true,
    groups: ['prompt', 'cue'],
  },
  {
    id: 'cue-projection-corpus',
    description: 'Regenerate primitive-projection eval corpus from CUE variants',
    script: 'tools/codegen/generate-primitive-projection-corpus.ts',
    outputPath: 'pixsim7/backend/tests/blocks/evals/primitive_projection/eval_corpus_autogen.json',
    supportsCheck: true,
    groups: ['prompt', 'cue', 'tests'],
  },
  {
    id: 'cue-recipes',
    description: 'Generate relation_recipes.json (operator semantics) from CUE sources',
    script: 'tools/codegen/generate-relation-recipes.ts',
    outputPath: 'pixsim7/backend/main/services/prompt/parser/relation_recipes.json',
    supportsCheck: true,
    groups: ['prompt', 'cue'],
  },
  {
    id: 'app-map',
    description: 'Generate APP_MAP.md and action registry from code',
    script: 'packages/shared/app-map/src/cli.ts',
    outputPath: 'docs/APP_MAP.md',
    supportsCheck: true,
    groups: ['docs'],
  },
  {
    id: 'plugin-codegen',
    description: 'Run plugin-contributed codegen tasks from backend manifests',
    script: 'tools/codegen/run-plugin-codegen.ts',
    // No single output — fans out across plugins. Stats panel hides for this task.
    requires: 'main-api',
    supportsCheck: true,
    groups: ['plugins'],
  },
  {
    id: 'ui-catalog',
    description: 'Generate UI component catalog from shared UI package exports',
    script: 'tools/codegen/generate-ui-catalog.ts',
    outputPath: 'docs/ui-component-catalog.generated.json',
    supportsCheck: true,
    groups: ['docs'],
  },
];

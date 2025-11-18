**Task: Asset Pipeline & Batch Generation Workflows**

**Context**
- Assets are managed via Gallery (`AssetsRoute`), providers (`providerRegistry`), and generation UI plugins (`generationUIPluginRegistry`).
- Designers currently generate assets one-at-a-time or via scattered gallery tools.
- There's no centralized way to:
  - Define generation templates/presets for reusable asset styles.
  - Batch-generate variations (e.g., "generate 5 NPC portraits with these settings").
  - Track asset lineage/versioning for iterative refinement.

**Goal**
Build an **Asset Pipeline** system that:
- Provides **Generation Templates** - reusable provider configs for consistent asset creation.
- Enables **Batch Generation** - queue multiple generation jobs with variations.
- Adds **Asset Versioning** - track parent-child relationships for iterations.
- Creates a **Pipeline Dashboard** - UI for managing templates, batches, and lineage.

**Key Ideas**
- Define generation templates:
  ```ts
  interface GenerationTemplate {
    id: string;
    name: string;                    // 'NPC Portrait - Realistic'
    description?: string;
    providerId: string;              // 'runwayml', 'kling', etc.
    operationType: OperationType;    // 'text-to-video', 'image-to-video'
    baseParams: Record<string, any>; // Provider-specific params
    variableParams?: {               // Parameters that can vary in batch
      [key: string]: {
        type: 'range' | 'list' | 'increment';
        values?: any[];              // For list/enum
        min?: number;                // For range
        max?: number;
        step?: number;
      };
    };
    tags?: string[];
    category?: string;
  }
  ```
- Batch generation job:
  ```ts
  interface BatchJob {
    id: string;
    templateId: string;
    variations: Array<{
      params: Record<string, any>;
      status: 'pending' | 'generating' | 'complete' | 'failed';
      assetId?: number;
    }>;
    createdAt: number;
  }
  ```
- Asset lineage tracking via existing `Asset.source_generation_id`:
  - Tag generations with parent asset ID for iterations.
  - Query asset family trees for versioning.

**Implementation Outline**

1. **Generation Templates Module**
   - New module: `frontend/src/lib/assetPipeline/templates.ts`.
   - Implement:
     - `TemplateStore` with CRUD operations (localStorage or backend).
     - `createTemplateFromGeneration(generation: Generation): GenerationTemplate`.
     - `applyTemplate(template, overrides): GenerationParams`.
   - Store templates in `localStorage` initially (can move to backend later).

2. **Batch Generation Engine**
   - New module: `frontend/src/lib/assetPipeline/batchEngine.ts`.
   - Features:
     - `createBatchJob(template, variationCount, variableOverrides): BatchJob`.
     - `runBatchJob(job): Promise<void>` - queue generations via existing API.
     - Track job progress, update variation statuses.
   - Use existing `submitGeneration` API from `frontend/src/lib/api/generation.ts`.

3. **Asset Lineage Tracking**
   - Leverage existing `Asset.source_generation_id` and `Generation.parent_generation_id`.
   - Add helpers in `frontend/src/lib/api/assets.ts`:
     - `getAssetLineage(assetId): Promise<Asset[]>` - fetch parent/children chain.
     - `createAssetVariation(parentAssetId, params): Promise<Generation>`.
   - Display lineage in AssetDetailPanel (tree or timeline view).

4. **Pipeline Dashboard UI**
   - New route: `frontend/src/routes/AssetPipeline.tsx`.
   - Sections:
     - **Templates Tab**:
       - List saved generation templates.
       - Create template from scratch or from existing generation.
       - Edit/delete/duplicate templates.
     - **Batch Jobs Tab**:
       - Create new batch job from template.
       - Configure variations (e.g., "generate 5 variants with prompt variations").
       - View running/completed batch jobs with progress.
     - **Lineage Explorer** (optional):
       - Select asset, view family tree.
       - "Create variant" action to spawn new generation from selected asset.

5. **Gallery Integration**
   - Add gallery tool: "Save as Template" - converts current generation into template.
   - Add gallery tool: "Create Variant" - uses selected asset as reference for new generation.
   - Integrate batch job results into gallery with special "batch" tag/filter.

**Constraints**
- Use existing generation API (`submitGeneration`) - no new backend endpoints initially.
- Templates stored in frontend (localStorage) to start; backend persistence is Phase 2.
- Asset lineage uses existing `source_generation_id` - no schema changes.

**Success Criteria**
- Designers can create generation templates and reuse them for consistent asset creation.
- Batch generation lets designers queue 5-10 variations with one action.
- Asset lineage is visible in gallery, enabling iterative refinement workflows.

---

## Phase 2: Backend Templates, Advanced Variations & Pipeline Presets

Once basic asset pipeline works, enhance it for production use:

**Phase 2 Goals**
- Move templates to **backend storage** (new table or use `meta` fields).
- Add **smart variations** - AI-suggested parameter ranges based on past generations.
- Introduce **Pipeline Presets** - multi-step workflows (e.g., "generate image → upscale → create video").
- Add **cost estimation** for batch jobs before execution.
- Integrate with **project/workspace** system for team template sharing.

**Features**
- Template versioning and sharing across workspace members.
- Batch job scheduling (run overnight, queue limits).
- Advanced lineage viz (DAG view, diff comparisons between versions).
- Integration with provider quotas/credits (warn if batch will exceed limits).

**Success Criteria**
- Production-ready asset pipeline with team collaboration.
- Designers can run complex multi-step generation workflows with one click.
- Full audit trail of asset evolution from concept to final version.

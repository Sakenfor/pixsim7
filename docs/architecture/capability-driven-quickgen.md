# Capability-Driven QuickGen Architecture

Last updated: 2026-03-11
Owner: contexthub lane
Type: architecture (canonical)
Related plan ID: `contexthub-implementation` (`GET /api/v1/dev/plans/contexthub-implementation`)

## Vision

Panels are fully portable and discover context via capabilities. No panel knows "which widget" it's in. Scoping provides locality preference.

---

## Capability Precedence & Fallback

When multiple providers exist for the same capability:

```
Lookup order:
1. Current scope (e.g., "viewerQuickGenerate")
2. Parent scope (if nested)
3. Global scope ("root")

Priority within same scope:
- Higher priority number wins (provider.priority)
- If equal, most recently registered wins
```

**Required vs Optional capabilities:**
- Required: Panel should show error state if not available (not silent null)
- Optional: Panel gracefully degrades, shows placeholder or omits feature

```tsx
// Required - show error if missing
const { value: assetInput, error } = useCapability(CAP_ASSET_INPUT);
if (error || !assetInput) {
  return <CapabilityError capability="Asset Input" />;
}

// Optional - graceful fallback
const { value: source } = useCapability(CAP_GENERATION_SOURCE);
const mode = source?.mode ?? 'user'; // default to user if not provided
```

---

## Capability Contracts

### CAP_ASSET_INPUT

**Purpose:** Provides asset(s) selected for generation input.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `assets` | `AssetModel[]` | ✓ | Full asset objects |
| `refs` | `AssetRef[]` | ✓ | Asset references (`asset:123`) |
| `ref` | `AssetRef \| null` | ✓ | Primary asset ref (first in list) |
| `supportsMulti` | `boolean` | ✓ | Whether multi-select is supported |
| `selection.count` | `number` | ✓ | Current selection count |
| `selection.min` | `number` | ✓ | Minimum required (0 = optional) |
| `selection.max` | `number` | ✓ | Maximum allowed |
| `selection.mode` | `'single' \| 'multi'` | ✓ | Current selection mode |
| `constraints.types` | `('image'\|'video')[]` | | Allowed media types |
| `constraints.canMixTypes` | `boolean` | | Whether mixed types allowed |
| `status.ready` | `boolean` | ✓ | Whether selection is valid |
| `status.reason` | `string` | | Why not ready (user-facing) |

**Invariants:**
- `refs.length === selection.count`
- If `status.ready === false`, `status.reason` must be provided
- `selection.count >= selection.min && selection.count <= selection.max` when ready

---

### CAP_PROMPT_BOX

**Purpose:** Provides prompt text state and mutation.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `prompt` | `string` | ✓ | Current prompt text |
| `setPrompt` | `(value: string) => void` | ✓ | Update prompt |
| `maxChars` | `number` | | Character limit (model-specific) |
| `operationType` | `OperationType` | | Current operation |
| `providerId` | `string` | | Current provider |

**Invariants:**
- `setPrompt` updates scoped store, not local state
- `maxChars` may change when provider/model changes

---

### CAP_GENERATE_ACTION

**Purpose:** Provides generate function and status.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `canGenerate` | `boolean` | ✓ | Whether generate is allowed |
| `generating` | `boolean` | ✓ | Whether currently generating |
| `error` | `string \| null` | ✓ | Current error message |
| `generate` | `() => Promise<void>` | ✓ | Trigger generation |

**Invariants:**
- `canGenerate` should check: prompt valid, assets valid, not already generating
- `error` cleared on next generate attempt

---

### CAP_GENERATION_SOURCE (NEW)

**Purpose:** Controls whether generation uses user settings or asset's original settings.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `mode` | `'user' \| 'asset'` | ✓ | Current mode |
| `setMode` | `(mode) => void` | ✓ | Change mode |
| `available` | `boolean` | ✓ | Whether asset mode is available |
| `loading` | `boolean` | ✓ | Whether fetching source generation |
| `error` | `string \| null` | | Fetch error message |
| `sourceGeneration` | `object \| null` | | Fetched generation data |
| `resetToUser` | `() => void` | ✓ | Reset to user settings |

**Invariants:**
- `available` is true only when single asset with `sourceGenerationId` is selected
- When `mode === 'asset'` and `loading === false` and `error === null`, `sourceGeneration` must be populated
- `setMode('asset')` when `!available` should no-op or throw

---

## Current Capabilities

```
CAP_ASSET_INPUT      - Asset(s) selected for generation
CAP_PROMPT_BOX       - Prompt text state
CAP_GENERATE_ACTION  - Generate function + status
CAP_GENERATION_CONTEXT - Metadata about generation context
```

## Proposed Panel Roles

### 1. Asset Input Panel (`quickgen-asset`)

**Provides:** `CAP_ASSET_INPUT`

Just displays and manages asset selection. Doesn't know about prompts or settings.

```tsx
// Any panel that shows selectable assets can provide this
useProvideCapability(CAP_ASSET_INPUT, {
  getValue: () => ({
    assets: selectedAssets,
    refs: assetRefs,
    selection: { count, min, max, mode },
    constraints: { types, canMixTypes },
    status: { ready: true } | { ready: false, reason: "..." }
  })
});
```

### 2. Prompt Panel (`quickgen-prompt`)

**Provides:** `CAP_PROMPT_BOX`
**Consumes:** Nothing directly (reads from scoped store)

```tsx
useProvideCapability(CAP_PROMPT_BOX, {
  getValue: () => ({
    prompt,
    setPrompt,
    maxChars,
    operationType,
  })
});
```

### 3. Settings Panel (`quickgen-settings`)

**Provides:** `CAP_GENERATE_ACTION`
**Consumes:** `CAP_PROMPT_BOX`, `CAP_ASSET_INPUT`

```tsx
const { value: promptBox } = useCapability(CAP_PROMPT_BOX);
const { value: assetInput } = useCapability(CAP_ASSET_INPUT);

const canGenerate = promptBox?.prompt?.trim().length > 0
  && assetInput?.status?.ready;

useProvideCapability(CAP_GENERATE_ACTION, {
  getValue: () => ({
    canGenerate,
    generating,
    error,
    generate: handleGenerate,
  })
});
```

## New Capability: Generation Source

For the "asset mode" vs "my settings" concept:

```tsx
CAP_GENERATION_SOURCE = defineCapability<GenerationSourceContext>('generation-source');

interface GenerationSourceContext {
  mode: 'user' | 'asset';

  // When mode='asset', provides original generation data
  sourceGeneration?: {
    id: number;
    prompt: string;
    operationType: OperationType;
    providerId: string;
    params: Record<string, any>;
  };

  // Actions
  setMode: (mode: 'user' | 'asset') => void;
  loadFromAsset: (generationId: number) => Promise<void>;
}
```

### 4. Generation Source Panel (`quickgen-source`) - NEW

**Provides:** `CAP_GENERATION_SOURCE`
**Consumes:** `CAP_ASSET_INPUT` (to check if asset has source generation)

Small panel or inline toggle that:
- Shows mode toggle (User Settings / Asset Original)
- Fetches asset's source generation when needed
- Updates scoped stores when mode changes

```tsx
function GenerationSourcePanel() {
  const { value: assetInput } = useCapability(CAP_ASSET_INPUT);
  const [mode, setMode] = useState<'user' | 'asset'>('user');
  const [sourceGeneration, setSourceGeneration] = useState(null);

  const asset = assetInput?.assets?.[0];
  const hasSourceGeneration = !!asset?.sourceGenerationId;

  // Fetch when switching to asset mode
  useEffect(() => {
    if (mode === 'asset' && hasSourceGeneration) {
      fetchGeneration(asset.sourceGenerationId).then(gen => {
        setSourceGeneration(gen);
        // Populate scoped stores
        sessionStore.setPrompt(gen.finalPrompt);
        sessionStore.setOperationType(gen.operationType);
        // etc.
      });
    }
  }, [mode, asset?.sourceGenerationId]);

  useProvideCapability(CAP_GENERATION_SOURCE, {
    getValue: () => ({ mode, sourceGeneration, setMode, loadFromAsset })
  });

  return (
    <ModeToggle
      mode={mode}
      onModeChange={setMode}
      disabled={!hasSourceGeneration}
    />
  );
}
```

## Widget Composition

Widgets provide:
1. **Scope** via `GenerationScopeProvider`
2. **Capability providers** in their chrome (header/footer) - NOT panels
3. **Panel arrangement** via SmartDockview

### Control Center

No source toggle needed - always uses user settings.

```tsx
function ControlCenterQuickGen() {
  return (
    <GenerationScopeProvider scopeId="global">
      <SmartDockview panels={['quickgen-asset', 'quickgen-prompt', 'quickgen-settings']} />
    </GenerationScopeProvider>
  );
}
```

### Asset Viewer

Has source toggle in header chrome (not a panel).

```tsx
function ViewerQuickGenerate({ asset }: { asset: ViewerAsset }) {
  return (
    <GenerationScopeProvider scopeId="viewerQuickGenerate">
      {/* Chrome: capability providers */}
      <div className="header">
        <GenerationSourceToggle asset={asset} />  {/* provides CAP_GENERATION_SOURCE */}
        <ViewerAssetProvider asset={asset} />     {/* provides CAP_ASSET_INPUT */}
      </div>

      {/* Panels: just consume capabilities */}
      <SmartDockview panels={['quickgen-prompt', 'quickgen-settings']} />
    </GenerationScopeProvider>
  );
}
```

### Any New Widget

Just needs scope + any capability providers relevant to its context.

```tsx
function SceneGenerateWidget({ scene }: { scene: Scene }) {
  return (
    <GenerationScopeProvider scopeId={`scene:${scene.id}`}>
      {/* Chrome: scene-specific capability providers */}
      <SceneAssetProvider scene={scene} />  {/* provides CAP_ASSET_INPUT from scene */}

      {/* Same panels work here too */}
      <SmartDockview panels={['quickgen-prompt', 'quickgen-settings']} />
    </GenerationScopeProvider>
  );
}
```

## Capability Scoping

Panels prefer capabilities from their local scope:

```
Widget A (scope: "widgetA")
├── Panel 1: provides CAP_ASSET_INPUT (scope: widgetA)
├── Panel 2: provides CAP_PROMPT_BOX (scope: widgetA)
└── Panel 3: consumes CAP_PROMPT_BOX
    → prefers widgetA scope, falls back to global

Widget B (scope: "widgetB")
├── Panel 4: provides CAP_PROMPT_BOX (scope: widgetB)
└── Panel 5: consumes CAP_PROMPT_BOX
    → gets widgetB's, not widgetA's
```

## Migration Path

1. **Define `CAP_GENERATION_SOURCE` capability** in contextHub
2. **Create `GenerationSourceToggle` component** (chrome, not panel) with mode toggle + fetching logic
3. **Extract `ViewerAssetProvider` component** that provides `CAP_ASSET_INPUT` for viewed asset
4. **Refactor ViewerQuickGenerate** to use chrome components instead of inline logic
5. **Update panels** to optionally consume `CAP_GENERATION_SOURCE` (graceful fallback to 'user' mode)
6. **Test** that CC and Viewer both work with same panels
7. **Document** the capability contracts for future widgets

---

## Generation Source Toggle (Widget Chrome Component)

**Not a panel** - a component rendered in widget header/chrome that provides `CAP_GENERATION_SOURCE`.

```tsx
interface GenerationSourceToggleProps {
  asset: ViewerAsset | null;
}

function GenerationSourceToggle({ asset }: GenerationSourceToggleProps) {
  const [mode, setMode] = useState<'user' | 'asset'>('user');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceGeneration, setSourceGeneration] = useState<GenerationModel | null>(null);

  const { useSessionStore } = useGenerationScopeStores();
  const sessionStore = useSessionStore;

  const hasSourceGeneration = !!asset?.sourceGenerationId;
  const available = hasSourceGeneration && asset?.selection?.count === 1;

  // Fetch when switching to asset mode
  useEffect(() => {
    if (mode !== 'asset' || !available || !asset?.sourceGenerationId) return;

    setLoading(true);
    setError(null);

    getGeneration(asset.sourceGenerationId)
      .then(response => {
        const gen = fromGenerationResponse(response);
        setSourceGeneration(gen);

        // Populate scoped stores (single source of truth for asset mode)
        const state = getGenerationSessionStore(scopeId).getState();
        state.setPrompt(gen.finalPrompt || '');
        state.setOperationType(gen.operationType as OperationType);
        state.setProvider(gen.providerId);
        state.setPresetParams(gen.canonicalParams || gen.rawParams || {});
      })
      .catch(err => {
        // Handle permission errors gracefully
        if (err.status === 403) {
          setError('You do not have access to this generation');
        } else {
          setError('Failed to load original settings');
        }
        setMode('user'); // Fall back to user mode
      })
      .finally(() => setLoading(false));
  }, [mode, available, asset?.sourceGenerationId]);

  // Reset when asset changes
  useEffect(() => {
    setSourceGeneration(null);
    setError(null);
    if (!available && mode === 'asset') {
      setMode('user');
    }
  }, [asset?.id]);

  const resetToUser = useCallback(() => {
    setMode('user');
    setSourceGeneration(null);
    // Optionally reset stores to defaults or leave as-is
  }, []);

  useProvideCapability(CAP_GENERATION_SOURCE, {
    id: 'generation-source:toggle',
    label: 'Generation Source',
    priority: 50,
    getValue: () => ({
      mode,
      setMode: (m) => available || m === 'user' ? setMode(m) : undefined,
      available,
      loading,
      error,
      sourceGeneration,
      resetToUser,
    }),
  }, [mode, available, loading, error, sourceGeneration]);

  // Render toggle UI
  return (
    <div className="flex items-center gap-2">
      <SegmentedControl
        value={mode}
        onChange={setMode}
        options={[
          { value: 'user', label: 'My Settings' },
          { value: 'asset', label: 'Original', disabled: !available },
        ]}
      />
      {loading && <Spinner size="xs" />}
      {error && <ErrorBadge message={error} />}
    </div>
  );
}
```

---

## Error Handling & Edge Cases

### No source_generation_id
- `available` is false
- Asset mode button disabled
- Tooltip: "This asset has no generation history"

### Fetch fails (network/server error)
- Show error badge in toggle
- Auto-reset to user mode
- Error message in `CAP_GENERATION_SOURCE.error`

### Permission denied (403)
- Show "You do not have access to this generation"
- Auto-reset to user mode
- Don't expose generation data

### Incompatible operation
- Example: Source was `video_extend`, but current widget only supports `image_to_video`
- Options:
  1. Show warning but allow (user can change op type)
  2. Auto-switch operation type to match source
  3. Disable asset mode for incompatible sources
- **Recommendation:** Option 2 - auto-switch, with visual indicator showing "Switched to video_extend"

### Multi-asset selection
- `CAP_GENERATION_SOURCE.available` is false when `selection.count !== 1`
- Asset mode only activates for single asset with lineage
- For transitions/fusion: each asset could have its own source, but that's complex - defer to user mode

---

## Hydration & Loading States

### Store hydration
- Zustand persist middleware hydrates from localStorage on mount
- During hydration, stores may have default values briefly

**Panel behavior during hydration:**
```tsx
function PromptPanel() {
  const { useSessionStore } = useGenerationScopeStores();
  const prompt = useSessionStore(s => s.prompt);
  const hydrated = useSessionStore(s => s._hasHydrated); // if we track this

  if (!hydrated) {
    return <Skeleton />; // or null to avoid flicker
  }

  return <PromptInput value={prompt} />;
}
```

**Alternative:** Accept brief default state, rely on quick hydration (~10-50ms).

### Capability loading
- `useCapability` returns `{ value, loading, error }`
- Panels should check `loading` before assuming null means "not provided"

```tsx
const { value: source, loading } = useCapability(CAP_GENERATION_SOURCE);

if (loading) return <Skeleton />;
if (!source) {
  // Capability truly not provided - this widget doesn't have source toggle
  // Fall back to 'user' mode behavior
}
```

---

## Store Mutation Ownership

**Single writer principle:** Only one component should mutate stores for a given concern.

| Concern | Owner | Other components |
|---------|-------|------------------|
| Prompt text | `PromptPanel` via `CAP_PROMPT_BOX.setPrompt` | Read only |
| Operation type | `SettingsPanel` | Read only |
| Provider/model | `SettingsPanel` | Read only |
| Asset mode population | `GenerationSourceToggle` | Read `CAP_GENERATION_SOURCE` |

When `GenerationSourceToggle` switches to asset mode:
1. It fetches the source generation
2. It populates the session store
3. Other panels react to store changes
4. Panels treat `CAP_GENERATION_SOURCE` as read-only context

---

## Benefits

- **Portable panels**: Drop quickgen-prompt anywhere, it just works
- **Composable**: Mix and match panels freely
- **Extensible**: New widgets don't need special code
- **Testable**: Each panel has clear capability contract
- **Discoverable**: Capabilities are self-documenting
- **Predictable**: Clear ownership of state mutations
- **Graceful degradation**: Handles missing capabilities, errors, loading states

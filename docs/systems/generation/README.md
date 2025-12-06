# Generation System Documentation

This directory contains all generation system documentation for PixSim7's content generation pipeline.

## Documentation Files

### Core System Docs

- **[GENERATION_SYSTEM.md](GENERATION_SYSTEM.md)** - Generation system overview
  - Foundation and architecture
  - Pipeline overview
  - Generation modes and workflows
  - Originally: `GENERATION_SYSTEM.md`

- **[GENERATION_GUIDE.md](GENERATION_GUIDE.md)** - Developer guide for generation
  - Action block generation
  - Building generation workflows
  - Best practices and examples
  - Originally: `ACTION_BLOCK_GENERATION_GUIDE.md`

- **[GENERATION_ALIAS_CONVENTIONS.md](GENERATION_ALIAS_CONVENTIONS.md)** - Naming conventions
  - Alias patterns and conventions
  - Generation type naming
  - Standardized identifiers

### Advanced Features

- **[REALTIME_VIDEO_GENERATION.md](REALTIME_VIDEO_GENERATION.md)** - Realtime video generation
  - Streaming video generation
  - Real-time processing
  - Performance considerations

- **[INTIMACY_AND_GENERATION.md](INTIMACY_AND_GENERATION.md)** - Intimacy-aware generation
  - Relationship context in generation
  - Intimacy-gated content
  - Social context integration

- **[GENERATION_STATUS.md](GENERATION_STATUS.md)** - Generation status integration
  - Status tracking and display
  - Integration with UI components
  - Status lifecycle
  - Originally: `apps/main/docs/generation-status-integration.md`

### Plugin Integration

- **[GENERATION_NODE_PLUGIN.md](GENERATION_NODE_PLUGIN.md)** - Generation node plugin
  - Plugin-based generation nodes
  - Extensible generation system
  - Custom generation types

## Related Documentation

### Action System Integration

Located in `docs/`:
- `ACTION_BLOCKS_UNIFIED_SYSTEM.md` - Action block system
- `ACTION_ENGINE_USAGE.md` - Action engine
- `ACTION_PROMPT_ENGINE_SPEC.md` - Prompt engine spec

### Provider Integration

- `docs/PROVIDER_CAPABILITY_REGISTRY.md` - Provider capabilities
- `docs/CROSS_PROVIDER_ASSETS.md` - Cross-provider asset handling

### Claude Tasks

Generation-related tasks in `claude-tasks/`:
- `10-unified-generation-pipeline-and-dev-tools.md`
- `115-pixverse-generation-settings-and-control-center-integration.md`
- `116-generation-pipeline-drift-audit.md`
- `117-generation-pipeline-drift-fixes.md`
- `118-plugin-owned-generation-aliases.md`
- `128-drop-legacy-generation-payloads.md`
- `129-shared-generation-workbench.md`
- `131-generation-status-surface.md`

### Archived Documentation

See `docs/archive/generation/` for historical docs:

**Refactor Plans** (`refactor-plans/`):
- `GENERATION_PIPELINE_REFACTOR_PLAN.md` - Pipeline refactor plan
- `GENERATION_SERVICE_SPLIT.md` - Service split design
- `EXAMPLE_GENERATION_API_SPLIT.md` - API split example
- `generation-flow-fixes.md` - Flow fixes plan

**Evolution** (`evolution/`):
- `GENERATION_CONFIG_EVOLUTION.md` - Config evolution history

**Issues & Audits**:
- `GENERATION_SYSTEM_ISSUES.md` - Historical issues
- `TASK_generation_drift_audit.md` - Drift audit results

## Quick Start

**New to generation system?**
1. Start with [GENERATION_SYSTEM.md](GENERATION_SYSTEM.md) for overview
2. Read [GENERATION_GUIDE.md](GENERATION_GUIDE.md) to build generation workflows
3. Check [GENERATION_ALIAS_CONVENTIONS.md](GENERATION_ALIAS_CONVENTIONS.md) for naming
4. See [GENERATION_STATUS.md](GENERATION_STATUS.md) for status integration

**Implementing specific features?**
- **Realtime video**: See [REALTIME_VIDEO_GENERATION.md](REALTIME_VIDEO_GENERATION.md)
- **Intimacy-aware**: See [INTIMACY_AND_GENERATION.md](INTIMACY_AND_GENERATION.md)
- **Plugin nodes**: See [GENERATION_NODE_PLUGIN.md](GENERATION_NODE_PLUGIN.md)

## Architecture Overview

The generation system consists of:

1. **Pipeline**: Unified generation pipeline handling all content types
2. **Providers**: Integration with external generation services (Pix verse, etc.)
3. **Status Tracking**: Real-time status updates and UI integration
4. **Action Blocks**: Composable generation workflows
5. **Context Integration**: Social context, intimacy, relationships

See [GENERATION_SYSTEM.md](GENERATION_SYSTEM.md) for detailed architecture.

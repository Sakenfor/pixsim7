# Architecture Documentation

This directory contains architectural documentation for PixSim7 — specs, design explorations, implementation plans, and system analysis.

## Contents

### Active Architecture Tracks

**Prompt System**
- [Prompt Resolver `next_v1` Spec](./prompt-resolver-next-v1.md) - Parallel resolver architecture, interfaces, and migration strategy.
- [Prompt Resolver Workbench Roadmap](./prompt-resolver-workbench-roadmap.md) - Multi-iteration implementation plan and handoff guide.
- [Prompt Template Controls Backlog](./prompt-template-controls-backlog.md) - SlotKey migration, theme modifier packs.
- [Parser/Vocab Authority Analysis](./parser-vocab-authority.md) - Keyword authority across parser/vocabulary/ontology systems.

**Generation Pipeline**
- [Generation Execution Backend Contract](./GENERATION_EXECUTION_BACKEND_CONTRACT.md) - Plan/policy/execution separation for generation orchestration.
- [Sequential Generation Design](./SEQUENTIAL_GENERATION_DESIGN.md) - Chain entity, backend executor, gen_step node type.
- [Generation Tracking Contract](./generation-tracking-contract.md) - Unified read-only API for generation provenance.

**System Architecture**
- [Scene Concepts Map](./scene-concepts-map.md) - Distinguishes Scene Prep vs game/runtime scenes vs legacy scene concepts.
- [Capability-Driven QuickGen](./capability-driven-quickgen.md) - ContextHub capability contracts for portable QuickGen panels.
- [Generic Links](./generic-links.md) - Template-to-runtime link pattern (ObjectLink, FieldMapping, activation).
- [Backend Game Extraction](./backend-game-extraction.md) - Dual-DB monolith plan for game data isolation.
  - [Plain English Summary](./backend-game-extraction-summary.md)
- [Local LLM Prompt Analyzer](./local-llm-prompt-analyzer.md) - llama-cpp-python integration plan.
- [Asset Versioning System](./ASSET_VERSIONING_SYSTEM.md) - Asset version families and revision tracking.

### Completed (historical reference)
- [Sync Synthetic Generation](./sync-synthetic-generation-plan.md) - Synthetic generation records for synced assets. **Fully implemented.**
- [Shared Packages Domain Reorg](./shared-packages-domain-reorg.md) - `packages/shared` rename to dotted form. **Fully implemented.**

### Reference
- [Action Registry](./action-registry.md) - Auto-generated action table from module pages.
- [Spatial Model](./spatial-model.md)
- [Dockview Architecture](./dockview.md)
- [Plugin Architecture](./plugins.md)
- [Generic Game Objects](./generic-game-objects.md)
- [Diagrams](./diagrams.md)

### [Subsystems](./subsystems/README.md)
Detailed architecture documentation for specific subsystems:
- Launcher architecture
- NPC architecture
- UI architecture

### [Reviews](./reviews/)
Architectural reviews, audits, and analysis.

### [Decisions](../decisions/README.md)
Architecture Decision Records (ADRs) documenting key technical decisions.

## Related Documentation

- [Infrastructure](../infrastructure/) - Backend startup, Alembic, launcher, operational docs.
- [Systems](../systems/) - System-specific documentation (plugins, generation, etc.)
- [Repository Map](../repo-map.md) - Current codebase structure
- [Getting Started](../getting-started/README.md) - Setup and quick start

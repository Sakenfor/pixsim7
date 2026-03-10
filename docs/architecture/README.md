# Architecture Documentation

This directory contains architectural documentation for PixSim7 — specs, design explorations, implementation plans, and system analysis.

## Contents

### Active Architecture Tracks

**Execution Status**
- [Ongoing Work Status](../plans/active/ongoing-work-status/plan.md) - Live status board for current in-progress lanes.

**Block & Prompt System**
- [Block Primitives Evolution](./block-primitives-evolution.md) - **Canonical doc** for block systems. Covers BlockPrimitive model, PromptBlock retirement, composition paths, and migration status.
- [Prompt Resolver `next_v1` Spec](./prompt-resolver-next-v1.md) - Parallel resolver architecture, interfaces, and migration strategy.
- [Prompt Resolver Workbench Roadmap](../plans/active/prompt-resolver-roadmap/plan.md) - Multi-iteration implementation plan and handoff guide.
- [Prompt Template Controls Backlog](../plans/active/prompt-template-controls/plan.md) - SlotKey migration, theme modifier packs.
- [Parser/Vocab Authority Analysis](./parser-vocab-authority.md) - Keyword authority across parser/vocabulary/ontology systems.
- [Versioning Systems Map](./versioning-systems-map.md) - Layered map of shared versioning core vs prompt git workflows.

**Generation Pipeline**
- [Generation Execution Backend Contract](./GENERATION_EXECUTION_BACKEND_CONTRACT.md) - Plan/policy/execution separation for generation orchestration.
- [Sequential Generation Design](./SEQUENTIAL_GENERATION_DESIGN.md) - Chain entity, backend executor, gen_step node type.
- [Generation Tracking Contract](./generation-tracking-contract.md) - Unified read-only API for generation provenance.

**System Architecture**
- [Scene Concepts Map](./scene-concepts-map.md) - Distinguishes Scene Prep vs game/runtime scenes vs legacy scene concepts.
- [ContextHub Authoring Context Plan](../plans/active/contexthub-implementation/plan.md) - Canonical rollout plan for project/world context inheritance across panels.
- [HMR Stability Plan](./hmr-stability.md) - Runtime identity hardening + wildcard barrel reduction strategy for stable frontend hot-reload behavior.
- [Capability-Driven QuickGen](./capability-driven-quickgen.md) - ContextHub capability contracts for portable QuickGen panels.
- [Generic Links](./generic-links.md) - Template-to-runtime link pattern (ObjectLink, FieldMapping, activation).
- [Backend Game Extraction](./backend-game-extraction.md) - Dual-DB monolith plan for game data isolation.
  - [Plain English Summary](./backend-game-extraction-summary.md)
- [Local LLM Prompt Analyzer](./local-llm-prompt-analyzer.md) - llama-cpp-python integration plan.
- [Analyzer + AI Hub LLM Resolution Policy](./analyzer-aihub-llm-resolution-policy.md) - Canonical provider/model fallback policy for shared LLM runtime.
- [Asset Versioning System](./ASSET_VERSIONING_SYSTEM.md) - Asset version families and revision tracking.

**Plans & Roadmaps** — see [`docs/plans/`](../plans/)
- [Active plans](../plans/active/) — contexthub, prompt resolver, app map graph, template controls
- [Parked plans](../plans/parked/) — extension platform unification
- [Done](../plans/done/) — analyzer consolidation, role kernel consolidation

### Snapshots (historical reference)
- [Prompt Pipeline Current State](./prompt-pipeline-current-state.md) - Pre-redesign snapshot of compiler/resolver pipeline. **Superseded by** [Block Primitives Evolution](./block-primitives-evolution.md) for current block system state.

### Completed (archived)
- [Sync Synthetic Generation](../archive/completed/sync-synthetic-generation-plan.md) - Synthetic generation records for synced assets. **Fully implemented.**
- [Shared Packages Domain Reorg](../archive/completed/shared-packages-domain-reorg.md) - `packages/shared` rename to dotted form. **Fully implemented.**

### Reference
- [Action Registry](./action-registry.md) - Auto-generated action table from module pages.
- [Spatial Model](./spatial-model.md)
- [Dockview Architecture](./dockview.md)
- [Gizmo Component Organization](./gizmo-component-organization.md)
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

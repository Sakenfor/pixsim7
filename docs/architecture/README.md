# Architecture Documentation

This directory contains architectural documentation for PixSim7: specs, design explorations, implementation notes, and system analysis.

## Contents

### Active Architecture Tracks

Execution status:
- [Plans Registry](../plans/README.md) - DB-first status and governance
- [DB-first Plans + Meta Contracts](../reference/db-first-plans-and-meta-contracts.md) - API workflow for plan updates and contract discovery

Block and prompt system:
- [Block Primitives Evolution](./block-primitives-evolution.md) - Canonical architecture companion for block systems and migration status
- [Prompt Pack Tag Authority Contract](./prompt-pack-tag-authority.md) - Authority split for `prompt_block_tags` vs pack `op` contracts
- [Prompt Resolver `next_v1` Spec](./prompt-resolver-next-v1.md) - Parallel resolver architecture and migration strategy
- [Parser/Vocab Authority Analysis](./parser-vocab-authority.md) - Keyword authority across parser/vocabulary/ontology systems
- [Versioning Systems Map](./versioning-systems-map.md) - Shared versioning core vs prompt git workflows

Generation pipeline:
- [Generation Execution Backend Contract](./GENERATION_EXECUTION_BACKEND_CONTRACT.md) - Plan/policy/execution separation
- [Sequential Generation Design](./SEQUENTIAL_GENERATION_DESIGN.md) - Chain entity, backend executor, gen_step node type
- [Generation Tracking Contract](./generation-tracking-contract.md) - Read-only API for generation provenance

System architecture:
- [Scene Concepts Map](./scene-concepts-map.md) - Scene prep vs runtime scene distinctions
- [HMR Stability Plan](./hmr-stability.md) - Runtime identity hardening and wildcard reduction strategy
- [Capability-Driven QuickGen](./capability-driven-quickgen.md) - Capability contracts for portable QuickGen panels
- [Generic Links](./generic-links.md) - Template-to-runtime link pattern
- [Backend Game Extraction](./backend-game-extraction.md) - Dual-DB monolith plan for game data isolation
  - [Plain English Summary](./backend-game-extraction-summary.md)
- [Local LLM Prompt Analyzer](./local-llm-prompt-analyzer.md) - llama-cpp-python integration plan
- [Analyzer + AI Hub LLM Resolution Policy](./analyzer-aihub-llm-resolution-policy.md) - Provider/model fallback policy
- [Asset Versioning System](./ASSET_VERSIONING_SYSTEM.md) - Asset version families and revision tracking

Plans and roadmaps:
- [Plans Registry](../plans/README.md) - DB-first plan governance
- [DB-first Plans + Meta Contracts](../reference/db-first-plans-and-meta-contracts.md) - Plan API usage and contract discovery

### Snapshots (historical reference)
- [Prompt Pipeline Current State](./prompt-pipeline-current-state.md) - Pre-redesign snapshot; superseded by [Block Primitives Evolution](./block-primitives-evolution.md)

### Completed (archived)
- [Sync Synthetic Generation](../archive/completed/sync-synthetic-generation-plan.md) - Fully implemented
- [Shared Packages Domain Reorg](../archive/completed/shared-packages-domain-reorg.md) - Fully implemented

### Reference
- [Action Registry](./action-registry.md) - Auto-generated action table from module pages
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

- [Infrastructure](../infrastructure/) - Backend startup, Alembic, launcher, operational docs
- [Systems](../systems/) - System-specific documentation (plugins, generation, etc.)
- [Repository Map](../repo-map.md) - Current codebase structure
- [Getting Started](../getting-started/README.md) - Setup and quick start

# Documentation Cleanup Report — 2026-03-03

## Summary

Cleaned the `docs/` tree to reduce duplication, fix stale paths, relocate orphaned files into canonical subdirectories, and improve navigation hub coverage.

## Deleted Files

| File | Reason |
|------|--------|
| `docs/ui/GAME_WORLD_DISPLAY_MODES.md` | 5-line redirect stub; actual content lives in `docs/game-systems/GAME_WORLD_DISPLAY_MODES.md` |
| `docs/getting-started/ADMIN_PANEL.md` | 5-line deprecated stub ("SvelteKit admin panel has been removed") |
| `docs/reference/SESSION_HELPER_REFERENCE.md` | Exact duplicate of `docs/generated/SESSION_HELPERS.md` |
| `docs/archive/architecture-repo-map.md` | Superseded by `docs/repo-map.md` (current, maintained) |

## Relocated Files

| Original Path | New Path | Reason |
|---------------|----------|--------|
| `docs/prompt-template-system-current-state.md` | `docs/prompts/template-system-current-state.md` | Top-level orphan → proper subdirectory |
| `docs/prompt-template-system-target-architecture.md` | `docs/prompts/template-system-target-architecture.md` | Top-level orphan → proper subdirectory |
| `docs/prompt-block-tag-dictionary-alias-api.md` | `docs/prompts/tag-dictionary-alias-api.md` | Top-level orphan → proper subdirectory |
| `docs/prompt-guidance-plan-v1.md` | `docs/prompts/guidance-plan-v1.md` | Top-level orphan → proper subdirectory |
| `docs/ai-command-provider-design.md` | `docs/systems/generation/ai-command-provider-design.md` | Top-level orphan → proper subdirectory |

## Merged Directories

| Source | Target | Details |
|--------|--------|---------|
| `docs/game/` | `docs/game-systems/` | 8 files moved (NPC zones, interactions, relationships). `game/README.md` converted to redirect. game-systems/README.md updated with merged sections. |

## Archived (completed plans)

| File | Moved To |
|------|----------|
| `docs/architecture/sync-synthetic-generation-plan.md` | `docs/archive/completed/` (marked fully implemented) |
| `docs/architecture/shared-packages-domain-reorg.md` | `docs/archive/completed/` (marked completed) |

## Cross-Reference Fixes

- `docs/architecture/SEQUENTIAL_GENERATION_DESIGN.md` — 4 path references updated to new prompt doc locations
- `docs/prompts/template-system-target-architecture.md` — internal cross-ref updated
- `docs/systems/plugins/PLUGIN_ARCHITECTURE.md`, `workspace.md`, `PLUGIN_CATALOG.md`, `PLUGIN_LOADER_SYSTEM.md` — `SESSION_HELPER_REFERENCE.md` links updated to `generated/SESSION_HELPERS.md`
- `docs/getting-started/README.md` — removed ADMIN_PANEL entry
- `docs/ui/README.md` — removed display modes redirect entry
- `docs/reference/README.md` — SESSION_HELPER_REFERENCE → generated/SESSION_HELPERS
- `docs/archive/README.md` — added `actions-legacy/` entry and clarified `completed/` description
- `docs/architecture/README.md` — updated completed section links to archive paths

## Navigation Hub Updates

| Hub | Changes |
|-----|---------|
| `docs/README.md` | Added Backend Services, API Endpoints, Generation, Reviews, Guides, Agent Guidelines. Removed broken audits link, stale actions link. Simplified conventions section. |
| `docs/index.md` | Expanded from 2 links to full key-references hub (README, App Map, Repo Map, Architecture, Ongoing Work Status). |
| `docs/prompts/README.md` | Added 4 relocated template/guidance docs. Fixed broken PROMPT_SYSTEM_REVIEW link. Added related links to block-primitives and resolver docs. |
| `docs/game-systems/README.md` | Added NPC & Zone Systems, Interaction System, and Relationships sections from merged game/ docs. |

## Canonical Map (post-cleanup)

| Topic | Canonical Doc |
|-------|---------------|
| **Architecture overview** | `docs/architecture/README.md` |
| **Block/primitives system** | `docs/architecture/block-primitives-evolution.md` |
| **Game systems** | `docs/game-systems/SYSTEM_OVERVIEW.md` |
| **Prompt templates** | `docs/prompts/template-system-current-state.md` |
| **Prompt resolver** | `docs/architecture/prompt-resolver-next-v1.md` |
| **Plugin system** | `docs/systems/plugins/PLUGIN_ARCHITECTURE.md` |
| **Generation pipeline** | `docs/systems/generation/overview.md` |
| **Backend services** | `docs/backend/SERVICES.md` |
| **Backend domain map** | `docs/infrastructure/backend-domain-map.md` |
| **NPC architecture** | `docs/architecture/subsystems/npc-architecture.md` |
| **NPC behavior** | `docs/behavior_system/README.md` |
| **Narrative engine** | `docs/narrative/ENGINE_SPECIFICATION.md` |
| **Dockview/panels** | `docs/architecture/dockview.md` |
| **Feature/route index** | `docs/APP_MAP.md` (auto-generated) |
| **Codebase structure** | `docs/repo-map.md` |
| **Ongoing work** | `docs/architecture/ongoing-work-status.md` |
| **ADRs** | `docs/decisions/README.md` |

## Residual Risks / Manual Verification Needed

1. **`docs/frontend/FRONTEND_COMPONENT_GUIDE.md`** — references stale paths (`stores/controlCenterStore.ts`, `components/control/ControlCenterDock.tsx`). These components have moved to `features/controlCenter/`. Low priority since the doc itself is a lightweight guide.

2. **`docs/game/` directory** — still exists with a redirect README. Could be fully removed once all consumers have updated. The 136 legacy task files in `docs/archive/claude-tasks-legacy/` are untouched.

3. **`docs/architecture/plugins.md`** — this is an ADR about gizmo organization, not a plugin system doc. Its filename is misleading vs `docs/systems/plugins/PLUGIN_ARCHITECTURE.md`. Consider renaming to `gizmo-organization-adr.md`.

4. **`docs/infrastructure/BACKEND_MODERNIZATION.md`** — marked "Status: Completed" but kept in active infrastructure/ directory. Could be archived to `archive/completed/`.

5. **`docs/archive/deprecated-docs/`** — contains `UNIFIED_PLUGIN_SYSTEM.md` and `extension-architecture.md` which overlap with current ADRs. These are already in archive so low risk.

6. **`docs/reviews/`** (top-level) — 3 review files exist alongside `docs/architecture/reviews/`. Consider merging into one reviews location.

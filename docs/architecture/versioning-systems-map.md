# Versioning Systems Map

Last updated: 2026-03-11
Owner: versioning lane
Type: architecture (canonical)

## Purpose
Clarify how the shared git-like versioning core and prompt-specific git workflows relate, and where each responsibility belongs.

## Related Docs

- [Prompt Versioning System](../prompts/PROMPT_VERSIONING_SYSTEM.md) — domain-specific implementation details for prompt families, branches, and merge.
- [Asset Versioning System Design](./ASSET_VERSIONING_SYSTEM.md) — draft design for asset version families and iteration tracking.

This map is the canonical entry point for understanding how the shared versioning core connects to each domain adapter.

## Layered Architecture

| Layer | Scope | Main Files | Responsibility |
|---|---|---|---|
| 1. Shared Versioning Core | Cross-domain | `services/versioning/base.py` | Family/entity timeline, ancestry, next version allocation, optional HEAD management |
| 2. Domain Adapters | Per domain | `services/asset/versioning.py`, `services/characters/versioning.py`, `services/prompt/git/versioning_adapter.py` | Map domain models/field names to shared core |
| 3. Prompt Git Workflows | Prompt only | `services/prompt/git/branch.py`, `services/prompt/git/merge.py`, `services/prompt/git/operations.py` | Branching, merge strategies, cherry-pick/revert, prompt-specific activity views |
| 4. API/Facade Layer | Backward-compatible entrypoints | `services/prompt/version.py`, `api/v1/prompts/*` | Public interface and compatibility routing |

## How They Connect

1. Core operations (version numbers, timeline, ancestry) come from layer 1 via layer 2 adapters.
2. Prompt git workflows in layer 3 use the prompt adapter for graph/history reads and `PromptFamilyService.create_version(...)` for writes.
3. API routes can use compatibility services, but version creation should still use the shared allocator path.
4. `PromptVersioningService.create_version(...)` is intentionally disabled to prevent split write paths.

## Single Allocator Rule

All version creation paths should allocate version numbers through:

- `VersioningServiceBase.get_next_version_number(..., lock=True)`
- Public write entrypoint: `PromptFamilyService.create_version(...)`

This avoids duplicated max+1 logic and prevents duplicate version numbers during concurrent writes.

## What Should Not Be Merged

- Do not merge prompt branch/merge/cherry-pick logic into the shared base.
- Keep shared base generic and domain-agnostic.
- Keep prompt git workflows as a prompt-only layer on top of the adapter.

## Practical Ownership

- Shared core: concurrency-safe version math and graph traversal.
- Domain adapters: field mapping and domain metadata projection.
- Prompt git workflows: high-level authoring workflows.
- Compatibility facade: stable API surface during refactors.

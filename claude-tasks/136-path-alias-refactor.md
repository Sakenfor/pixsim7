# Task 136: Path Alias & Barrel Refactor

## Summary
Introduce domain-based path aliases and barrel exports so we can reorganize narrative/scene/gizmo code without sweeping import edits. Start with the largest cross-cutting areas (narrative engine, scene integration, gizmos, shared types) and update key consumers to use the new aliases.

## Goals
- Stable alias paths for core domains (narrative, scene integration, gizmos, shared types).
- Barrel index files that expose the public API from each domain, keeping imports consistent.
- Existing code updated to use the aliases, reducing deep relative import chains.
- Documented alias map for contributors.

## Scope
1. **Alias definitions**
   - Add path mappings in root tsconfig (and other configs as needed):
     - `@/narrative/*` ? `packages/game/engine/src/narrative/*`
     - `@/scene/*` ? `packages/game/engine/src/narrative/sceneIntegration/*`
     - `@/gizmos/*` ? `apps/main/src/lib/gizmos/*`
     - `@/types/*` ? `packages/shared/types/src/*`
     - (Optionally) `@/stores/*` for shared Zustand stores, `@/console/*` for console framework.
   - Ensure tooling (tsc, eslint, Jest, Vite/Next) all respect the aliases.

2. **Barrel exports**
   - Add/update `index.ts` files under each alias root that export the intended public API: narrative controller, runtime hooks, scene integration helpers, gizmo console modules, etc.
   - Keep internal/private modules un-exported to avoid leaking unstable APIs.

3. **Import rewrites**
   - Update code to import via aliases instead of deep relative paths. Prioritize:
     - Narrative controller consumers (GameRuntime, resolver, tests).
     - Scene integration hooks + any features pulling them.
     - Gizmo console modules, BodyMap, interaction stats.
     - Shared types referenced from frontend/backend.
   - Optionally run codemod to replace remaining paths incrementally.

4. **Documentation**
   - Add a short section to README or `/docs/repo-map.md` describing the new aliases.
   - Mention future domains we might alias (simulation, automation, panels).

## Out of Scope
- Physical folder reorganization (leave files where they are for now).
- Renaming modules or changing runtime behavior.

## Risks / Considerations
- Build/test configs must all get the alias update; missing one can break lint or storybook.
- Barrel exports should avoid circular deps; be mindful of default vs named exports.
- Large-scale import rewrites can be noisy?consider doing it per-package PR if needed.

## Success Criteria
- `tsc`, lint, tests all pass using alias imports.
- No remaining deep relative paths for narrative/scene/gizmo/shared type modules (spot-check via `rg '../../narrative'`).
- Contributors can add new files under these domains without touching import paths.

## Follow-up Ideas
- Extend aliases to other domains (simulation, panels, automation).
- Add ESLint rule to enforce alias usage for specified directories.
- Once aliases are in place, consider reorganizing folders into domain-centric packages.

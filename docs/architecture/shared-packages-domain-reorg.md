# Shared Packages Domain Reorg (Draft)

Status: completed

Purpose
- Reorganize `packages/shared` by domain folders.
- Rename shared package names to dotted form (avoid hyphens like `ui-*`).
- Keep runtime behavior unchanged (move/rename only, update imports/paths/exports).

Scope
- All packages under `packages/shared/*`.
- Update all package names, dependencies, import specifiers, and tsconfig paths.
- Update build scripts that reference old package names (apps + any package build chains).

Non-goals
- No runtime logic changes.
- No API reshaping (barrel exports stay the same).

Naming Rules
- Prefer dotted names after `@pixsim7/shared.`.
  - Example: `@pixsim7/shared.preview-protocol` -> `@pixsim7/shared.preview.protocol`.
- Domain folders use `packages/shared/<domain>/<package>`.
  - Example: `@pixsim7/shared.graph.editors` -> `packages/shared/graph/editors`.
- Single-segment packages can stay at `packages/shared/<name>` unless we decide to group them.

Decisions
- Keep `@pixsim7/shared.ui` as-is (no `ui.core` split).
- Keep single-segment packages at the `packages/shared/<name>` root.
- Keep `@pixsim7/shared.auth` (no identity rename).

Workspace
- Update `pnpm-workspace.yaml` to include `packages/shared/*/*`.

Package Mapping (move + rename)
- [x] api-client -> @pixsim7/shared.api.client  | packages/shared/api/client
- [x] assets-core -> @pixsim7/shared.assets.core | packages/shared/assets/core
- [x] async -> @pixsim7/shared.async | packages/shared/async (root)
- [x] auth -> @pixsim7/shared.auth | packages/shared/auth (root)
- [x] capabilities-core -> @pixsim7/shared.capabilities.core | packages/shared/capabilities/core
- [x] config -> @pixsim7/shared.config | packages/shared/config (root)
- [x] content-rating -> @pixsim7/shared.content.rating | packages/shared/content/rating
- [x] devtools -> @pixsim7/shared.devtools | packages/shared/devtools (root)
- [x] gating -> @pixsim7/shared.gating | packages/shared/gating (root)
- [x] generation-core -> @pixsim7/shared.generation.core | packages/shared/generation/core
- [x] graph-core -> @pixsim7/shared.graph.core | packages/shared/graph/core
- [x] graph-editors -> @pixsim7/shared.graph.editors | packages/shared/graph/editors
- [x] graph-utilities -> @pixsim7/shared.graph.utilities | packages/shared/graph/utilities
- [x] helpers-core -> @pixsim7/shared.helpers.core | packages/shared/helpers/core
- [x] logic-core -> @pixsim7/shared.logic.core | packages/shared/logic/core
- [x] media-core -> @pixsim7/shared.media.core | packages/shared/media/core
- [x] models -> @pixsim7/shared.models | packages/shared/models (root)
- [x] modules -> @pixsim7/shared.modules | packages/shared/modules (root)
- [x] panels -> @pixsim7/shared.ui.panels | packages/shared/ui/panels
- [x] player-core -> @pixsim7/shared.player.core | packages/shared/player/core
- [x] preview-protocol -> @pixsim7/shared.preview.protocol | packages/shared/preview/protocol
- [x] ref-core -> @pixsim7/shared.ref.core | packages/shared/ref/core
- [x] sources -> @pixsim7/shared.sources | packages/shared/sources (root)
- [x] time -> @pixsim7/shared.time | packages/shared/time (root)
- [x] types -> @pixsim7/shared.types | packages/shared/types (root)
- [x] ui -> @pixsim7/shared.ui | packages/shared/ui (root)
- [x] ui.tools -> @pixsim7/shared.ui.tools | packages/shared/ui/tools

Action Checklist
- [x] Move folders to domain layout.
- [x] Update each package `name` field.
- [x] Update all workspace dependency references.
- [x] Update all import specifiers in code.
- [x] Update tsconfig path mappings (apps + any packages that reference shared).
- [x] Update build scripts that list shared package names.
- [x] Run typecheck/build (optional, post-move).

Search/Replace Guidance
- Use `rg` to locate old package names and update to new dotted names.
- Prefer changing package names first, then updating references.

Notes
- Keep re-export barrels in app code so imports can migrate incrementally if needed.
- Avoid changing runtime logic; this is a move/rename only.

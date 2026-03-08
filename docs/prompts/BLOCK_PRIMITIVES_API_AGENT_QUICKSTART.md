# Block Primitives API Agent Quickstart

Audience: AI agents and automation scripts that need to read, roll, analyze, and author block primitives and templates via API.

Scope: Current active APIs under `/api/v1/block-templates` and generation integration via `/api/v1/generations`.

## 1. Fast Mental Model

- Canonical content source is `block_primitives` (not legacy prompt/action block tables).
- Templates define slot intent and constraints.
- Runtime roll path is: `compiler_v1 -> next_v1`.
- Matrix and catalog tools are API-first and work directly on primitives.

## 2. Non-Negotiable Conventions

- Matrix `source` must be `primitives`.
- Prefer `composition_role` over `role` for matrix filtering.
- Use `tag:<key>` for explicit tag axes, for example `tag:hardness`.
- Primitive `block_id` must be namespaced: `<namespace>.<name>`.
- Keep `role` only as compatibility alias in API requests where still accepted.

## 3. Core Endpoints

### Templates

- `POST /api/v1/block-templates` create template
- `GET /api/v1/block-templates` list templates (`mine` + `include_public` supported for owner-scoped views)
- `GET /api/v1/block-templates/{template_id}` get template
- `GET /api/v1/block-templates/by-slug/{slug}` get template by slug
- `PATCH /api/v1/block-templates/{template_id}` update template
- `DELETE /api/v1/block-templates/{template_id}` delete template
- `POST /api/v1/block-templates/{template_id}/roll` compile + resolve + assemble prompt
- `GET /api/v1/block-templates/{template_id}/diagnostics` slot/package diagnostics
- `POST /api/v1/block-templates/preview-slot` candidate preview
- Template response payloads expose canonical ownership fields: `owner_user_id`, `owner_ref`, `owner_username`.
- Analyzer preset responses (`/api/v1/analyzer-presets`) expose the same canonical owner fields.
- Both endpoints support `mine`, `include_public`, `owner_user_id` query params via `resolve_user_owned_list_scope`.
- Frontend hook: `useResourceOwnership(ownerUserId)` from `@lib/auth` returns `{ isMine, canEdit, ownerRef }`.

### Primitives and Catalog

- `GET /api/v1/block-templates/blocks` search primitives
- `PUT /api/v1/block-templates/blocks/by-block-id/{block_id}` upsert primitive
- `DELETE /api/v1/block-templates/blocks/by-block-id/{block_id}` delete primitive
- `GET /api/v1/block-templates/meta/blocks/catalog` normalized catalog rows
- `GET /api/v1/block-templates/blocks/roles` inferred composition role/category counts
- `GET /api/v1/block-templates/blocks/tags` tag facets
- `GET /api/v1/block-templates/meta/blocks/tag-dictionary` canonical tag dictionary + usage

### Matrix and Pack Presets

- `GET /api/v1/block-templates/meta/blocks/matrix` coverage matrix
- `GET /api/v1/block-templates/meta/content-packs` discovered packs
- `GET /api/v1/block-templates/meta/content-packs/manifests` pack matrix presets
- `POST /api/v1/block-templates/meta/content-packs/reload` reload content packs (admin only)
- `GET /api/v1/block-templates/meta/content-packs/inventory` admin inventory
- `POST /api/v1/block-templates/meta/content-packs/purge` admin orphan purge

### Resolver Workbench (Dev)

- `POST /api/v1/block-templates/dev/resolver-workbench/compile-template`
- `POST /api/v1/block-templates/dev/resolver-workbench/resolve`

Use these for experimentation and diagnostics, not as your main production path.

## 4. Canonical Query Keys for Matrix

Recommended:

- Axes: `composition_role`, `category`, `package_name`, `tag:<key>`
- Filters: `composition_role`, `category`, `package_name`, `q`, `tags`

Compatibility aliases:

- `role` is accepted as alias for `composition_role` in matrix filters.

Important:

- `source=action_blocks` is rejected.

## 5. Minimal Request Examples

### 5.1 Get matrix scoped to a pack

```bash
curl -sS "http://localhost:8001/api/v1/block-templates/meta/blocks/matrix?source=primitives&row_key=composition_role&col_key=category&package_name=core_scene_primitives&include_empty=true"
```

### 5.2 Get matrix by tag axes with role filter

```bash
curl -sS "http://localhost:8001/api/v1/block-templates/meta/blocks/matrix?source=primitives&row_key=tag:allure_level&col_key=tag:tightness&composition_role=materials:wardrobe&include_empty=true"
```

### 5.3 Upsert primitive block (namespaced id)

```bash
curl -sS -X PUT "http://localhost:8001/api/v1/block-templates/blocks/by-block-id/core.light.golden_hour" \
  -H "Content-Type: application/json" \
  -d '{
    "category": "light",
    "text": "golden hour side light with soft ambient bounce",
    "tags": {"source_pack": "core_scene_primitives", "lighting_family": "golden_hour"},
    "capabilities": ["light"],
    "source": "imported",
    "is_public": true
  }'
```

### 5.4 Roll template

```bash
curl -sS -X POST "http://localhost:8001/api/v1/block-templates/11111111-2222-3333-4444-555555555555/roll" \
  -H "Content-Type: application/json" \
  -d '{"seed": 42, "control_values": {"allure": 3}}'
```

### 5.5 Compile template to ResolutionRequest (dev)

```bash
curl -sS -X POST "http://localhost:8001/api/v1/block-templates/dev/resolver-workbench/compile-template" \
  -H "Content-Type: application/json" \
  -d '{"slug": "police-precinct-break-room", "candidate_limit": 24, "compiler_id": "compiler_v1"}'
```

### 5.6 Resolve ResolutionRequest (dev)

```bash
curl -sS -X POST "http://localhost:8001/api/v1/block-templates/dev/resolver-workbench/resolve" \
  -H "Content-Type: application/json" \
  -d '{"resolver_id": "next_v1", "candidates_by_target": {}}'
```

## 6. Generation Integration

To roll server-side during generation creation:

- Send `config.run_context.block_template_id` in `POST /api/v1/generations`.
- Optional: `config.run_context.character_bindings`.
- Server rolls template, sets `config.prompt`, and stores roll metadata in run context:
  - `roll_seed`
  - `selected_block_ids`
  - `slot_results`
  - `assembled_prompt`

## 7. Pack-Level Presets for Small Libraries

Use pack manifests to ship matrix presets with each block library.

Manifest locations supported:

- `<pack>/manifest.yaml`
- `<pack>/blocks/**/manifest.yaml`
- `<pack>/templates/**/manifest.yaml`

Minimal manifest example:

```yaml
id: core-scene
title: Core Scene Presets
matrix_presets:
  - label: Lighting Coverage
    query:
      row_key: composition_role
      col_key: category
      package_name: core_scene_primitives
      include_empty: true
```

Notes:

- `composition_role` is preferred in `query`.
- `role` is accepted and canonicalized where possible.

Prompt block packs are schema-based:

- `<pack>/schema.yaml`
- `<pack>/blocks.schema.yaml`
- `<pack>/blocks/**/*.schema.yaml`

Legacy `blocks.yaml` and `blocks/*.yaml` block sources are not loaded.

CUE source-of-truth for current core packs:

- `tools/cue/prompt_packs/core_camera.cue`
- `tools/cue/prompt_packs/core_direction.cue`

Generate emitted pack schemas into `content_packs/prompt/*/schema.yaml` with:

```bash
pnpm prompt-packs:gen
```

Minimal schema-only block pack example:

```yaml
version: "1.0.0"
package_name: core_direction
block_schema:
  id_prefix: core.direction
  category: direction
  text_template: "Direction token: {variant}."
  tags:
    modifier_family: direction
  variants:
    - key: in
      tags: {direction: in}
    - key: out
      tags: {direction: out}
```

Schema with canonical `op` + typed `ref` constraints:

```yaml
version: "1.0.0"
package_name: core_camera
block_schema:
  id_prefix: core.camera.motion
  category: camera
  op:
    op_id_template: "camera.motion.{variant}"
    modalities: [video]
    refs:
      - key: target
        capability: camera_target
        required: false
    params:
      - key: speed
        type: enum
        enum: [slow, normal, fast]
        default: normal
    default_args:
      speed: normal
  text_template: "Camera motion token: {variant}."
  variants:
    - key: zoom
      op_modalities: [both]
      op_args: {speed: fast}
    - key: pan
      op_args: {speed: slow}
```

Current loader behavior for `op` schema:

- Validates `op` contract (`op_id` xor `op_id_template`, modalities, refs, params).
- Stamps op metadata under `block_metadata.op` during schema compilation.
- Adds queryable tags (`op_id`, `op_namespace`, `op_modalities`).
- Adds capabilities (`op:<op_id>`, `ref:<capability>` for declared refs).

## 8. Common Failure Modes

- `source='action_blocks'` in matrix query
  - Fix: use `source=primitives`.
- Primitive upsert with non-namespaced `block_id`
  - Fix: use `<namespace>.<name>`.
- Compile workbench missing both slug and template id
  - Fix: provide `slug` or `template_id` (one, not both).
- Matrix using unknown tag key in manifests
  - Fix: align to canonical keys from tag dictionary endpoint.

## 9. Agent Do/Do Not

Do:

- Read pack manifests first, then run matrix queries from those presets.
- Prefer canonical keys (`composition_role`, canonical tag keys).
- Keep block IDs stable and namespaced.

Do not:

- Build new tooling around legacy prompt/action block tables.
- Depend on `role` as the long-term matrix filter key.
- Assume dev workbench endpoints are your production execution path.

# Prompt Pack Tag Authority Contract

Last updated: 2026-03-12
Owner: block-primitives lane

## Purpose

Prevent drift between pack `op` params, variant tags, and matrix/tag query contracts.

## Authority Split

- `prompt_block_tags` vocabulary is the semantic authority:
  - canonical tag keys
  - allowed values and aliases
  - deprecation status
- `op_signatures` + pack `block_schema.op` are execution authority:
  - op ids
  - required params/refs
  - modalities

This is a deliberate split. We do not derive global vocabulary from packs.

## Authoring Rules

For prompt-pack CUE/YAML authoring:

1. Canonical param key:
   - If `op.params[].key` already matches a canonical tag key, no `tag_key` is needed.
2. Non-canonical param key:
   - Must define `op.params[].tag_key` to map into a canonical tag key.
3. Unknown `tag_key`:
   - Always invalid.
4. `ref` params:
   - Exempt from tag mapping requirements.

Runtime derives variant semantic tags from `op_args` (with `tag_key` mapping where needed) and rejects conflicts with manually provided tags.

## CI/Lint Enforcement

`pnpm prompt-packs:check` enforces this in `tools/codegen/generate-prompt-pack-schemas.ts`.

Intentional non-tag execution params (if any) are explicitly allowlisted in:

- `NON_CANONICAL_OP_PARAM_TAG_KEY_EXEMPTIONS` (`tools/codegen/generate-prompt-pack-schemas.ts`)

Current state: allowlist is empty; new exemptions require explicit justification.

If you add a new non-canonical non-ref param, choose one:

1. Add `tag_key` and map it to an existing canonical vocabulary key.
2. Add a new canonical vocabulary key in `prompt_block_tags.yaml`, then map to it.
3. If truly execution-only, add a narrow exemption entry and document why in the PR.

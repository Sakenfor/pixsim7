# Non-Humanoid Authoring Rollout Contract

Last updated: 2026-03-27
Scope: cp2 anatomy primitive category rollout

## Runtime Behavior

- Primitive content pack changes under `pixsim7/backend/main/content_packs/primitives/**` are hot-reloaded by the `block-primitives` content watcher (`services/content/watcher.py` + `services/content/builtin_loaders.py`).
- New or edited primitive YAML files (including `creature_foundation/blocks/anatomy.yaml`) are loaded without a process restart.
- Vocabulary changes under `pixsim7/backend/main/plugins/**/vocabularies/**` trigger registry hot reload through the vocab watcher.

## Mapping Refresh Caveat

- Composition mapping consumers that snapshot mapping constants at import time (for example `composition_role_inference._REGISTRY` and `block_primitive_query._COMPOSITION_ROLE_MAPS`) do not refresh those snapshots automatically when vocab YAML changes.
- If `roles.yaml` category mappings are changed at runtime, restart the backend process to guarantee all mapping consumers observe the new mapping.

## Operator Verification

1. Edit a primitive file in `content_packs/primitives/creature_foundation/blocks/`.
2. Confirm watcher logs `content_change_detected` and `content_hot_reloaded` for loader `block-primitives`.
3. For `roles.yaml` mapping changes, restart service, then verify category inference returns updated `composition_role`.

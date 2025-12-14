# Character Linkage Conventions

> **Status:** Implemented in Phase 26.4
> **Module:** `pixsim7.backend.main.domain.character_linkage`

This document describes standardized conventions for linking characters to scenes, assets, and generations using existing JSON metadata fields. **No schema changes required.**

---

## Overview

The character identity graph relies on consistent metadata conventions to link:
- **Characters** (templates and instances) ⟷ **Scenes** (via roles)
- **Characters** ⟷ **Assets** (via metadata)
- **Characters** ⟷ **Generations** (via canonical params)

These conventions are enforced through helper functions in `character_linkage.py`.

---

## Character Reference Format

### Standard Format

Character references use a consistent string format:

```
character:<uuid>    # Character template
instance:<uuid>     # Character instance
```

**Examples:**
```python
"character:550e8400-e29b-41d4-a716-446655440000"
"instance:7c9e6679-7425-40de-944b-e07fc1f90ae7"
```

### Helper Functions

```python
from pixsim7.backend.main.domain.character_linkage import (
    format_character_ref,
    format_instance_ref,
    parse_character_ref,
)

# Format
ref = format_character_ref(character_id)  # "character:uuid"
ref = format_instance_ref(instance_id)    # "instance:uuid"

# Parse
parsed = parse_character_ref("character:550e8400...")
# => {"type": "character", "id": "550e8400..."}
```

---

## Scene Role Bindings

### Convention

Scenes reference **roles**, not hardcoded character/NPC IDs.

**Storage:** `GameScene.meta.character_roles`

**Format:**
```json
{
  "character_roles": {
    "protagonist": "character:550e8400-e29b-41d4-a716-446655440000",
    "love_interest": "instance:7c9e6679-7425-40de-944b-e07fc1f90ae7",
    "antagonist": "character:8f14e45f-ceea-467a-9af3-7f5d1a8be2ff"
  }
}
```

### Standard Roles

Recommended role names (not enforced, but suggested):
- `protagonist` - Main character
- `love_interest` - Romantic interest
- `antagonist` - Opposing character
- `supporting` - Supporting character
- `background` - Background character
- `narrator` - Narrator (if applicable)
- `companion` - Companion/sidekick
- `rival` - Rival character
- `mentor` - Mentor/guide
- `student` - Student/apprentice

Custom roles are allowed but should follow `snake_case` naming.

### Helper Functions

```python
from pixsim7.backend.main.domain.character_linkage import (
    set_scene_role_binding,
    get_scene_role_binding,
    get_all_scene_roles,
    clear_scene_role_binding,
)

# Set role binding
scene = set_scene_role_binding(
    scene,
    role="protagonist",
    character_ref=format_character_ref(char_id)
)

# Get role binding
ref = get_scene_role_binding(scene, "protagonist")
# => "character:550e8400..."

# Get all roles
roles = get_all_scene_roles(scene)
# => {"protagonist": "character:...", "love_interest": "instance:..."}

# Clear role
scene = clear_scene_role_binding(scene, "protagonist")
```

### Scene Node Character References

For individual scene nodes (GameSceneNode), character references are stored as a list.

**Storage:** `GameSceneNode.meta.character_refs`

**Format:**
```json
{
  "character_refs": [
    "character:550e8400-e29b-41d4-a716-446655440000",
    "instance:7c9e6679-7425-40de-944b-e07fc1f90ae7"
  ]
}
```

**Helper Functions:**
```python
from pixsim7.backend.main.domain.character_linkage import (
    add_scene_node_character_ref,
    get_scene_node_character_refs,
    remove_scene_node_character_ref,
)

# Add character reference
node = add_scene_node_character_ref(node, format_character_ref(char_id))

# Get all references
refs = get_scene_node_character_refs(node)
# => ["character:...", "instance:..."]

# Remove reference
node = remove_scene_node_character_ref(node, "character:...")
```

---

## Asset Character Linkage

### Convention

Assets store character linkage in `media_metadata.character_linkage`.

**Storage:** `Asset.media_metadata.character_linkage`

**Format:**
```json
{
  "character_linkage": {
    "character_template_id": "550e8400-e29b-41d4-a716-446655440000",
    "character_instance_id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    "scene_id": 123,
    "scene_node_id": 456
  }
}
```

**Additional:** Character references can also be added to `Asset.tags` for simpler filtering.

### Helper Functions

```python
from pixsim7.backend.main.domain.character_linkage import (
    set_asset_character_linkage,
    get_asset_character_linkage,
    add_asset_character_tag,
)

# Set linkage
asset = set_asset_character_linkage(
    asset,
    character_template_id=char_id,
    character_instance_id=instance_id,
    scene_id=123,
    scene_node_id=456,
)

# Get linkage
linkage = get_asset_character_linkage(asset)
# => {"character_template_id": "...", "scene_id": 123, ...}

# Add character tag (for simpler filtering)
asset = add_asset_character_tag(asset, format_character_ref(char_id))
# asset.tags now includes "character:550e8400..."
```

---

## Generation Character Linkage

### Convention

Generations store character references and scene IDs in `canonical_params`.

**Storage:** `Generation.canonical_params`

**Format:**
```json
{
  "character_refs": [
    "character:550e8400-e29b-41d4-a716-446655440000",
    "instance:7c9e6679-7425-40de-944b-e07fc1f90ae7"
  ],
  "scene_id": 123
}
```

### Helper Functions

```python
from pixsim7.backend.main.domain.character_linkage import (
    set_generation_character_refs,
    add_generation_character_ref,
    get_generation_character_refs,
    set_generation_scene_id,
    get_generation_scene_id,
)

# Set all character refs
generation = set_generation_character_refs(generation, [
    format_character_ref(char_id1),
    format_character_ref(char_id2),
])

# Add single character ref
generation = add_generation_character_ref(
    generation,
    format_character_ref(char_id)
)

# Get character refs
refs = get_generation_character_refs(generation)
# => ["character:...", "instance:..."]

# Set scene ID
generation = set_generation_scene_id(generation, scene_id=123)

# Get scene ID
scene_id = get_generation_scene_id(generation)
# => 123
```

---

## Character Usage Tracking (Extended)

### Convention

`CharacterUsage` table now tracks usage in:
- **Prompts/Actions** (existing: `usage_type = "prompt"` or `"action_block"`)
- **Scenes** (new: `usage_type = "scene"`)
- **Assets** (new: `usage_type = "asset"`)
- **Generations** (new: `usage_type = "generation"`)

**Template Reference Format:**
```
scene:<scene_id>           # e.g., "scene:123"
asset:<asset_id>           # e.g., "asset:456"
generation:<generation_id> # e.g., "generation:789"
```

### Helper Functions

```python
from pixsim7.backend.main.domain.character_linkage import (
    track_character_usage_in_scene,
    track_character_usage_in_asset,
    track_character_usage_in_generation,
)

# Track scene usage
await track_character_usage_in_scene(db, character_id, scene_id)

# Track asset usage
await track_character_usage_in_asset(db, character_id, asset_id)

# Track generation usage
await track_character_usage_in_generation(db, character_id, generation_id)
```

---

## Best Practices

### 1. Always Use Roles in Scenes

❌ **Bad:**
```python
# Hardcoded NPC ID in scene node
node.meta["npc_id"] = 42  # Don't do this!
```

✅ **Good:**
```python
# Use role bindings
scene = set_scene_role_binding(scene, "protagonist", format_character_ref(char_id))

# At runtime, resolve role to NPC:
protagonist_ref = get_scene_role_binding(scene, "protagonist")
# Look up character instance for this world
# Link instance to NPC
# Use NPC ID
```

### 2. Always Tag Character Assets

When creating an asset for a character:

```python
# Set linkage
asset = set_asset_character_linkage(
    asset,
    character_template_id=char_id,
    character_instance_id=instance_id,  # if instance-specific
    scene_id=scene_id,  # if part of a scene
)

# Add tag for easy filtering
asset = add_asset_character_tag(asset, format_character_ref(char_id))

# Track usage
await track_character_usage_in_asset(db, char_id, asset.id)
```

### 3. Always Link Generations to Characters

When creating a generation involving a character:

```python
# Set character refs
generation = add_generation_character_ref(
    generation,
    format_character_ref(char_id)
)

# Set scene if applicable
if scene_id:
    generation = set_generation_scene_id(generation, scene_id)

# Track usage
await track_character_usage_in_generation(db, char_id, generation.id)
```

### 4. Validate Role Names

Use standard role names when possible:

```python
from pixsim7.backend.main.domain.character_linkage import (
    is_valid_role_name,
    suggest_role_name,
    STANDARD_SCENE_ROLES,
)

# Validate
if not is_valid_role_name(user_role):
    raise ValueError("Invalid role name")

# Suggest standard role
suggested = suggest_role_name(user_role)
if suggested:
    print(f"Consider using standard role: {suggested}")
```

---

## Migration Guide

### For Existing Scenes

1. Review scenes that hardcode NPC IDs
2. Replace with role bindings:

```python
# Before (hardcoded)
scene.meta["npc_id"] = 42

# After (role-based)
scene = set_scene_role_binding(
    scene,
    "protagonist",
    format_instance_ref(instance_id)  # Link to character instance
)
```

### For Existing Assets

1. Find assets that should be linked to characters
2. Add linkage metadata:

```python
# Find assets from character-specific generations
# Add linkage
asset = set_asset_character_linkage(
    asset,
    character_template_id=char_id,
    scene_id=scene_id,
)
```

### For Existing Generations

1. Parse `prompt_config.variables` or `canonical_params` for character references
2. Standardize as `character_refs`:

```python
# Before (ad-hoc)
generation.canonical_params["character"] = str(char_id)

# After (standardized)
generation = add_generation_character_ref(
    generation,
    format_character_ref(char_id)
)
```

---

## Graph Query Integration

The character graph query functions automatically use these conventions:

```python
from pixsim7.backend.main.domain.character_graph import get_character_graph

# Graph traversal reads:
# - Scene role bindings (GameScene.meta.character_roles)
# - Scene node refs (GameSceneNode.meta.character_refs)
# - Asset linkage (Asset.media_metadata.character_linkage)
# - Generation refs (Generation.canonical_params.character_refs)

graph = await get_character_graph(db, character_id)
# Returns all connected nodes using these conventions
```

---

## Summary

| Entity | Field | Convention | Example |
|--------|-------|------------|---------|
| **GameScene** | `meta.character_roles` | `{"role": "character:uuid"}` | `{"protagonist": "character:550e8400..."}` |
| **GameSceneNode** | `meta.character_refs` | `["character:uuid", ...]` | `["character:550e8400...", "instance:7c9e6679..."]` |
| **Asset** | `media_metadata.character_linkage` | `{"character_template_id": "uuid", "scene_id": 123}` | Full linkage object |
| **Asset** | `tags` | `["character:uuid", ...]` | `["character:550e8400..."]` |
| **Generation** | `canonical_params.character_refs` | `["character:uuid", ...]` | `["character:550e8400..."]` |
| **Generation** | `canonical_params.scene_id` | `123` | Scene ID |
| **CharacterUsage** | `usage_type`, `template_reference` | `"scene"`, `"scene:123"` | Usage tracking |

All helper functions are in `pixsim7.backend.main.domain.character_linkage`.

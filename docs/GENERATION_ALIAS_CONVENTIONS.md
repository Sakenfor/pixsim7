# Generation Alias Conventions

> **For Agents**: This document explains the distinction between canonical and semantic generation aliases, and how plugins should register their own domain-specific aliases.

---

## Overview

The generation system uses `generation_type` strings to specify what kind of content to generate. These strings fall into two categories:

1. **Canonical Aliases** – Core operation labels managed by the backend
2. **Semantic Aliases** – Plugin-owned game/domain concepts

This separation keeps the core generation pipeline generic and provider-agnostic, while allowing plugins to express higher-level game concepts.

---

## Canonical vs Semantic Aliases

### Canonical Aliases

**Definition**: Core operation labels that directly correspond to `OperationType` enum values. These are generic, provider-agnostic operation names.

**Managed by**: Core backend (`pixsim7/backend/main/shared/operation_mapping.py`)

**Examples**:
- `text_to_image` → `OperationType.TEXT_TO_IMAGE`
- `image_edit` → `OperationType.IMAGE_TO_IMAGE`
- `video_extend` → `OperationType.VIDEO_EXTEND`
- `transition` → `OperationType.VIDEO_TRANSITION`
- `fusion` → `OperationType.FUSION`

**Usage**: These are the "language" of the generation pipeline. They describe *what the provider does*, not *why the game needs it*.

### Semantic Aliases

**Definition**: Game/domain-specific labels that map to canonical operations but express higher-level concepts. These convey *game intent* rather than technical operation types.

**Managed by**: Plugins via `register_generation_alias()` in their `on_load()` hooks

**Examples**:
- `npc_response` → `OperationType.IMAGE_TO_VIDEO` (game-dialogue plugin)
- `dialogue` → `OperationType.TEXT_TO_VIDEO` (game-dialogue plugin)
- `environment` → `OperationType.TEXT_TO_VIDEO` (game-dialogue plugin)
- `variation` → `OperationType.TEXT_TO_VIDEO` (game-dialogue plugin)

**Usage**: These express *why* content is being generated from a game perspective, making configs more readable and maintainable.

---

## How to Add a New Semantic Alias

When a plugin needs to introduce a new semantic label for generation:

### Step 1: Identify the Canonical Operation

Determine which `OperationType` your semantic concept maps to:
- Is it generating an image? → `TEXT_TO_IMAGE` or `IMAGE_TO_IMAGE`
- Is it generating a video from text? → `TEXT_TO_VIDEO`
- Is it generating a video from an image? → `IMAGE_TO_VIDEO`
- Is it extending a video? → `VIDEO_EXTEND`
- Is it creating a transition? → `VIDEO_TRANSITION`
- Is it character-consistent fusion? → `FUSION`

### Step 2: Register in Plugin's `on_load()` Hook

In your plugin's `manifest.py`, call `register_generation_alias()` during the `on_load()` lifecycle hook:

```python
from pixsim7.backend.main.domain.enums import OperationType
from pixsim7.backend.main.shared.operation_mapping import register_generation_alias

def on_load(app):
    """Called when plugin is loaded (before app starts)"""
    # Register semantic aliases used by this plugin
    register_generation_alias(
        "my_semantic_name",
        OperationType.TEXT_TO_VIDEO,
        owner="my-plugin-id"
    )
```

**Parameters**:
- `alias` (str): Your semantic name (e.g., "npc_response", "dialogue")
- `operation_type` (OperationType): The canonical operation this maps to
- `owner` (str, optional): Your plugin ID for tracking and auditing

### Step 3: Use in Configs

Once registered, you can use your semantic alias in `generation_config` documents:

```json
{
  "generation_type": "my_semantic_name",
  "prompt": "...",
  "...": "..."
}
```

---

## Important Rules

### ✅ DO:
- Register semantic aliases in plugin `on_load()` hooks
- Use descriptive, domain-specific names that convey game intent
- Provide the `owner` parameter for tracking
- Reuse existing canonical operations when possible

### ❌ DON'T:
- Hard-code new `generation_type` values directly into `GENERATION_TYPE_OPERATION_MAP`
- Create semantic aliases in core code without plugin ownership
- Introduce new aliases without registering them (they won't work)
- Create semantic aliases that conflict with existing ones

---

## Introspection & Tooling

### Check Registered Aliases

Call `list_generation_operation_metadata()` to get all registered aliases with metadata:

```python
from pixsim7.backend.main.shared.operation_mapping import list_generation_operation_metadata

metadata = list_generation_operation_metadata()
# Returns:
# [
#   {
#     "generation_type": "text_to_image",
#     "operation_type": "TEXT_TO_IMAGE",
#     "owner": None,
#     "is_semantic_alias": False
#   },
#   {
#     "generation_type": "npc_response",
#     "operation_type": "IMAGE_TO_VIDEO",
#     "owner": "game-dialogue",
#     "is_semantic_alias": True
#   },
#   ...
# ]
```

### Validation

The system validates operation coverage at startup via `validate_operation_coverage()`:

```python
from pixsim7.backend.main.shared.operation_mapping import validate_operation_coverage

result = validate_operation_coverage()
# Returns:
# {
#   "passed": True/False,
#   "errors": [...],
#   "warnings": [...],
#   "registered_operations": [...],
#   "generation_types": [...]
# }
```

Call `assert_operation_coverage()` in tests to fail fast on drift.

---

## Example: game-dialogue Plugin

The `game-dialogue` plugin registers semantic aliases for narrative concepts:

**File**: `pixsim7/backend/main/plugins/game_dialogue/manifest.py`

```python
def on_load(app):
    """Called when plugin is loaded (before app starts)"""
    from pixsim7.backend.main.domain.enums import OperationType
    from pixsim7.backend.main.shared.operation_mapping import register_generation_alias

    # Register semantic aliases used by dialogue/narrative systems.
    # These map high-level concepts onto canonical OperationType values.
    register_generation_alias("npc_response", OperationType.IMAGE_TO_VIDEO, owner="game-dialogue")
    register_generation_alias("dialogue", OperationType.TEXT_TO_VIDEO, owner="game-dialogue")
    register_generation_alias("environment", OperationType.TEXT_TO_VIDEO, owner="game-dialogue")
```

This allows dialogue configs to use meaningful names:
- `"generation_type": "dialogue"` instead of `"generation_type": "text_to_video"`
- `"generation_type": "npc_response"` instead of `"generation_type": "image_to_video"`

---

## Backward Compatibility

Existing semantic aliases (`npc_response`, `dialogue`, `environment`, `variation`) remain in `GENERATION_TYPE_OPERATION_MAP` for backward compatibility with stored configs. However:

- These are now **documented as plugin-owned** (see comments in `operation_mapping.py`)
- Plugins **re-register** them via `register_generation_alias()` to assert ownership
- New semantic aliases should **not** be added directly to the map

This approach ensures:
- Old configs continue to work ✅
- Ownership is clear and auditable ✅
- Future drift is prevented ✅

---

## Related Files

- `pixsim7/backend/main/shared/operation_mapping.py` – Core mapping registry
- `pixsim7/backend/main/domain/enums.py` – `OperationType` enum
- `pixsim7/backend/main/plugins/game_dialogue/manifest.py` – Example plugin registration
- `claude-tasks/116-generation-pipeline-drift-audit.md` – Drift prevention
- `claude-tasks/117-generation-pipeline-drift-fixes.md` – Recent fixes
- `claude-tasks/118-plugin-owned-generation-aliases.md` – This task

---

## Summary

| Aspect | Canonical Aliases | Semantic Aliases |
|--------|------------------|------------------|
| **Purpose** | Technical operation labels | Game/domain concepts |
| **Managed by** | Core | Plugins |
| **Examples** | `text_to_image`, `image_edit` | `npc_response`, `dialogue` |
| **Registration** | Hard-coded in `OPERATION_REGISTRY` | `register_generation_alias()` |
| **Owner** | None | Plugin ID |

**Key Principle**: Core owns operations, plugins own semantics.

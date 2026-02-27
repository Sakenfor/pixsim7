# Prompt Guidance Plan v1 (Provider-Agnostic Runtime Schema)

> Date: 2026-02-23
> Status: Proposed
> Scope: Runtime guidance abstraction for prompt templates and generation requests

---

## 1. Purpose

Define a single runtime schema that can carry non-text guidance inputs for template-driven generation, including:

- character reference images
- spatial regions (boxes/zones)
- masks (protect/edit regions)
- future pose/layout hints

This is designed to:

- reuse the existing `runContext` flow and generation metadata persistence
- stay provider-agnostic
- support multiple producers (mask editor, region tool, auto-layout, CV tools)
- support multiple consumers (provider formatters, diagnostics UI, future game systems)

---

## 2. Where It Lives (v1)

Store the guidance plan inside existing `runContext` (frontend -> backend -> persisted generation metadata):

```json
{
  "run_context": {
    "...existing_fields": "...",
    "guidance_plan": { "...schema below..." }
  }
}
```

Why here first:

- no API schema changes required (existing extra-field path already works)
- per-generation and per-item metadata is already persisted
- easy to iterate before promoting fields into typed request models

---

## 3. Top-Level Schema (v1)

```json
{
  "version": 1,
  "coord_space": "normalized_xyxy",
  "source_image": {
    "asset_id": "asset_source_001",
    "role": "source_subject"
  },
  "references": {
    "woman": {
      "asset_id": "asset_source_001",
      "kind": "identity",
      "priority": 1
    },
    "elderly_man_1": {
      "asset_id": "asset_ref_101",
      "kind": "identity",
      "priority": 2
    }
  },
  "regions": {
    "woman": [
      {
        "box": [0.38, 0.16, 0.64, 0.98],
        "label": "pole_center",
        "strength": 0.9,
        "kind": "placement"
      }
    ],
    "elderly_man_1": [
      {
        "box": [0.56, 0.28, 0.90, 0.98],
        "strength": 0.85,
        "kind": "placement",
        "relation": {
          "to": "woman",
          "distance": "intimate"
        }
      }
    ]
  },
  "masks": {
    "protect_face": {
      "asset_id": "asset_mask_face_01",
      "mode": "protect",
      "target": "woman",
      "semantic_target": "face",
      "strength": 1.0
    },
    "edit_clothing": {
      "asset_id": "asset_mask_clothes_01",
      "mode": "edit",
      "target": "woman",
      "semantic_target": "clothing",
      "strength": 1.0
    }
  },
  "constraints": {
    "woman": {
      "preserve_identity": true,
      "preserve_face": true,
      "preserve_body_proportions": true,
      "preserve_clothing": false,
      "allow_clothing_change": true
    }
  },
  "provenance": {
    "references": {
      "elderly_man_1": "character_picker"
    },
    "regions": {
      "woman[0]": "region_editor"
    },
    "masks": {
      "edit_clothing": "mask_editor"
    }
  }
}
```

---

## 4. Core Conventions

## 4.1 Role Addressing

All guidance is keyed by template binding key / runtime cast role key (examples: `woman`, `elderly_man_1`).

Do not key by provider image index (`image #2`) in the canonical schema.

Provider image numbering is assigned later by the provider formatter.

## 4.2 Coordinate Space

Use normalized image-relative coordinates in v1:

- `coord_space = "normalized_xyxy"`
- box format: `[x1, y1, x2, y2]`
- all values in `[0.0, 1.0]`
- `x1 < x2`, `y1 < y2`

This avoids dependence on source image resolution and makes validation simpler.

## 4.3 Asset References

Use stable `asset_id` values (not URLs) for:

- reference images
- masks
- future control images

Provider formatters resolve assets to provider-specific uploads/attachments.

---

## 5. v1 Types (Conceptual)

## 5.1 `references`

Purpose:

- bind roles to reference images (identity source, style source, pose source later)

Shape:

```json
{
  "binding_key": {
    "asset_id": "asset_123",
    "kind": "identity",
    "priority": 2,
    "view": "three_quarter",
    "pose": "standing",
    "label": "Nearest elderly man reference"
  }
}
```

Fields:

- `asset_id` (required)
- `kind` (required): `identity | style | pose | layout | other`
- `priority` (optional): relative ordering hint for formatter assignment
- `view` (optional): `front | profile | three_quarter | rear | unknown`
- `pose` (optional): free string in v1 (`standing`, `sitting`, etc.)
- `label` (optional): human-readable

## 5.2 `regions`

Purpose:

- spatial hints per role without requiring a mask

Shape:

```json
{
  "binding_key": [
    {
      "box": [0.1, 0.2, 0.4, 0.8],
      "kind": "placement",
      "strength": 0.8,
      "label": "left_side",
      "relation": {
        "to": "other_binding",
        "distance": "close"
      }
    }
  ]
}
```

Fields:

- `box` (required): normalized `xyxy`
- `kind` (optional): `placement | anchor | keep_out | focus | interaction_zone`
- `strength` (optional): `0..1`
- `label` (optional): local semantic label
- `relation` (optional):
  - `to`: binding key
  - `distance`: `intimate | close | medium | far`

Notes:

- Multiple regions per role are allowed.
- Providers may ignore `relation`; it is still useful for diagnostics and future compilers.

## 5.3 `masks`

Purpose:

- protect or edit semantic regions (face/body/clothing/background)

Shape:

```json
{
  "mask_key": {
    "asset_id": "asset_mask_123",
    "mode": "protect",
    "target": "woman",
    "semantic_target": "face",
    "strength": 1.0,
    "invert": false
  }
}
```

Fields:

- `asset_id` (required): mask image asset
- `mode` (required): `protect | edit | hint`
- `target` (optional): binding key this mask is associated with
- `semantic_target` (optional): `face | hair | body | clothing | background | hands | custom`
- `strength` (optional): `0..1`
- `invert` (optional): whether mask semantics should be inverted by consumer

Notes:

- Use separate masks instead of burned-in overlays when provider supports it.
- Overlay fallback can be produced by a compiler/formatter later.

## 5.4 `constraints`

Purpose:

- high-level preservation/edit rules that explain how references/masks should be interpreted

Shape:

```json
{
  "binding_key": {
    "preserve_identity": true,
    "preserve_face": true,
    "preserve_body_proportions": true,
    "preserve_clothing": false,
    "allow_clothing_change": true
  }
}
```

Notes:

- These are provider-agnostic intent flags.
- Provider formatters may translate them into prompt text, mask usage, or both.

## 5.5 `provenance`

Purpose:

- track which producer generated each hint
- support debugging and future conflict resolution

Suggested values:

- `character_picker`
- `region_editor`
- `mask_editor`
- `auto_layout`
- `imported`
- `cv_detector`
- `manual_json`

---

## 6. Producer / Consumer Abstraction

## 6.1 Producers (write partial plans)

Examples:

- character reference picker
- mask drawing tool
- bbox/region editor
- future pose editor
- future auto-layout helper

Each producer should emit a partial guidance plan, not provider-specific params.

Example partial output from region editor:

```json
{
  "version": 1,
  "coord_space": "normalized_xyxy",
  "regions": {
    "elderly_man_2": [
      { "box": [0.18, 0.30, 0.45, 0.96], "kind": "placement", "strength": 0.75 }
    ]
  },
  "provenance": {
    "regions": { "elderly_man_2[0]": "region_editor" }
  }
}
```

## 6.2 Compiler (merge + normalize + validate)

Responsibilities:

- merge partial plans from multiple producers
- normalize coordinates / defaults
- validate assets and boxes
- resolve conflicts (warn/error)
- produce a compiled canonical plan for provider formatting

The compiler should not decide provider syntax.

## 6.3 Consumers

Examples:

- provider formatter (Pixverse, others)
- diagnostics UI
- generation metadata inspector
- future game scene builder

Provider formatter responsibilities:

- assign provider image indices (`image #2`, `#3`, ...)
- attach assets
- build optional legend/preamble
- compile masks/regions into provider-native inputs or fallbacks

---

## 7. Merge Rules (v1)

Keep v1 simple and deterministic.

## 7.1 References

- Keyed by binding key.
- Last writer wins for exact binding key.
- Emit warning if asset changes for same binding across producers.

## 7.2 Regions

- Append arrays by binding key.
- Normalize and dedupe identical boxes (exact match).
- Cap per-role region count (configurable; recommended default: 8) with warning.

## 7.3 Masks

- Keyed by mask key.
- Last writer wins by mask key.
- Emit warning on duplicate `(target, semantic_target, mode)` unless explicitly allowed.

## 7.4 Constraints

- Keyed by binding key.
- Shallow merge booleans.
- Emit warning on direct contradictions, for example:
  - `preserve_clothing: true` and `allow_clothing_change: true`

---

## 8. Validation Rules (v1)

Minimum validation before provider formatting:

1. `version == 1`
2. `coord_space == normalized_xyxy`
3. all region boxes within `[0, 1]`
4. `x1 < x2` and `y1 < y2`
5. all `asset_id`s exist (references + masks)
6. region/mask `target` keys are valid template bindings (when template context is available)
7. strengths in `[0, 1]`
8. no conflicting constraints without explicit resolution

Validation result should include:

- `errors` (block generation or disable guidance use)
- `warnings` (guidance partially usable)

---

## 9. Provider Compilation Strategy (Capability-Based)

The canonical guidance plan is compiled differently per provider.

## 9.1 Capability Matrix (conceptual)

Per provider declare support for:

- `multi_reference_images`
- `reference_legend_text`
- `native_masks`
- `native_regions`
- `control_images`
- `overlay_fallback`

## 9.2 Pixverse (example v1/v2)

V1:

- use `references`
- assign provider image indices
- emit legend text (`image #2`, etc.)
- attach images

V2:

- optionally convert `regions` -> mask/control image if native regions unsupported
- use `masks` if native inpaint/control path exists

## 9.3 Fallback Behavior

If provider lacks a capability:

- drop unsupported guidance channel
- keep prompt text + references if possible
- store formatter warning in generation metadata

---

## 10. Integration With Template System (Current Codebase)

## 10.1 What stays the same

- templates remain provider-agnostic
- blocks describe semantic content (placement/action/mood/camera/lighting)
- `character_bindings` remain the template role names used by placeholders
- template rolling and slot selection logic remain the primary text assembly system

## 10.2 What changes (incremental)

- runtime can pass `guidance_plan` in `runContext`
- provider formatter can translate `guidance_plan` into request attachments/legend
- generation metadata persists the compiled guidance usage/debug output

This is an extension of existing run metadata, not a replacement.

---

## 11. Practical Rollout (Recommended)

## Phase A (Immediate Value)

- Support `guidance_plan.references` only
- Pixverse formatter:
  - assigns reference image numbers
  - emits legend text once
  - attaches images
- Persist mapping/debug in generation metadata

## Phase B (Low-Risk Spatial Control)

- Add `guidance_plan.regions`
- Validate and persist regions even if provider ignores them
- Add diagnostics UI to inspect role regions

## Phase C (Mask-Based Editing, Clothing First)

- Add `guidance_plan.masks` + `constraints`
- Support clothing edit/protect flows:
  - protect face/body
  - edit clothing region
- Compile to provider-native masks or fallback overlays

## Phase D (Advanced Producers)

- pose/keypoint hints
- auto-layout helpers
- CV-derived masks/regions

---

## 12. Example: Metro Trio + Clothing Change

This shows how multiple guidance methods can cooperate without coupling to provider syntax.

```json
{
  "version": 1,
  "coord_space": "normalized_xyxy",
  "references": {
    "woman": { "asset_id": "asset_source", "kind": "identity", "priority": 1 },
    "elderly_man_1": { "asset_id": "asset_oldman_a", "kind": "identity", "priority": 2 },
    "elderly_man_2": { "asset_id": "asset_oldman_b", "kind": "identity", "priority": 3 },
    "elderly_man_3": { "asset_id": "asset_oldman_c", "kind": "identity", "priority": 4 }
  },
  "regions": {
    "woman": [{ "box": [0.36, 0.14, 0.64, 0.98], "kind": "anchor", "label": "pole_center", "strength": 0.95 }],
    "elderly_man_1": [{ "box": [0.56, 0.26, 0.90, 0.98], "kind": "placement", "strength": 0.85 }],
    "elderly_man_2": [{ "box": [0.18, 0.30, 0.46, 0.98], "kind": "placement", "strength": 0.75 }],
    "elderly_man_3": [{ "box": [0.02, 0.20, 0.25, 0.78], "kind": "placement", "strength": 0.65 }]
  },
  "masks": {
    "protect_face": {
      "asset_id": "asset_mask_face",
      "mode": "protect",
      "target": "woman",
      "semantic_target": "face",
      "strength": 1.0
    },
    "edit_clothing": {
      "asset_id": "asset_mask_clothing",
      "mode": "edit",
      "target": "woman",
      "semantic_target": "clothing",
      "strength": 1.0
    }
  },
  "constraints": {
    "woman": {
      "preserve_identity": true,
      "preserve_face": true,
      "preserve_body_proportions": true,
      "allow_clothing_change": true,
      "preserve_clothing": false
    }
  }
}
```

Template and blocks still handle:

- metro setting
- close-group framing
- playful interaction beats
- motion / sway
- atmosphere

Guidance plan handles:

- who the characters are (references)
- where they should be (regions)
- what must be preserved/edited (masks + constraints)

---

## 13. Non-Goals (v1)

- Provider-specific fields in template YAML or block text
- Freehand annotations as a canonical format
- Persisted DB schema for guidance plans
- Full scene-graph replacement for templates

v1 is a runtime guidance container, not a new authoring system.


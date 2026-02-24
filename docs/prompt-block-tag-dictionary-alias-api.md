# Prompt Block Tag Dictionary + Alias API (Draft)

## Goal

Provide a single live source of truth for:

- Canonical tag keys and allowed/common values
- Key/value aliases (legacy/synonym forms)
- Usage counts/examples from DB-loaded prompt blocks
- Warnings for drift (deprecated keys/values)

This complements existing endpoints:

- `GET /block-templates/meta/blocks/catalog`
- `GET /block-templates/meta/blocks/matrix`
- `GET /block-templates/blocks/tags`

## Why

Matrix answers "what coverage exists?" and catalog answers "what rows exist?", but neither defines:

- which tag names are canonical
- which values are preferred
- which legacy aliases should be normalized

Without this, authors and AI tools tend to invent near-duplicate tags (`distance` vs `proximity_stage`, `view` vs `view_profile`).

## Design Principles

- Canonical vocabulary first, aliases second
- Aliases are a compatibility layer, not the primary schema
- DB-backed usage stats help keep the dictionary grounded in reality
- Runtime query behavior should stay predictable (prefer canonical tags in stored content)

## API Endpoints

### 1) Get Tag Dictionary

`GET /block-templates/meta/blocks/tag-dictionary`

Returns canonical keys, values, aliases, and usage summaries.

#### Query Params (optional)

- `package_name`
- `role`
- `category`
- `include_values` (`true` default)
- `include_usage_examples` (`false` default)
- `include_aliases` (`true` default)
- `limit_values_per_key` (default `50`)
- `limit_examples_per_key` (default `5`)

#### Response Shape (draft)

```json
{
  "version": 1,
  "generated_at": "2026-02-24T12:34:56Z",
  "scope": {
    "package_name": "shared",
    "role": null,
    "category": null
  },
  "keys": [
    {
      "key": "response_mode",
      "status": "canonical",
      "description": "Subject response posture/intent axis for interaction progression blocks.",
      "data_type": "string",
      "common_values": [
        { "value": "neutral", "count": 12, "status": "canonical" },
        { "value": "receptive", "count": 8, "status": "canonical" },
        { "value": "hesitant", "count": 4, "status": "canonical" },
        { "value": "boundary", "count": 3, "status": "canonical" }
      ],
      "aliases": {
        "keys": ["reaction_mode"],
        "values": {
          "reluctant": "hesitant"
        }
      },
      "examples": [
        {
          "block_id": "shared_pov_response_neutral_01",
          "package_name": "shared",
          "role": "action",
          "category": "interaction_beat"
        }
      ]
    }
  ],
  "warnings": [
    {
      "kind": "unknown_keys_present",
      "keys": ["distance"],
      "message": "Observed non-canonical keys in scoped blocks."
    }
  ]
}
```

## 2) Normalize Tag Payload (optional but high value)

`POST /block-templates/meta/blocks/tag-dictionary/normalize`

Normalize keys/values using alias registry and return warnings.

Use cases:

- Content-pack import tooling
- AI-generated block suggestions
- Editor validation before save

#### Request

```json
{
  "tags": {
    "distance": "near",
    "view": "pov_hand",
    "reaction_mode": "reluctant"
  },
  "strict": false
}
```

#### Response

```json
{
  "normalized_tags": {
    "proximity_stage": "near",
    "view_profile": "pov_hand",
    "response_mode": "hesitant"
  },
  "changes": [
    {
      "type": "key_alias",
      "from": "distance",
      "to": "proximity_stage"
    },
    {
      "type": "key_alias",
      "from": "view",
      "to": "view_profile"
    },
    {
      "type": "value_alias",
      "key": "response_mode",
      "from": "reluctant",
      "to": "hesitant"
    }
  ],
  "warnings": []
}
```

## 3) Validate Tags (template/block authoring diagnostics)

`POST /block-templates/meta/blocks/tag-dictionary/validate`

Checks tags against canonical keys/values and returns warnings/errors.

Use cases:

- Template Builder / block editing UX
- Content-pack CI validation
- AI authoring feedback loop

#### Request

```json
{
  "tags": {
    "beat_axis": "expression",
    "response_mode": "maybe"
  },
  "context": {
    "role": "subject",
    "category": "expression_behavior",
    "package_name": "shared"
  }
}
```

#### Response

```json
{
  "valid": false,
  "errors": [
    {
      "kind": "unknown_value",
      "key": "response_mode",
      "value": "maybe",
      "allowed_values": ["receptive", "neutral", "hesitant", "boundary"]
    }
  ],
  "warnings": []
}
```

## Data Model (Conceptual)

This can start in code/static config and later move to DB if needed.

### Canonical Key Definition

```json
{
  "key": "proximity_stage",
  "description": "Discrete spatial distance stage for interaction progression.",
  "data_type": "string",
  "allowed_values": ["far", "near", "arm_reach", "close"],
  "aliases": ["distance"],
  "value_aliases": {
    "arms_reach": "arm_reach"
  },
  "applies_to": [
    { "role": "placement", "category": "depth" }
  ],
  "status": "active"
}
```

### Status Fields

- `active` (canonical)
- `deprecated` (still accepted, warn)
- `alias` (compatibility mapping only)
- `experimental` (allowed but not yet stable)

## Integration Points

### Block Matrix UI

- Use dictionary to populate axis suggestions
- Highlight canonical vs alias axis keys
- Offer one-click normalization suggestions

### Prompt Library / Template Diagnostics

- Warn when slots rely on deprecated/alias tag keys
- Suggest matrix presets based on canonical keys

### AI Tooling

- Fetch dictionary first
- Generate blocks using canonical keys/values
- Optionally call `/normalize` or `/validate` before proposing content

## Implementation Plan (Incremental)

### Phase 1 (Low risk)

- Add `GET /block-templates/meta/blocks/tag-dictionary`
- Backed by:
  - small static canonical registry in backend code
  - DB usage aggregation from `PromptBlock.tags`

### Phase 2

- Add `POST /normalize`
- Use alias registry only (no strict validation yet)

### Phase 3

- Add `POST /validate`
- Add CI/content-pack validation integration

## Notes on Runtime Querying

- Prefer canonical tags in stored blocks/templates
- Normalize on import/write where possible
- Avoid broad implicit aliasing inside runtime matching unless deterministic and logged

This keeps query behavior predictable and avoids hidden content drift.


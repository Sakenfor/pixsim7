## 84 – Ontology V1 & Parser/ActionBlock Tag Alignment

**Goal:** Promote the current ad-hoc ontology pieces (YAML + parser keywords + ActionBlock tags) into a small, coherent **Ontology V1**, and wire it through the native parser and ActionBlocks. After this task, parser output and ActionBlock tags should speak the same ontology IDs, and a dev surface should make it easy to see what’s defined vs. what’s actually used in prompts/blocks.

---

### Context

Already in place:

- **Core parser and adapter:**
  - `SimplePromptParser` in `pixsim7/backend/main/services/prompt_parser/simple.py`:
    - Sentence-level classification into roles: `character`, `action`, `setting`, `mood`, `romance`, `other`.
    - Keyword-based heuristics via `ROLE_KEYWORDS` / `ACTION_VERBS` in `prompt_parser/ontology.py`.
  - `prompt_dsl_adapter.parse_prompt_to_blocks` / `analyze_prompt`:
    - Wraps native parser output into `{prompt, blocks, tags}` for dev tools and Prompt Lab.

- **Ontology stubs:**
  - `ontology.yaml` in `pixsim7/backend/main/shared/ontology.yaml` with a first-pass ontology derived from prompt semantics (characters, anatomy parts/regions, actions, states, spatial relations, camera concepts, beats, intensity, speed, relationships).
  - `ontology.py` in `pixsim7/backend/main/shared/ontology.py`:
    - Loads and caches `ontology.yaml` into an `Ontology` object with basic lookup helpers.

- **Semantic Packs and parser hints:**
  - `SemanticPackDB` and schemas in `semantic_pack.py` / `semantic_pack_schemas.py` and API in `api/v1/semantic_packs.py`.
  - `ParserHintProvider` (`prompt_parser/hints.py`) that merges `parser_hints` from Semantic Packs into hints for the parser.
  - `SimplePromptParser` supports `hints` (role:*) to augment classification.

- **ActionBlocks:**
  - `ActionBlockDB` model in `pixsim7/backend/main/domain/action_block.py`, with `tags: Dict[str, Any]` storing semantic info (location, pose, intimacy_level, mood, intensity, etc.).
  - ActionBlocks APIs and composition engine already treat tags as semantic metadata.

Missing:

- A minimal, explicit **Ontology V1** boundary that:
  - Defines which IDs are “core” vs. domain-specific.
  - Is used consistently by parser, ActionBlocks, and Semantic Packs.
- A clear mapping layer that:
  - Converts parser hints / keywords → ontology IDs in `ParsedBlock.metadata`.
  - Encourages ActionBlock `tags` to use ontology IDs instead of ad-hoc strings.
- A dev surface to inspect ontology IDs and see where they’re used.

This task focuses on **alignment and visibility**, not on changing game logic or large-scale data migrations.

---

### Task A – Refine Ontology YAML into Core vs Domain Sections

**File:** `pixsim7/backend/main/shared/ontology.yaml`

**Goal:** Make it clear which parts of the ontology are **core categories** vs **domain-specific examples**, so systems can rely on the core structure and treat domain entries as optional overlays.

**Steps:**

- Restructure `ontology.yaml` to separate:
  - `core:` section with:
    - Top-level categories: `character`, `part`, `action`, `state`, `spatial`, `camera`, `beat`, `intensity`, `speed`.
    - Relationship definitions (unchanged in spirit, just nested under `core.relationships` or similar).
  - `domain:` section with:
    - Concrete parts/actions/states specific to the current content (e.g., `part:shaft`, `state:erect`, `act:phys_response`, etc.).
    - These can be grouped by theme (`minotaur_pack`, `soft_romance`, etc.) but that’s optional for now.

**Example shape (conceptual):**

```yaml
version: "0.1.0"
core:
  entities:
    character: { ... }  # no specific species here
    part: { ... }       # abstract notion of 'part'
    action: { ... }
    state: { ... }
    camera: { ... }
    beat: { ... }
  relationships:
    - id: "character_has_part"
      from: "character"
      to: "part"
      predicate: "has_part"
    # ...

domain:
  packs:
    default:
      anatomy_parts:
        - id: "part:shaft"
          label: "Shaft"
        - id: "part:torso"
          label: "Torso"
      states:
        - id: "state:erect"
          label: "Erect"
      actions:
        - id: "act:phys_response"
          label: "Physiological Response"
```

**Acceptance:**

- `ontology.yaml` is clearly split into `core` and `domain` sections.
- No code outside `ontology.py` breaks; `Ontology` class continues to load both sections (even if it initially only uses `core` for helpers).

---

### Task B – Expose Ontology IDs in Parser Output

**Files:**

- `pixsim7/backend/main/services/prompt_parser/simple.py`
- `pixsim7/backend/main/shared/ontology.py`

**Goal:** Extend `ParsedBlock.metadata` to include **ontology-aligned tags**, not just raw keyword flags. This does *not* change the external `prompt_dsl_adapter` API; it enriches internal metadata.

**Steps:**

- Update `Ontology` to provide a small helper for mapping keywords to ontology IDs, e.g.:

  ```py
  def match_keywords(self, text: str) -> List[str]:
      """
      Very small helper: given a lowercased text, return a list of ontology IDs
      that obviously apply (e.g., part IDs, action IDs, state IDs) based on simple
      keyword lists defined in the domain section.
      """
  ```

  - This can read keyword lists from the `domain` section or a small `keywords` map in `ontology.yaml`.
  - It does *not* need to be perfect; it’s a helper for a first pass.

- In `SimplePromptParser._classify_sentence`, after computing `metadata`:
  - Call `load_ontology()` and `match_keywords(text_lower)`.
  - Attach results under e.g.:

    ```py
    metadata["ontology_ids"] = ["part:shaft", "state:erect"]
    ```

  - Keep existing `has_*` flags; don’t remove them yet.

**Acceptance:**

- `ParsedBlock.metadata` includes an `ontology_ids` list (possibly empty) per block.
- No external API signatures change; `prompt_dsl_adapter` still returns the same `{blocks, tags}` shape.

---

### Task C – Encourage ActionBlock Tags to Use Ontology IDs

**Files:**

- `pixsim7/backend/main/domain/action_block.py`
- `pixsim7/backend/main/services/action_blocks/...` (where tags are created/edited)

**Goal:** Start using ontology IDs in `ActionBlockDB.tags` for new/edited blocks, without forcing a full migration of existing data.

**Steps:**

- Add a small helper in an appropriate service module, e.g. `action_blocks/tagging.py`:

  ```py
  from typing import Dict, Any, List

  def normalize_tags(raw_tags: Dict[str, Any]) -> Dict[str, Any]:
      """
      Take raw tag dict and, where possible, replace/augment ad-hoc strings with
      ontology IDs (e.g. 'intimacy_level': 'soft' -> 'intensity:soft').

      For now, this can be a very shallow mapping using the ontology's intensity/speed
      labels and maybe a small hand-written map.
      """
  ```

- Call `normalize_tags` in the ActionBlock creation/update paths (e.g. when an ActionBlock is created from extraction or authoring):
  - Do *not* retroactively rewrite all tags in the DB; keep this for new/modified blocks only.
- Optionally, add a dev-only endpoint or helper to show how many blocks already use ontology-style tags vs. legacy ones.

**Acceptance:**

- New ActionBlocks created through the normal flows have tags that include ontology IDs where applicable (intensity, speed, maybe a few states).
- No breaking changes to existing ActionBlocks or APIs.

---

### Task D – Wire AiModelRegistry to Native Parser (Spec Alignment Only)

**Note:** Implementation of AiModelRegistry and defaults is covered by Task 80; here we only ensure the spec expectations line up with the native parser.

**Goal:** Confirm that when Task 80 is implemented (or re-implemented), parser models are described in terms of the **native parser configs**, not prompt-dsl engines.

**Checks/Adjustments (spec-level):**

- Parser models in the catalog should be IDs like:
  - `parser:native-simple`
  - `parser:native-strict`
- `prompt_dsl_adapter` is expected to:
  - Read the default `prompt_parse` model ID from the AI model defaults table.
  - Map that ID to the appropriate `SimplePromptParser` configuration (e.g. strict vs non-strict mode, extra validation flags).

**Acceptance:**

- Task 80 spec (already updated) is consistent with the native parser (no prompt-dsl engine assumptions remain).

---

### Task E – Dev Surface: Ontology & Usage Inspector

**Goal:** Provide a small dev-only surface to see which ontology IDs exist and where they’re used in ActionBlocks and parsed prompts.

**Backend (optional but useful):**

- New dev endpoint: `GET /api/v1/dev/ontology-usage`:
  - Returns:

    ```json
    {
      "ontology_version": "0.1.0",
      "ids": [
        {
          "id": "part:shaft",
          "category": "anatomy.part",
          "action_block_count": 12,
          "example_action_block_ids": ["minotaur_approach", "..."],
          "notes": null
        },
        ...
      ]
    }
    ```

  - Implementation can:
    - Read IDs from `ontology.yaml`,
    - Do a simple scan over `ActionBlockDB.tags` (LIMITED, e.g. first N blocks) to count presence of each ID string;
    - It’s okay if this is approximate; it’s a dev tool.

**Frontend (Prompt Lab or a small dev route):**

- Either:
  - Add a small “Ontology” sub-tab under Prompt Lab’s Models tab, or
  - Add a new route `/dev/ontology-usage` that lists IDs and counts.
- Show:
  - Ontology version,
  - A table of IDs with category and usage counts,
  - Click → show example ActionBlock IDs (if provided).

**Acceptance:**

- There is a dev-only way to inspect ontology IDs and see some usage stats, which helps you evolve the ontology and tag mapping over time.

---

### Acceptance Checklist

- [ ] `ontology.yaml` is split into `core` and `domain` sections; loader still works.
- [ ] `ParsedBlock.metadata` includes an `ontology_ids` list derived via `Ontology` helpers.
- [ ] New/updated ActionBlocks pass through a `normalize_tags` helper that prefers ontology IDs where applicable (without breaking existing data).
- [ ] Task 80 spec remains aligned with the native parser (`parser:native-*` IDs, no prompt-dsl engine assumptions).
- [ ] A dev-only “Ontology Usage” inspector exists (API + simple UI) to see ontology IDs and their usage in ActionBlocks.


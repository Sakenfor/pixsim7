## 83 – Semantic Packs & Parser Hints (Shareable Prompt Semantics)

**Goal:** Introduce “Semantic Packs” as shareable, versioned bundles of prompt semantics that players/creators can create and share. Packs contain ActionBlocks, prompt families, and parser hint config (keywords/synonyms), while the core parser and ontology schema remain engine-owned. The parser reads hints from active packs but does not self-modify based on player input.

---

### Context

Current building blocks:

- **Core engine:**
  - PromptVersioning (`PromptFamily` / `PromptVersion`).
  - ActionBlocks (`ActionBlockDB`) as reusable prompt components with tags and compatibility.
  - Dev parsing via `prompt_dsl_adapter.analyze_prompt` (soon to be native parser per Task 82).
  - Planned ontology layer (Task 82’s `ontology.py` stub, future Ontology v1).

- **Player content (already shareable to some extent):**
  - Prompt families/versions (can be exported/imported via API).
  - ActionBlocks and their packages (`package_name`, tags, etc.).

Missing:

- A first-class way for players to:
  - Bundle ActionBlocks + prompts + parser hints into a named “pack”.
  - Share/import these packs between worlds/players.
  - Let the parser use pack-specific vocab (keywords/synonyms) without changing core code.

This task introduces **Semantic Packs v1** to fill that gap.

---

### Task A – Define Semantic Pack Manifest Schema

**File (backend shared schema):**

- Add: `pixsim7/backend/main/shared/schemas/semantic_pack_schemas.py`

**SemanticPackManifest (conceptual):**

```py
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from datetime import datetime


class SemanticPackStatus(str, Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    DEPRECATED = "deprecated"


class SemanticPackManifest(BaseModel):
    id: str                               # "minotaur_city_pack"
    version: str                          # "0.1.0"
    label: str                            # "Minotaur City - Core"
    description: Optional[str] = None
    author: Optional[str] = None
    created_at: Optional[datetime] = None

    # Compatibility
    ontology_version_min: Optional[str] = None
    ontology_version_max: Optional[str] = None

    # Tags/metadata (for discovery and filters)
    tags: List[str] = Field(default_factory=list)

    # Parser hints (keywords/synonyms)
    parser_hints: Dict[str, List[str]] = Field(
        default_factory=dict,
        description=(
            "Role/attribute-specific keywords, e.g. "
            "{ 'role:character': ['minotaur', 'werecow'], "
            "  'phys:size:large': ['towering', 'massive'], "
            "  'act:sit_closer': ['scoots closer'] }"
        ),
    )

    # Links to content (ActionBlocks, PromptFamilies)
    action_block_ids: List[str] = Field(default_factory=list)  # ActionBlock.block_id values
    prompt_family_slugs: List[str] = Field(default_factory=list)

    status: SemanticPackStatus = SemanticPackStatus.DRAFT
    extra: Dict[str, Any] = Field(default_factory=dict)
```

**Notes:**

- This schema is a **manifest**, not the full data; it references ActionBlocks and PromptFamilies by ID/slug.
- Actual content (blocks/prompts) stays in their existing tables; packs are a semantic grouping + hints.

---

### Task B – Semantic Packs Domain Model & Storage

**Files (backend):**

- Add: `pixsim7/backend/main/domain/semantic_pack.py` (SQLModel)

**SemanticPackDB (minimal):**

```py
from sqlmodel import SQLModel, Field, Column
from sqlalchemy import JSON
from typing import Optional, Dict, Any, List
from datetime import datetime


class SemanticPackDB(SQLModel, table=True):
    __tablename__ = "semantic_packs"

    id: str = Field(primary_key=True, max_length=100)   # Pack ID
    version: str = Field(max_length=20)
    label: str = Field(max_length=200)
    description: Optional[str] = None
    author: Optional[str] = None

    ontology_version_min: Optional[str] = None
    ontology_version_max: Optional[str] = None

    tags: List[str] = Field(default_factory=list, sa_column=Column(JSON))

    parser_hints: Dict[str, List[str]] = Field(default_factory=dict, sa_column=Column(JSON))

    action_block_ids: List[str] = Field(default_factory=list, sa_column=Column(JSON))
    prompt_family_slugs: List[str] = Field(default_factory=list, sa_column=Column(JSON))

    status: str = Field(default="draft", max_length=20)

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
```

**Notes:**

- This table stores the manifest + hints, not copies of ActionBlock/PromptVersion data.
- Keep it small and focused; advanced relationships (per-world, per-user ownership) can be added later.

---

### Task C – Semantic Packs API (Dev/Authoring)

**File:** `pixsim7/backend/main/api/v1/semantic_packs.py` (new)

**Endpoints (authoring/dev-focused):**

1. `GET /api/v1/semantic-packs`
   - List packs with filters:
     - `status`, `tag`, `author`, `ontology_version` (for compatibility).
   - Response: list of `SemanticPackManifest`.

2. `GET /api/v1/semantic-packs/{pack_id}`
   - Returns the manifest for a specific pack.

3. `POST /api/v1/semantic-packs`
   - Create or update a pack (manifest only).
   - Body: `SemanticPackManifest` (without `created_at`/derived fields).
   - Only accessible to authors (e.g. admin or a specific role).

4. `POST /api/v1/semantic-packs/{pack_id}/publish`
   - Mark a pack as `published` (status change).
   - Future: trigger validation against ontology version, check referenced IDs exist.

5. (Optional) `POST /api/v1/semantic-packs/{pack_id}/export`
   - Exports manifest + referenced ActionBlocks/PromptFamilies as a JSON bundle for sharing.

**Security:**

- Keep creation/publish endpoints dev/authoring-only for now (behind standard auth; you can later add role checks).

---

### Task D – Parser Hint Integration (Backend)

**Goal:** Let the **native PixSim7 parser** (Task 82) read hints from active packs instead of hardcoding everything in code.

**Design:**

- Introduce a small `ParserHintProvider`:

  ```py
  # pixsim7/backend/main/services/prompt_parser/hints.py
  from typing import Dict, List
  from pixsim7.backend.main.domain.semantic_pack import SemanticPackDB

  def build_role_keyword_map(packs: List[SemanticPackDB]) -> Dict[str, List[str]]:
      """
      Merge parser_hints from all active packs into a role/attribute → keywords map.
      """
      merged: Dict[str, List[str]] = {}
      for pack in packs:
          for key, words in pack.parser_hints.items():
              merged.setdefault(key, [])
              for w in words:
                  if w not in merged[key]:
                      merged[key].append(w)
      return merged
  ```

- The parser (`SimplePromptParser`) takes an optional `hints` argument:

  ```py
  class SimplePromptParser:
      async def parse(self, text: str, hints: Optional[Dict[str, List[str]]] = None) -> ParsedPrompt:
          # Use hints (if provided) to augment classification
  ```

- For dev tools (Prompt Lab, Prompt Inspector), you can initially pass `None` or a set of default packs.

**Future (not in this task):**

- Worlds or sessions can define “active packs”:
  - e.g., `GameWorld.meta.semantic_packs = ["minotaur_city_pack@0.1.0"]`.
  - Parser calls then hydrate active packs from DB and build hints before parsing.

---

### Task E – (Optional) Prompt Lab Integration: Pack Inspection

> This is optional in this task, but makes packs visible in the existing dev surfaces.

**Frontend:**

- Add a small section in Prompt Lab (Models tab or a new “Packs” tab) that calls the new API:
  - `GET /api/v1/semantic-packs`:
    - Lists available packs, their labels/tags/status.
  - `GET /api/v1/semantic-packs/{id}`:
    - Shows parser hints and referenced ActionBlocks/PromptFamilies.

This is purely read-only for now; authoring UI for packs can be a future task.

---

### Non-Goals (for this Task)

- Full Ontology v1 (canonical ID definitions and relationships). Packs will reference ontology IDs as plain strings for now.
- Per-world or per-session activation of packs (just plan for it by including `scope` fields later).
- Automatic learning of hints from player behavior (all changes are explicit via manifests).

---

### Acceptance Checklist

- [ ] `SemanticPackManifest` schema exists (shared) and describes parser hints + referenced content.
- [ ] `SemanticPackDB` table and Alembic migration exist; table stores manifest + hints, not copies of content.
- [ ] Semantic Packs API:
  - [ ] `GET /api/v1/semantic-packs` lists packs with basic filters.
  - [ ] `GET /api/v1/semantic-packs/{pack_id}` returns a pack manifest.
  - [ ] `POST /api/v1/semantic-packs` can create/update a manifest.
  - [ ] `POST /api/v1/semantic-packs/{pack_id}/publish` updates `status` to `published`.
- [ ] Parser hint integration:
  - [ ] A `ParserHintProvider` (or equivalent helper) can merge hints from one or more packs.
  - [ ] The native parser (from Task 82) can accept optional hints and use them to bias role/attribute classification.
- [ ] (Optional) Prompt Lab has a read-only view of existing semantic packs via the new API.


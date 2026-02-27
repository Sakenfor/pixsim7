# Asset Versioning System Design

**Date**: 2025-12-29
**Status**: Draft/Design Phase (v2 - addressing review feedback)

---

## Overview

Add git-like versioning to assets, allowing users to track iterations of the same conceptual asset (e.g., fixing anatomy, improving lighting) while distinguishing from creating entirely new assets.

### What Already Exists

| System | Purpose | Status |
|--------|---------|--------|
| **AssetLineage** | Multi-input derivation (3 keyframes → 1 video) | ✅ Exists |
| **AssetBranch** | Narrative branching at time points | ✅ Exists |
| **Prompt Git** | Full versioning for prompts | ✅ Exists |
| **Asset Versioning** | Quality iterations of same asset | ❌ **Missing** |

### Key Distinction

```
AssetLineage (derivation):           AssetVersion (iteration):
    [img1] [img2] [img3]                [v1: original]
         \   |   /                           ↓
          [video]                       [v2: fix hands]
                                             ↓
    "What inputs made this?"           [v3: better lighting]

                                    "Same asset, improved"
```

---

## Database Schema

### Option A: Lightweight (Recommended)

Add fields directly to `Asset` model + new `AssetVersionFamily` table:

```python
# NEW TABLE: Groups versions together
class AssetVersionFamily(SQLModel, table=True):
    """
    Groups all versions of the same conceptual asset.
    Analogous to PromptFamily for prompts.

    INVARIANT: head_asset_id must point to an asset in this family.
    """
    __tablename__ = "asset_version_families"

    id: UUID = Field(default_factory=uuid4, primary_key=True)

    # Identity
    name: Optional[str] = Field(
        default=None,
        max_length=255,
        description="User-friendly name: 'Beach sunset scene'"
    )
    description: Optional[str] = None

    # Classification
    tags: List[str] = Field(
        default_factory=list,
        sa_column=Column(JSON),
        description="Family-level tags"
    )

    # Head pointer (like git HEAD) - SINGLE SOURCE OF TRUTH for current version
    # No separate is_version_head flag on Asset to avoid drift
    head_asset_id: Optional[int] = Field(
        default=None,
        foreign_key="assets.id",
        description="Current 'best' version (user can change)"
    )

    # Owner
    user_id: int = Field(foreign_key="users.id", index=True)

    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    __table_args__ = (
        Index("idx_avf_user_updated", "user_id", "updated_at"),
    )

    # NOTE: version_count and latest_version_number are DERIVED, not stored.
    # Query: SELECT COUNT(*), MAX(version_number) FROM assets WHERE version_family_id = ?
    # This avoids concurrency issues with denormalized counters.
```

```python
# ADDITIONS TO Asset model
class Asset(SQLModel, table=True):
    # ... existing fields ...

    # ===== VERSIONING (NEW) =====
    version_family_id: Optional[UUID] = Field(
        default=None,
        foreign_key="asset_version_families.id",
        index=True,
        ondelete="SET NULL",  # Family deleted -> assets become standalone
        description="Version group (NULL = standalone asset)"
    )
    version_number: Optional[int] = Field(
        default=None,
        description="Version within family (1, 2, 3...). NOT NULL when family_id set."
    )
    parent_asset_id: Optional[int] = Field(
        default=None,
        foreign_key="assets.id",
        index=True,
        ondelete="SET NULL",  # Parent deleted -> keep asset, just lose parent ref
        description="Direct parent version (for version chain navigation)"
    )
    version_message: Optional[str] = Field(
        default=None,
        max_length=500,
        description="What changed: 'Fixed hand anatomy', 'Improved lighting'"
    )
    # NOTE: No is_version_head flag - use AssetVersionFamily.head_asset_id instead
    # to avoid dual-marker drift
```

### Constraints and Indexes

```sql
-- UNIQUE: Only one asset can have a given version number within a family
CREATE UNIQUE INDEX idx_asset_version_family_number
    ON assets (version_family_id, version_number)
    WHERE version_family_id IS NOT NULL;

-- CHECK: If in a family, must have a version number
ALTER TABLE assets ADD CONSTRAINT chk_version_consistency
    CHECK (version_family_id IS NULL OR version_number IS NOT NULL);

-- CHECK: version_number must be positive
ALTER TABLE assets ADD CONSTRAINT chk_version_positive
    CHECK (version_number IS NULL OR version_number > 0);

-- INDEX: Find parent chain
CREATE INDEX idx_asset_parent_version ON assets (parent_asset_id)
    WHERE parent_asset_id IS NOT NULL;

-- FK behavior
ALTER TABLE assets
    ADD CONSTRAINT fk_asset_version_family
    FOREIGN KEY (version_family_id)
    REFERENCES asset_version_families(id)
    ON DELETE SET NULL;

ALTER TABLE assets
    ADD CONSTRAINT fk_asset_parent_version
    FOREIGN KEY (parent_asset_id)
    REFERENCES assets(id)
    ON DELETE SET NULL;
```

---

## API Changes

### 1. Generation Request: Add Version Intent

```python
# In generation schemas
class GenerationCreateRequest(BaseModel):
    # ... existing fields ...

    # NEW: Version intent
    version_intent: Literal["new", "version"] = Field(
        default="new",
        description="'new' = create independent asset, 'version' = iterate on input asset"
    )
    version_message: Optional[str] = Field(
        default=None,
        max_length=500,
        description="What changed in this version (for version_intent='version')"
    )
```

### 2. Version Resolution Logic

```python
# In generation creation service
async def resolve_version_intent(
    input_assets: list[Asset],
    version_intent: str,
    version_message: str | None,
    user_id: int,
    db: AsyncSession
) -> VersionContext:
    """
    Determines version family and number for new asset.

    VALIDATION:
    - version_intent="version" requires exactly ONE input asset
    - version_intent="new" works with any number of inputs

    CONCURRENCY:
    - Uses SELECT FOR UPDATE on family row to prevent duplicate version numbers
    - Version number derived from MAX(version_number) within transaction

    Returns:
        VersionContext with family_id, version_number, parent_asset_id
    """
    # Validation for version intent
    if version_intent == "version":
        if len(input_assets) == 0:
            raise ValueError("version_intent='version' requires an input asset")
        if len(input_assets) > 1:
            raise ValueError(
                "version_intent='version' requires exactly one input asset. "
                "For multiple inputs, use version_intent='new'."
            )
        input_asset = input_assets[0]
    else:
        input_asset = None

    if version_intent == "new" or input_asset is None:
        # New standalone asset (no versioning)
        return VersionContext(
            family_id=None,
            version_number=None,
            parent_asset_id=None,
            version_message=None
        )

    # version_intent == "version" with single input
    if input_asset.version_family_id:
        # Input is already versioned - continue the chain
        # Lock family row to prevent concurrent version number assignment
        family = await db.execute(
            select(AssetVersionFamily)
            .where(AssetVersionFamily.id == input_asset.version_family_id)
            .with_for_update()
        )
        family = family.scalar_one()

        # Get next version number atomically
        max_version = await db.execute(
            select(func.max(Asset.version_number))
            .where(Asset.version_family_id == family.id)
        )
        next_version = (max_version.scalar() or 0) + 1

        return VersionContext(
            family_id=family.id,
            version_number=next_version,
            parent_asset_id=input_asset.id,
            version_message=version_message
        )
    else:
        # Input is standalone - UPGRADE it to v1 and create family
        family = await create_family_and_upgrade_source(
            db, input_asset, user_id
        )
        return VersionContext(
            family_id=family.id,
            version_number=2,  # New asset will be v2
            parent_asset_id=input_asset.id,
            version_message=version_message
        )


async def create_family_and_upgrade_source(
    db: AsyncSession,
    source_asset: Asset,
    user_id: int
) -> AssetVersionFamily:
    """
    Creates a new version family and upgrades the source asset to v1.

    CRITICAL: Must update source_asset to be part of the family,
    otherwise we'd have a family with v2 but no v1.
    """
    # Create family
    family = AssetVersionFamily(
        name=source_asset.description or f"Asset {source_asset.id}",
        user_id=user_id,
        head_asset_id=source_asset.id,  # Source is initially head
    )
    db.add(family)
    await db.flush()  # Get family.id

    # UPGRADE source asset to v1 of this family
    source_asset.version_family_id = family.id
    source_asset.version_number = 1
    source_asset.parent_asset_id = None  # v1 has no parent
    source_asset.version_message = "Initial version"

    await db.flush()
    return family


@dataclass
class VersionContext:
    family_id: UUID | None
    version_number: int | None
    parent_asset_id: int | None
    version_message: str | None
```

### 3. New API Endpoints

```python
# Asset version endpoints
router = APIRouter(prefix="/assets/versions", tags=["Asset Versions"])

@router.get("/families/{family_id}")
async def get_version_family(family_id: UUID) -> AssetVersionFamilyResponse:
    """Get version family with all versions"""

@router.get("/families/{family_id}/timeline")
async def get_family_timeline(family_id: UUID) -> List[VersionTimelineEntry]:
    """Get timeline view of all versions"""

@router.post("/families/{family_id}/set-head")
async def set_family_head(family_id: UUID, asset_id: int) -> AssetVersionFamilyResponse:
    """Set which version is the 'current best'"""

@router.get("/assets/{asset_id}/versions")
async def get_asset_versions(asset_id: int) -> List[AssetVersionSummary]:
    """Get all versions of an asset (if versioned)"""

@router.post("/assets/{asset_id}/fork")
async def fork_version(
    asset_id: int,
    fork_name: Optional[str] = None
) -> AssetVersionFamilyResponse:
    """
    Create new family starting from this asset (branching).

    SEMANTICS:
    - Creates a NEW family with source asset as v1
    - Source asset is COPIED to new family (not moved)
    - If source belongs to existing family: it stays there, copy becomes v1 of new family
    - If source is standalone: it stays standalone, copy becomes v1 of new family

    This allows "I want to take this version and start a new direction"
    without affecting the original family's history.

    Returns the new family with the forked asset as v1 and head.
    """
```

---

## How It Integrates with Existing Systems

### AssetLineage + Versioning

Both can coexist - they serve different purposes:

```
Generation request:
  - input_asset_ids: [123]           # For AssetLineage (derivation)
  - version_intent: "version"        # For versioning (iteration)
  - version_message: "Fix hands"

Result:
  - New Asset (id=456) created
  - AssetLineage record: 123 → 456 (derivation edge)
  - Asset.parent_asset_id = 123 (version chain)
  - Asset.version_family_id = same as 123's family
```

### parentGeneration + Versioning

`parentGeneration` tracks generation→generation chains.
Versioning tracks asset→asset semantic iterations.

```
Gen1 (text_to_image) → Asset1 (original portrait)
  ↓
Gen2 (image_to_image, parentGeneration=Gen1)
  - version_intent: "version"
  → Asset2 (version_family_id = Asset1's family, v2)

Gen3 (image_to_image, parentGeneration=Gen2)
  - version_intent: "new"
  → Asset3 (version_family_id = NULL, new standalone)
```

---

## Migration Strategy

### Phase 1: Schema Only
1. Add `asset_version_families` table
2. Add new columns to `assets` table (nullable initially)
3. Add constraints and indexes
4. No data migration needed - existing assets remain unversioned (NULL family)

```python
# Migration
def upgrade():
    # Create families table (NO denormalized counters - derived at query time)
    op.create_table(
        'asset_version_families',
        sa.Column('id', UUID(), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('name', sa.String(255), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('tags', JSON(), nullable=False, server_default='[]'),
        sa.Column('head_asset_id', sa.Integer(), nullable=True),  # FK added after assets columns
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
    )
    op.create_index('idx_avf_user_updated', 'asset_version_families', ['user_id', 'updated_at'])

    # Add columns to assets
    op.add_column('assets', sa.Column('version_family_id', UUID(), nullable=True))
    op.add_column('assets', sa.Column('version_number', sa.Integer(), nullable=True))
    op.add_column('assets', sa.Column('parent_asset_id', sa.Integer(), nullable=True))
    op.add_column('assets', sa.Column('version_message', sa.String(500), nullable=True))

    # Add foreign keys with ON DELETE SET NULL
    op.create_foreign_key(
        'fk_asset_version_family', 'assets', 'asset_version_families',
        ['version_family_id'], ['id'], ondelete='SET NULL'
    )
    op.create_foreign_key(
        'fk_asset_parent_version', 'assets', 'assets',
        ['parent_asset_id'], ['id'], ondelete='SET NULL'
    )

    # Now add FK from family to asset (circular ref)
    op.create_foreign_key(
        'fk_avf_head_asset', 'asset_version_families', 'assets',
        ['head_asset_id'], ['id'], ondelete='SET NULL'
    )

    # Add unique index for version numbers within family
    op.execute("""
        CREATE UNIQUE INDEX idx_asset_version_family_number
        ON assets (version_family_id, version_number)
        WHERE version_family_id IS NOT NULL
    """)

    # Add partial index for parent lookups
    op.execute("""
        CREATE INDEX idx_asset_parent_version
        ON assets (parent_asset_id)
        WHERE parent_asset_id IS NOT NULL
    """)

    # Add CHECK constraints
    op.execute("""
        ALTER TABLE assets ADD CONSTRAINT chk_version_consistency
        CHECK (version_family_id IS NULL OR version_number IS NOT NULL)
    """)
    op.execute("""
        ALTER TABLE assets ADD CONSTRAINT chk_version_positive
        CHECK (version_number IS NULL OR version_number > 0)
    """)


def downgrade():
    op.drop_constraint('chk_version_positive', 'assets')
    op.drop_constraint('chk_version_consistency', 'assets')
    op.drop_index('idx_asset_parent_version', 'assets')
    op.drop_index('idx_asset_version_family_number', 'assets')
    op.drop_constraint('fk_avf_head_asset', 'asset_version_families')
    op.drop_constraint('fk_asset_parent_version', 'assets')
    op.drop_constraint('fk_asset_version_family', 'assets')
    op.drop_column('assets', 'version_message')
    op.drop_column('assets', 'parent_asset_id')
    op.drop_column('assets', 'version_number')
    op.drop_column('assets', 'version_family_id')
    op.drop_table('asset_version_families')
```

### Phase 2: API Support
1. Add `version_intent` to generation request
2. Add version resolution logic
3. Add version family endpoints

### Phase 3: UI Integration
1. Version choice in generation UI
2. Version history viewer
3. Family timeline visualization

---

## UI/UX Flow

### Generation Panel (when input asset selected)

```
+-----------------------------------------------------------+
| Generate from: Beach Portrait #123                         |
|                                                            |
| +-------------------------------------------------------+  |
| | Version Intent                                        |  |
| |                                                       |  |
| | ( ) Create new version                                |  |
| |     Iterate on this asset (fix issues, improve)       |  |
| |     +-----------------------------------------------+ |  |
| |     | What changed? (optional)                      | |  |
| |     | [Fix hand anatomy                           ] | |  |
| |     +-----------------------------------------------+ |  |
| |                                                       |  |
| | ( ) Create new independent asset                      |  |
| |     Start fresh (different concept/direction)         |  |
| +-------------------------------------------------------+  |
|                                                            |
|                                         [Generate]         |
+-----------------------------------------------------------+
```

### Asset Viewer - Version History

```
+-----------------------------------------------------------+
| Beach Portrait                                   [v3 HEAD] |
+-----------------------------------------------------------+
|                                                            |
|  +----------+                                              |
|  |          |  Version 3 (HEAD)                            |
|  |  [img]   |  "Improved lighting and color grading"       |
|  |          |  2 hours ago                                 |
|  +----------+                                              |
|       |                                                    |
|       v                                                    |
|  +----------+                                              |
|  |          |  Version 2                                   |
|  |  [img]   |  "Fixed hand anatomy"                        |
|  |          |  5 hours ago                                 |
|  +----------+                                              |
|       |                                                    |
|       v                                                    |
|  +----------+                                              |
|  |          |  Version 1 (original)                        |
|  |  [img]   |  Initial generation                          |
|  |          |  Yesterday                                   |
|  +----------+                                              |
|                                                            |
|  [Set as HEAD] [Compare Versions] [Fork New Direction]     |
+-----------------------------------------------------------+
```

---

## Universal Versioned Entity Pattern (Optional)

If you want to share logic between prompt versioning and asset versioning:

```python
# Shared mixin for versioned entities
class VersionedEntityMixin:
    """
    Common fields/methods for git-like versioned entities.
    Used by both PromptVersion and Asset (when versioned).
    """
    # These would be abstract - implemented differently per entity

    @property
    def family_id(self) -> UUID | None:
        """The family/group this version belongs to"""
        raise NotImplementedError

    @property
    def version_number(self) -> int | None:
        """Sequential version number within family"""
        raise NotImplementedError

    @property
    def parent_id(self) -> Any | None:
        """Parent version ID (for chain navigation)"""
        raise NotImplementedError


# Shared service logic
class VersioningService(Generic[T]):
    """
    Shared versioning operations that work for any versioned entity.
    """

    async def get_timeline(self, family_id: UUID) -> List[TimelineEntry]:
        """Get chronological timeline of all versions"""

    async def get_ancestry(self, entity_id: Any) -> List[T]:
        """Get all ancestors (parents, grandparents, etc.)"""

    async def get_descendants(self, entity_id: Any) -> List[T]:
        """Get all descendants (children, grandchildren, etc.)"""

    async def compare_versions(self, id_a: Any, id_b: Any) -> VersionDiff:
        """Compare two versions"""
```

---

## Edge Cases and Invariants

### Invariants (enforced by constraints)

| Invariant | Enforcement |
|-----------|-------------|
| If `version_family_id` is set, `version_number` must be set | CHECK constraint |
| `version_number` must be positive (> 0) | CHECK constraint |
| Only one asset per (family, version_number) | UNIQUE partial index |
| `head_asset_id` must belong to that family | Application-level (validated in service) |

### Edge Cases

| Case | Behavior |
|------|----------|
| `version_intent="version"` with 0 inputs | Error: "requires an input asset" |
| `version_intent="version"` with 2+ inputs | Error: "requires exactly one input asset" |
| `version_intent="new"` with 0 inputs | OK: create standalone asset |
| `version_intent="new"` with N inputs | OK: create standalone asset (inputs recorded in AssetLineage) |
| Concurrent version creation | Row lock on family via `SELECT FOR UPDATE`; version number from `MAX()` |
| Delete asset that is HEAD | Family's `head_asset_id` set to NULL (FK ON DELETE SET NULL); service should pick new HEAD |
| Delete asset that is parent | Child's `parent_asset_id` set to NULL (FK ON DELETE SET NULL); chain broken but versions remain |
| Delete family | All assets' `version_family_id` set to NULL (FK ON DELETE SET NULL); assets become standalone |
| Fork from versioned asset | Creates NEW family; source asset stays in original family unchanged |
| Fork from standalone asset | Creates NEW family with copy as v1; source stays standalone |
| Set HEAD to asset not in family | Error: validation rejects |

### Deletion Cascading

```
Family deleted:
  -> All assets: version_family_id = NULL, become standalone
  -> Assets keep their content, just lose version metadata

Asset deleted (was HEAD):
  -> Family: head_asset_id = NULL
  -> Service should auto-elect new HEAD (e.g., highest version_number)

Asset deleted (was parent):
  -> Children: parent_asset_id = NULL
  -> Version chain has a gap but versions still belong to family
```

### Concurrency Scenario

```
T1: User A creates version from Asset #1 (v1)
T2: User B creates version from Asset #1 (v1) [concurrent]

Without locking:
  T1: reads MAX(version_number)=1, assigns v2
  T2: reads MAX(version_number)=1, assigns v2
  -> UNIQUE constraint violation on insert

With SELECT FOR UPDATE:
  T1: locks family row, reads MAX=1, assigns v2, inserts, commits
  T2: waits for lock, then reads MAX=2, assigns v3, inserts, commits
  -> Both succeed with correct version numbers
```

---

## Summary

### What This Adds

| Component | Purpose |
|-----------|---------|
| `AssetVersionFamily` | Groups versions together (like PromptFamily) |
| `Asset.version_family_id` | Links asset to its family (NULL = standalone) |
| `Asset.version_number` | Sequential number within family (1, 2, 3...) |
| `Asset.parent_asset_id` | Direct parent for chain navigation |
| `Asset.version_message` | What changed ("Fixed hands") |
| `GenerationRequest.version_intent` | User choice: "new" or "version" |

### What It Doesn't Change

- **AssetLineage** (multi-input derivation) - unchanged, coexists
- **AssetBranch** (narrative branching) - unchanged, different use case
- **parentGeneration** (generation chains) - unchanged, different layer

### Key Design Decisions

1. **Single HEAD marker** - `AssetVersionFamily.head_asset_id` only (no per-asset flag)
2. **Derived counters** - No denormalized `version_count`; query `MAX(version_number)`
3. **Row locking** - `SELECT FOR UPDATE` on family to prevent duplicate version numbers
4. **Standalone upgrade** - When versioning a standalone asset, it becomes v1 in new family
5. **Soft cascading** - FK `ON DELETE SET NULL` preserves assets when family/parent deleted

### Key User Benefit

> "I fixed the hands in this portrait. Is this a new asset, or version 2 of the same portrait?"
>
> Now users explicitly choose at generation time, and the system tracks it with proper versioning, history, and HEAD management.

---

## Next Steps

1. [ ] Review and approve design (v2)
2. [ ] Create database migration
3. [ ] Implement version resolution in generation service
4. [ ] Add API endpoints
5. [ ] Build UI components
6. [ ] Add auto-HEAD election on HEAD asset deletion

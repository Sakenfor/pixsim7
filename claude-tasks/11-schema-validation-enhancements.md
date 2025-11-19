# Task 11 (Part 2) – Schema Validation Enhancements

## Context

This is a continuation of **Task 11: World-Aware Session Normalization & Schema Validation**, which implemented:
- ✅ Basic Pydantic models for relationship and intimacy schemas
- ✅ API validation on world create/update (HTTP 400 on type errors)
- ✅ World-aware session normalization using validated schemas

**What's Missing:**
While basic structure validation exists (correct field types), there are **no field-level validators** to catch logical errors like:
- `min > max` (e.g., `{"id": "friend", "min": 60, "max": 40}`)
- Overlapping tier ranges (ambiguous matching)
- Invalid value ranges (values outside 0-100)
- Duplicate tier/level IDs
- Coverage gaps in schemas

Additionally, only **relationship** and **intimacy** schemas are validated. Other world schemas like `npc_mood_schema` and `reputation_schemas` have no validation at all.

**The Risk:**
```python
# This currently PASSES validation but breaks everything at runtime:
world.meta = {
    "relationship_schemas": {
        "default": {
            "tiers": [
                {"id": "friend", "min": 60, "max": 40}  # min > max!
            ]
        }
    }
}
```

**The Goal:**
Add comprehensive field validators, cross-entry validators, and extend validation to all world schema types (mood, reputation, etc.).

**Related Files**:
- `pixsim7_backend/domain/game/schemas.py` – Schema validation models
- `pixsim7_backend/api/v1/game_worlds.py` – World API with validation
- `pixsim7_backend/domain/metrics/mood_evaluators.py` – Mood schema usage
- `pixsim7_backend/domain/metrics/reputation_evaluators.py` – Reputation schema usage
- `docs/SOCIAL_METRICS.md` – Schema documentation
- `claude-tasks/11-world-aware-session-normalization-and-schema-validation.md` – Part 1

## Phase Checklist

- [ ] **Phase 11** – Add field validators for relationship and intimacy schemas
- [ ] **Phase 12** – Add mood schema validation (general + intimate domains)
- [ ] **Phase 13** – Add reputation schema validation
- [ ] **Phase 14** – Add cross-entry validators (overlaps, duplicates, gaps)
- [ ] **Phase 15** – Add batch validation endpoint and diagnostics
- [ ] **Phase 16** – Add schema migration helpers
- [ ] **Phase 17** – Add schema editor validation UI
- [ ] **Phase 18** – Add schema testing and simulation tools
- [ ] **Phase 19** – Add schema versioning and deprecation support
- [ ] **Phase 20** – Add schema analytics and usage tracking

---

## Phase 11 – Add Field Validators for Relationship and Intimacy Schemas

**Goal**: Add Pydantic validators to catch logical errors in tier and intimacy level definitions.

**Scope**:
- `RelationshipTierSchema` validators
- `IntimacyLevelSchema` validators
- Value range validation
- Update existing API tests

**Key Steps**:
1. Add validators to `RelationshipTierSchema`:
   ```python
   from pydantic import field_validator, model_validator

   class RelationshipTierSchema(BaseModel):
       id: str
       min: float
       max: Optional[float] = None

       @field_validator('id')
       @classmethod
       def id_not_empty(cls, v: str) -> str:
           if not v or not v.strip():
               raise ValueError('Tier ID cannot be empty')
           return v.strip()

       @field_validator('min')
       @classmethod
       def min_in_range(cls, v: float) -> float:
           if v < 0 or v > 100:
               raise ValueError('min must be between 0 and 100')
           return v

       @field_validator('max')
       @classmethod
       def max_in_range(cls, v: Optional[float]) -> Optional[float]:
           if v is not None and (v < 0 or v > 100):
               raise ValueError('max must be between 0 and 100')
           return v

       @model_validator(mode='after')
       def validate_min_max_relationship(self):
           if self.max is not None and self.max < self.min:
               raise ValueError(f'max ({self.max}) must be >= min ({self.min})')
           return self
   ```

2. Add validators to `IntimacyLevelSchema`:
   ```python
   class IntimacyLevelSchema(BaseModel):
       id: str
       minAffinity: Optional[float] = None
       minTrust: Optional[float] = None
       minChemistry: Optional[float] = None
       maxTension: Optional[float] = None

       @field_validator('id')
       @classmethod
       def id_not_empty(cls, v: str) -> str:
           if not v or not v.strip():
               raise ValueError('Intimacy level ID cannot be empty')
           return v.strip()

       @field_validator('minAffinity', 'minTrust', 'minChemistry', 'maxTension')
       @classmethod
       def value_in_range(cls, v: Optional[float]) -> Optional[float]:
           if v is not None and (v < 0 or v > 100):
               raise ValueError(f'Value must be between 0 and 100, got {v}')
           return v

       @model_validator(mode='after')
       def has_at_least_one_threshold(self):
           if not any([
               self.minAffinity is not None,
               self.minTrust is not None,
               self.minChemistry is not None,
               self.maxTension is not None
           ]):
               raise ValueError('Intimacy level must have at least one threshold defined')
           return self
   ```

3. Add unit tests for validators:
   ```python
   # Test min > max rejection
   with pytest.raises(ValidationError):
       RelationshipTierSchema(id="friend", min=60, max=40)

   # Test out-of-range values
   with pytest.raises(ValidationError):
       RelationshipTierSchema(id="friend", min=-10, max=50)

   # Test empty ID
   with pytest.raises(ValidationError):
       RelationshipTierSchema(id="", min=0, max=50)

   # Test intimacy level with no thresholds
   with pytest.raises(ValidationError):
       IntimacyLevelSchema(id="test")
   ```

4. Update API error messages to provide clear feedback:
   - Extract validation errors into user-friendly format
   - Include which field failed and why
   - Provide example of correct schema

**Deliverables**:
- Enhanced `RelationshipTierSchema` with validators
- Enhanced `IntimacyLevelSchema` with validators
- Comprehensive unit tests for all validator cases
- Updated API error responses with clear feedback

---

## Phase 12 – Add Mood Schema Validation

**Goal**: Validate `npc_mood_schema` to prevent invalid mood configurations.

**Scope**:
- General mood schema validation (valence/arousal quadrants)
- Intimate mood schema validation
- Support for both legacy and domain-based formats
- Integration with world meta validation

**Key Steps**:
1. Create mood schema Pydantic models:
   ```python
   class GeneralMoodSchema(BaseModel):
       """
       General mood definition using valence/arousal ranges.

       Example:
       {
           "id": "excited",
           "valence_min": 50,
           "valence_max": 100,
           "arousal_min": 50,
           "arousal_max": 100
       }
       """
       id: str
       valence_min: float = Field(ge=0, le=100)
       valence_max: float = Field(ge=0, le=100)
       arousal_min: float = Field(ge=0, le=100)
       arousal_max: float = Field(ge=0, le=100)

       @field_validator('id')
       @classmethod
       def id_not_empty(cls, v: str) -> str:
           if not v or not v.strip():
               raise ValueError('Mood ID cannot be empty')
           return v.strip()

       @model_validator(mode='after')
       def validate_ranges(self):
           if self.valence_max < self.valence_min:
               raise ValueError(f'valence_max ({self.valence_max}) must be >= valence_min ({self.valence_min})')
           if self.arousal_max < self.arousal_min:
               raise ValueError(f'arousal_max ({self.arousal_max}) must be >= arousal_min ({self.arousal_min})')
           return self

   class IntimateMoodSchema(BaseModel):
       """
       Intimate mood definition using relationship axes.

       Example:
       {
           "id": "playful",
           "chemistry_min": 0,
           "chemistry_max": 60,
           "trust_min": 0,
           "trust_max": 100,
           "tension_min": 0,
           "tension_max": 100
       }
       """
       id: str
       chemistry_min: float = Field(default=0, ge=0, le=100)
       chemistry_max: float = Field(default=100, ge=0, le=100)
       trust_min: float = Field(default=0, ge=0, le=100)
       trust_max: float = Field(default=100, ge=0, le=100)
       tension_min: float = Field(default=0, ge=0, le=100)
       tension_max: float = Field(default=100, ge=0, le=100)

       @field_validator('id')
       @classmethod
       def id_not_empty(cls, v: str) -> str:
           if not v or not v.strip():
               raise ValueError('Mood ID cannot be empty')
           return v.strip()

       @model_validator(mode='after')
       def validate_ranges(self):
           if self.chemistry_max < self.chemistry_min:
               raise ValueError(f'chemistry_max must be >= chemistry_min')
           if self.trust_max < self.trust_min:
               raise ValueError(f'trust_max must be >= trust_min')
           if self.tension_max < self.tension_min:
               raise ValueError(f'tension_max must be >= tension_min')
           return self

   class MoodSchemaConfig(BaseModel):
       """
       Container for mood schemas (supports both legacy and domain-based formats).

       Domain-based format (new):
       {
           "general": {"moods": [GeneralMoodSchema, ...]},
           "intimate": {"moods": [IntimateMoodSchema, ...]}
       }

       Legacy format:
       {
           "moods": [GeneralMoodSchema, ...]
       }
       """
       # Legacy format
       moods: Optional[List[GeneralMoodSchema]] = None

       # Domain-based format
       general: Optional[Dict[str, List[GeneralMoodSchema]]] = None
       intimate: Optional[Dict[str, List[IntimateMoodSchema]]] = None

       @model_validator(mode='after')
       def has_at_least_one_format(self):
           if self.moods is None and self.general is None and self.intimate is None:
               raise ValueError('Mood schema must have either legacy "moods" or domain-based "general"/"intimate"')
           return self
   ```

2. Add mood schema to `WorldMetaSchemas`:
   ```python
   class WorldMetaSchemas(BaseModel):
       relationship_schemas: Dict[str, List[RelationshipTierSchema]] = Field(default_factory=dict)
       intimacy_schema: Optional[IntimacySchema] = None
       npc_mood_schema: Optional[MoodSchemaConfig] = None  # NEW

       class Config:
           extra = "ignore"
   ```

3. Add tests for mood schema validation:
   - Test legacy format validation
   - Test domain-based format validation
   - Test invalid ranges (min > max)
   - Test out-of-range values (<0 or >100)
   - Test empty mood IDs

4. Update `mood_evaluators.py` to reference validated schema structure in comments

**Deliverables**:
- `GeneralMoodSchema` and `IntimateMoodSchema` models
- `MoodSchemaConfig` container supporting both formats
- Integration with `WorldMetaSchemas`
- Comprehensive tests for mood schema validation
- Documentation update in `SOCIAL_METRICS.md`

---

## Phase 13 – Add Reputation Schema Validation

**Goal**: Validate `reputation_schemas` to prevent invalid reputation band configurations.

**Scope**:
- Reputation band schema validation
- Support for target-type-specific schemas (npc, faction, group)
- Integration with world meta validation

**Key Steps**:
1. Create reputation schema Pydantic models:
   ```python
   class ReputationBandSchema(BaseModel):
       """
       Schema entry for a single reputation band.

       Example:
       {
           "id": "enemy",
           "min": 0,
           "max": 20
       }
       """
       id: str
       min: float = Field(ge=0, le=100)
       max: float = Field(ge=0, le=100)
       label: Optional[str] = None

       @field_validator('id')
       @classmethod
       def id_not_empty(cls, v: str) -> str:
           if not v or not v.strip():
               raise ValueError('Reputation band ID cannot be empty')
           return v.strip()

       @model_validator(mode='after')
       def validate_min_max(self):
           if self.max < self.min:
               raise ValueError(f'max ({self.max}) must be >= min ({self.min})')
           return self

   class ReputationSchemaConfig(BaseModel):
       """
       Container for reputation bands, can be target-type-specific.

       Example:
       {
           "bands": [ReputationBandSchema, ...]
       }
       """
       bands: List[ReputationBandSchema] = Field(min_length=1)

       @field_validator('bands')
       @classmethod
       def bands_not_empty(cls, v: List[ReputationBandSchema]) -> List[ReputationBandSchema]:
           if not v:
               raise ValueError('Reputation schema must have at least one band')
           return v
   ```

2. Add reputation schema to `WorldMetaSchemas`:
   ```python
   class WorldMetaSchemas(BaseModel):
       relationship_schemas: Dict[str, List[RelationshipTierSchema]] = Field(default_factory=dict)
       intimacy_schema: Optional[IntimacySchema] = None
       npc_mood_schema: Optional[MoodSchemaConfig] = None
       reputation_schemas: Optional[Dict[str, ReputationSchemaConfig]] = None  # NEW
       # Key = target type ("default", "npc", "faction", "group", etc.)

       class Config:
           extra = "ignore"
   ```

3. Add tests for reputation schema validation:
   - Test single band schema
   - Test multi-band schema
   - Test target-type-specific schemas
   - Test invalid ranges (min > max)
   - Test empty bands list

4. Update `reputation_evaluators.py` to reference validated schema structure

**Deliverables**:
- `ReputationBandSchema` and `ReputationSchemaConfig` models
- Integration with `WorldMetaSchemas`
- Comprehensive tests for reputation schema validation
- Documentation update in `SOCIAL_METRICS.md`

---

## Phase 14 – Add Cross-Entry Validators

**Goal**: Detect conflicts across multiple schema entries (overlapping ranges, duplicate IDs, coverage gaps).

**Scope**:
- Overlapping range detection
- Duplicate ID detection
- Coverage gap detection (optional warning)
- Apply to all schema types

**Key Steps**:
1. Add collection-level validators to schema containers:
   ```python
   class IntimacySchema(BaseModel):
       levels: List[IntimacyLevelSchema] = Field(default_factory=list)

       @model_validator(mode='after')
       def validate_unique_ids(self):
           ids = [level.id for level in self.levels]
           duplicates = [id for id in ids if ids.count(id) > 1]
           if duplicates:
               raise ValueError(f'Duplicate intimacy level IDs found: {set(duplicates)}')
           return self

   class MoodSchemaConfig(BaseModel):
       # ... existing fields ...

       @model_validator(mode='after')
       def validate_no_duplicate_ids(self):
           all_ids = []

           # Collect IDs from legacy format
           if self.moods:
               all_ids.extend([m.id for m in self.moods])

           # Collect IDs from domain-based format
           if self.general and 'moods' in self.general:
               all_ids.extend([m.id for m in self.general['moods']])
           if self.intimate and 'moods' in self.intimate:
               all_ids.extend([m.id for m in self.intimate['moods']])

           duplicates = [id for id in all_ids if all_ids.count(id) > 1]
           if duplicates:
               raise ValueError(f'Duplicate mood IDs found: {set(duplicates)}')
           return self
   ```

2. Add helper for detecting overlapping ranges:
   ```python
   def detect_tier_overlaps(tiers: List[RelationshipTierSchema]) -> List[str]:
       """
       Detect overlapping tier ranges.

       Returns list of overlap descriptions, empty if no overlaps.
       """
       overlaps = []
       sorted_tiers = sorted(tiers, key=lambda t: t.min)

       for i, tier1 in enumerate(sorted_tiers):
           for tier2 in sorted_tiers[i+1:]:
               # Check if ranges overlap
               tier1_max = tier1.max if tier1.max is not None else 100
               tier2_max = tier2.max if tier2.max is not None else 100

               if tier1_max > tier2.min:
                   overlaps.append(
                       f'Tiers "{tier1.id}" ({tier1.min}-{tier1_max}) '
                       f'and "{tier2.id}" ({tier2.min}-{tier2_max}) overlap'
                   )

       return overlaps
   ```

3. Add optional coverage gap detection:
   ```python
   def detect_tier_gaps(tiers: List[RelationshipTierSchema]) -> List[str]:
       """
       Detect gaps in tier coverage (optional warning, not error).

       Returns list of gap descriptions.
       """
       gaps = []
       sorted_tiers = sorted(tiers, key=lambda t: t.min)

       for i in range(len(sorted_tiers) - 1):
           tier1 = sorted_tiers[i]
           tier2 = sorted_tiers[i + 1]
           tier1_max = tier1.max if tier1.max is not None else 100

           if tier1_max < tier2.min:
               gaps.append(
                   f'Gap between "{tier1.id}" (ends at {tier1_max}) '
                   f'and "{tier2.id}" (starts at {tier2.min})'
               )

       return gaps
   ```

4. Add validators to schema containers:
   ```python
   class WorldMetaSchemas(BaseModel):
       # ... existing fields ...

       @model_validator(mode='after')
       def validate_relationship_schemas(self):
           for schema_key, tiers in self.relationship_schemas.items():
               # Check for overlaps
               overlaps = detect_tier_overlaps(tiers)
               if overlaps:
                   raise ValueError(
                       f'Overlapping tiers in relationship schema "{schema_key}": '
                       f'{"; ".join(overlaps)}'
                   )

               # Check for duplicate IDs
               ids = [t.id for t in tiers]
               duplicates = [id for id in ids if ids.count(id) > 1]
               if duplicates:
                   raise ValueError(
                       f'Duplicate tier IDs in relationship schema "{schema_key}": '
                       f'{set(duplicates)}'
                   )

           return self
   ```

5. Add tests for cross-entry validation:
   - Test overlapping tier detection
   - Test duplicate ID detection across all schema types
   - Test gap detection (as warning, not error)
   - Test that valid non-overlapping schemas pass

**Deliverables**:
- Overlap detection helpers
- Gap detection helpers (optional warnings)
- Cross-entry validators on all schema containers
- Comprehensive tests for conflict detection
- Documentation of validation rules

---

## Phase 15 – Add Batch Validation Endpoint and Diagnostics

**Goal**: Provide tools to validate all existing worlds and diagnose schema issues.

**Scope**:
- Batch validation endpoint
- Schema diagnostics endpoint
- Validation report generation
- Migration helper suggestions

**Key Steps**:
1. Create batch validation endpoint:
   ```python
   # In pixsim7_backend/api/v1/game_worlds.py

   class WorldValidationResult(BaseModel):
       world_id: int
       world_name: str
       is_valid: bool
       errors: List[str] = Field(default_factory=list)
       warnings: List[str] = Field(default_factory=list)

   class BatchValidationResponse(BaseModel):
       total_worlds: int
       valid_worlds: int
       invalid_worlds: int
       results: List[WorldValidationResult]

   @router.get("/debug/validate-all-schemas", response_model=BatchValidationResponse)
   async def validate_all_world_schemas(
       game_world_service: GameWorldSvc,
       user: CurrentUser,
   ) -> BatchValidationResponse:
       """
       Validate schemas for all worlds owned by current user.

       Returns validation status and any errors/warnings for each world.
       """
       worlds = await game_world_service.list_worlds_for_user(owner_user_id=user.id)
       results = []

       for world in worlds:
           errors = []
           warnings = []
           is_valid = True

           if world.meta:
               try:
                   # Validate schemas
                   WorldMetaSchemas.parse_obj(world.meta)

                   # Check for gaps (warnings only)
                   if 'relationship_schemas' in world.meta:
                       for schema_key, tiers in world.meta['relationship_schemas'].items():
                           tier_schemas = [RelationshipTierSchema.parse_obj(t) for t in tiers]
                           gaps = detect_tier_gaps(tier_schemas)
                           warnings.extend(gaps)

               except ValidationError as e:
                   is_valid = False
                   errors = [f"{err['loc']}: {err['msg']}" for err in e.errors()]

           results.append(WorldValidationResult(
               world_id=world.id,
               world_name=world.name,
               is_valid=is_valid,
               errors=errors,
               warnings=warnings
           ))

       valid_count = sum(1 for r in results if r.is_valid)

       return BatchValidationResponse(
           total_worlds=len(results),
           valid_worlds=valid_count,
           invalid_worlds=len(results) - valid_count,
           results=results
       )
   ```

2. Create single-world diagnostics endpoint:
   ```python
   class SchemaHealth(BaseModel):
       schema_type: str  # "relationship", "intimacy", "mood", "reputation"
       is_valid: bool
       entry_count: int
       errors: List[str] = Field(default_factory=list)
       warnings: List[str] = Field(default_factory=list)
       suggestions: List[str] = Field(default_factory=list)

   class WorldSchemaReport(BaseModel):
       world_id: int
       world_name: str
       overall_valid: bool
       schema_health: List[SchemaHealth]

   @router.get("/{world_id}/schema-report", response_model=WorldSchemaReport)
   async def get_world_schema_report(
       world_id: int,
       game_world_service: GameWorldSvc,
       user: CurrentUser,
   ) -> WorldSchemaReport:
       """
       Generate detailed schema validation report for a single world.
       """
       world = await _get_owned_world(world_id, user, game_world_service)
       schema_health = []

       # Validate relationship schemas
       if world.meta and 'relationship_schemas' in world.meta:
           # ... validation logic ...
           schema_health.append(SchemaHealth(...))

       # Validate intimacy schema
       # Validate mood schema
       # Validate reputation schema

       overall_valid = all(h.is_valid for h in schema_health)

       return WorldSchemaReport(
           world_id=world.id,
           world_name=world.name,
           overall_valid=overall_valid,
           schema_health=schema_health
       )
   ```

3. Add CLI command for batch validation:
   ```python
   # In a management script or CLI tool

   async def validate_all_worlds():
       """Validate all worlds in the database and report issues."""
       async with get_db_session() as db:
           worlds = await db.execute(select(GameWorld))

           for world in worlds.scalars():
               try:
                   WorldMetaSchemas.parse_obj(world.meta or {})
                   print(f"✓ World {world.id} ({world.name}): Valid")
               except ValidationError as e:
                   print(f"✗ World {world.id} ({world.name}): Invalid")
                   for err in e.errors():
                       print(f"  - {err['loc']}: {err['msg']}")
   ```

4. Add migration suggestions to validation output:
   ```python
   def generate_migration_suggestions(errors: List[str]) -> List[str]:
       """Generate actionable migration suggestions based on validation errors."""
       suggestions = []

       for error in errors:
           if 'max must be >= min' in error:
               suggestions.append('Swap min and max values, or adjust thresholds')
           elif 'Duplicate' in error:
               suggestions.append('Rename duplicate IDs to be unique')
           elif 'Overlapping' in error:
               suggestions.append('Adjust tier ranges to eliminate overlaps')
           # ... more suggestion patterns ...

       return suggestions
   ```

**Deliverables**:
- Batch validation endpoint (`/debug/validate-all-schemas`)
- Schema report endpoint (`/{world_id}/schema-report`)
- CLI validation command
- Migration suggestion generator
- Admin documentation for using validation tools

---

## Phase 16 – Add Schema Migration Helpers

**Goal**: Provide tools to safely migrate schemas when breaking changes are needed.

**Scope**:
- Schema diff detection
- Migration script generation
- Safe schema evolution patterns
- Session data migration helpers

**Key Steps**:
1. Create schema diff detector:
   ```python
   class SchemaDiff(BaseModel):
       added_ids: List[str] = Field(default_factory=list)
       removed_ids: List[str] = Field(default_factory=list)
       changed_ranges: Dict[str, Dict[str, Any]] = Field(default_factory=dict)

   def diff_relationship_schemas(
       old_tiers: List[RelationshipTierSchema],
       new_tiers: List[RelationshipTierSchema]
   ) -> SchemaDiff:
       """Detect differences between old and new tier schemas."""
       old_ids = {t.id for t in old_tiers}
       new_ids = {t.id for t in new_tiers}

       diff = SchemaDiff(
           added_ids=list(new_ids - old_ids),
           removed_ids=list(old_ids - new_ids)
       )

       # Detect changed ranges for existing IDs
       for tier_id in old_ids & new_ids:
           old_tier = next(t for t in old_tiers if t.id == tier_id)
           new_tier = next(t for t in new_tiers if t.id == tier_id)

           if old_tier.min != new_tier.min or old_tier.max != new_tier.max:
               diff.changed_ranges[tier_id] = {
                   'old': {'min': old_tier.min, 'max': old_tier.max},
                   'new': {'min': new_tier.min, 'max': new_tier.max}
               }

       return diff
   ```

2. Create session data impact analyzer:
   ```python
   async def analyze_schema_change_impact(
       world_id: int,
       schema_diff: SchemaDiff,
       db: AsyncSession
   ) -> Dict[str, int]:
       """
       Analyze how many sessions would be affected by a schema change.

       Returns counts of sessions using removed IDs or changed ranges.
       """
       sessions = await db.execute(
           select(GameSession).where(GameSession.world_id == world_id)
       )

       impact = {
           'total_sessions': 0,
           'sessions_with_removed_ids': 0,
           'sessions_needing_recompute': 0
       }

       for session in sessions.scalars():
           impact['total_sessions'] += 1

           # Check if any relationships use removed tier IDs
           if session.relationships:
               for npc_key, rel_data in session.relationships.items():
                   if rel_data.get('tierId') in schema_diff.removed_ids:
                       impact['sessions_with_removed_ids'] += 1
                       break

           # Sessions with changed ranges need recomputation
           if schema_diff.changed_ranges:
               impact['sessions_needing_recompute'] += 1

       return impact
   ```

3. Create migration script generator:
   ```python
   def generate_migration_script(
       world_id: int,
       schema_diff: SchemaDiff,
       impact: Dict[str, int]
   ) -> str:
       """Generate SQL/Python migration script for schema changes."""
       script = f"""
   # Migration for World {world_id}
   # Impact: {impact['total_sessions']} sessions total
   # - {impact['sessions_with_removed_ids']} sessions using removed IDs
   # - {impact['sessions_needing_recompute']} sessions need recomputation

   async def migrate_world_{world_id}_schemas(db: AsyncSession):
       # Step 1: Update removed tier IDs
   """

       if schema_diff.removed_ids:
           script += f"""
       # Replace removed tier IDs: {schema_diff.removed_ids}
       sessions = await db.execute(
           select(GameSession).where(GameSession.world_id == {world_id})
       )

       for session in sessions.scalars():
           if session.relationships:
               for npc_key, rel_data in session.relationships.items():
                   if rel_data.get('tierId') in {schema_diff.removed_ids}:
                       # TODO: Map old tier ID to new tier ID
                       rel_data['tierId'] = 'REPLACE_WITH_NEW_ID'

       await db.commit()
   """

       script += """
       # Step 2: Invalidate cached normalized relationships
       # This will force recomputation with new schema
       # (handled automatically by cache invalidation in Phase 5 of Task 11)
   """

       return script
   ```

4. Add safe schema evolution endpoint:
   ```python
   class SchemaEvolutionRequest(BaseModel):
       new_schemas: Dict[str, Any]
       dry_run: bool = True

   class SchemaEvolutionResponse(BaseModel):
       is_safe: bool
       diff: SchemaDiff
       impact: Dict[str, int]
       migration_script: Optional[str] = None
       warnings: List[str] = Field(default_factory=list)

   @router.post("/{world_id}/evolve-schemas", response_model=SchemaEvolutionResponse)
   async def evolve_world_schemas(
       world_id: int,
       req: SchemaEvolutionRequest,
       game_world_service: GameWorldSvc,
       user: CurrentUser,
   ) -> SchemaEvolutionResponse:
       """
       Safely evolve world schemas with migration planning.

       In dry_run mode, only analyzes impact without making changes.
       """
       world = await _get_owned_world(world_id, user, game_world_service)

       # Validate new schemas
       try:
           WorldMetaSchemas.parse_obj(req.new_schemas)
       except ValidationError as e:
           raise HTTPException(status_code=400, detail=e.errors())

       # Diff schemas
       old_tiers = world.meta.get('relationship_schemas', {}).get('default', [])
       new_tiers = req.new_schemas.get('relationship_schemas', {}).get('default', [])

       diff = diff_relationship_schemas(old_tiers, new_tiers)

       # Analyze impact
       impact = await analyze_schema_change_impact(world_id, diff, db)

       # Determine if safe (no breaking changes)
       is_safe = not diff.removed_ids and impact['sessions_with_removed_ids'] == 0

       warnings = []
       if not is_safe:
           warnings.append(f"{len(diff.removed_ids)} tier IDs removed")
           warnings.append(f"{impact['sessions_with_removed_ids']} sessions affected")

       # Generate migration script
       migration_script = None
       if not is_safe:
           migration_script = generate_migration_script(world_id, diff, impact)

       # Apply changes if not dry run and safe
       if not req.dry_run and is_safe:
           world.meta.update(req.new_schemas)
           await game_world_service.update_world_meta(world_id, world.meta)

       return SchemaEvolutionResponse(
           is_safe=is_safe,
           diff=diff,
           impact=impact,
           migration_script=migration_script,
           warnings=warnings
       )
   ```

**Deliverables**:
- Schema diff detector
- Impact analyzer
- Migration script generator
- Safe schema evolution endpoint
- Documentation on safe schema evolution patterns

---

## Phase 17 – Add Schema Editor Validation UI

**Goal**: Provide real-time validation feedback in frontend schema editors.

**Scope**:
- Real-time validation as user edits schemas
- Visual error indicators
- Validation summary panel
- Integration with existing world editor

**Key Steps**:
1. Create frontend validation hook:
   ```typescript
   import { useState, useEffect } from 'react';

   interface ValidationResult {
     isValid: boolean;
     errors: Array<{ path: string; message: string }>;
     warnings: Array<{ path: string; message: string }>;
   }

   export function useSchemaValidation(schema: any): ValidationResult {
     const [result, setResult] = useState<ValidationResult>({
       isValid: true,
       errors: [],
       warnings: []
     });

     useEffect(() => {
       // Call validation endpoint
       fetch('/api/v1/game/worlds/validate-schema', {
         method: 'POST',
         body: JSON.stringify(schema)
       })
         .then(res => res.json())
         .then(setResult)
         .catch(err => {
           setResult({
             isValid: false,
             errors: [{ path: 'root', message: err.message }],
             warnings: []
           });
         });
     }, [schema]);

     return result;
   }
   ```

2. Create validation feedback components:
   ```typescript
   interface ValidationFeedbackProps {
     errors: Array<{ path: string; message: string }>;
     warnings: Array<{ path: string; message: string }>;
   }

   export function ValidationFeedback({ errors, warnings }: ValidationFeedbackProps) {
     if (errors.length === 0 && warnings.length === 0) {
       return (
         <div className="text-green-600">
           ✓ Schema is valid
         </div>
       );
     }

     return (
       <div className="space-y-2">
         {errors.map((error, i) => (
           <div key={i} className="text-red-600">
             ✗ {error.path}: {error.message}
           </div>
         ))}
         {warnings.map((warning, i) => (
           <div key={i} className="text-yellow-600">
             ⚠ {warning.path}: {warning.message}
           </div>
         ))}
       </div>
     );
   }
   ```

3. Add inline validation to schema editor fields:
   ```typescript
   interface TierEditorProps {
     tier: RelationshipTierSchema;
     onChange: (tier: RelationshipTierSchema) => void;
     errors?: string[];
   }

   export function TierEditor({ tier, onChange, errors }: TierEditorProps) {
     return (
       <div className={errors?.length ? 'border-red-500' : ''}>
         <input
           value={tier.id}
           onChange={e => onChange({ ...tier, id: e.target.value })}
           className={errors?.some(e => e.includes('id')) ? 'border-red-500' : ''}
         />
         <input
           type="number"
           value={tier.min}
           onChange={e => onChange({ ...tier, min: Number(e.target.value) })}
           className={errors?.some(e => e.includes('min')) ? 'border-red-500' : ''}
         />
         <input
           type="number"
           value={tier.max}
           onChange={e => onChange({ ...tier, max: Number(e.target.value) })}
           className={errors?.some(e => e.includes('max')) ? 'border-red-500' : ''}
         />

         {errors?.map((err, i) => (
           <div key={i} className="text-red-600 text-sm">{err}</div>
         ))}
       </div>
     );
   }
   ```

4. Add validation summary to world editor:
   - Show overall schema health
   - List all errors and warnings
   - Provide quick navigation to problematic entries
   - Block save when critical errors exist

**Deliverables**:
- Frontend validation hook
- Validation feedback components
- Inline error indicators in schema editors
- Validation summary panel
- Integration with world editor save flow

---

## Phase 18 – Add Schema Testing and Simulation Tools

**Goal**: Enable designers to test schemas before deploying them to production worlds.

**Scope**:
- Schema testing playground
- Relationship value → tier/mood simulation
- Visual range coverage display
- Export/import schema presets

**Key Steps**:
1. Create schema testing playground:
   ```typescript
   export function SchemaTestingPlayground() {
     const [schema, setSchema] = useState<RelationshipSchema>(...);
     const [testValue, setTestValue] = useState(50);
     const [result, setResult] = useState<string | null>(null);

     const testSchema = async () => {
       const preview = await previewRelationshipTier({
         worldId: testWorldId,
         affinity: testValue,
         schemaKey: 'custom'
       });
       setResult(preview.tierId);
     };

     return (
       <div>
         <SchemaEditor schema={schema} onChange={setSchema} />

         <div>
           <label>Test Affinity Value:</label>
           <input
             type="range"
             min={0}
             max={100}
             value={testValue}
             onChange={e => setTestValue(Number(e.target.value))}
           />
           <span>{testValue}</span>
         </div>

         <button onClick={testSchema}>Test</button>

         {result && (
           <div>
             Affinity {testValue} → Tier: <strong>{result}</strong>
           </div>
         )}
       </div>
     );
   }
   ```

2. Create visual range coverage display:
   ```typescript
   export function TierRangeCoverageChart({ tiers }: { tiers: RelationshipTierSchema[] }) {
     return (
       <div className="relative h-12 w-full bg-gray-200">
         {tiers.map(tier => {
           const left = tier.min;
           const width = (tier.max ?? 100) - tier.min;

           return (
             <div
               key={tier.id}
               className="absolute h-full"
               style={{
                 left: `${left}%`,
                 width: `${width}%`,
                 backgroundColor: getTierColor(tier.id)
               }}
               title={`${tier.id}: ${tier.min}-${tier.max}`}
             >
               {tier.id}
             </div>
           );
         })}

         {/* Show gaps in red */}
         {detectGaps(tiers).map((gap, i) => (
           <div
             key={i}
             className="absolute h-full bg-red-300"
             style={{
               left: `${gap.start}%`,
               width: `${gap.end - gap.start}%`
             }}
             title="Gap in coverage"
           />
         ))}
       </div>
     );
   }
   ```

3. Add mood simulation tool:
   ```typescript
   export function MoodSimulator() {
     const [relationshipValues, setRelationshipValues] = useState({
       affinity: 50,
       trust: 50,
       chemistry: 50,
       tension: 0
     });
     const [mood, setMood] = useState<UnifiedMoodState | null>(null);

     const simulate = async () => {
       const result = await previewUnifiedMood({
         worldId: testWorldId,
         npcId: 1,
         sessionId: 1,
         relationshipValues
       });
       setMood(result);
     };

     return (
       <div>
         {/* Sliders for affinity, trust, chemistry, tension */}
         {Object.entries(relationshipValues).map(([key, value]) => (
           <div key={key}>
             <label>{key}:</label>
             <input
               type="range"
               min={0}
               max={100}
               value={value}
               onChange={e => setRelationshipValues({
                 ...relationshipValues,
                 [key]: Number(e.target.value)
               })}
             />
             <span>{value}</span>
           </div>
         ))}

         <button onClick={simulate}>Simulate Mood</button>

         {mood && (
           <div>
             <div>General Mood: {mood.generalMood.moodId}</div>
             <div>Valence: {mood.generalMood.valence}</div>
             <div>Arousal: {mood.generalMood.arousal}</div>
             {mood.intimacyMood && (
               <div>Intimacy Mood: {mood.intimacyMood.moodId} ({mood.intimacyMood.intensity})</div>
             )}
           </div>
         )}
       </div>
     );
   }
   ```

4. Add schema preset library:
   - Ship default schema presets (casual, romantic, horror, etc.)
   - Allow export of custom schemas
   - Import/merge schemas from library
   - Community preset sharing

**Deliverables**:
- Schema testing playground UI
- Visual range coverage chart
- Mood simulation tool
- Schema preset library system
- Documentation on schema testing best practices

---

## Phase 19 – Add Schema Versioning and Deprecation Support

**Goal**: Support evolving schemas over time with version tracking and deprecation warnings.

**Scope**:
- Schema version tracking
- Deprecation warnings for old schema formats
- Automatic migration suggestions
- Version compatibility checking

**Key Steps**:
1. Add schema version field:
   ```python
   class WorldMetaSchemas(BaseModel):
       schema_version: int = Field(default=1)
       relationship_schemas: Dict[str, List[RelationshipTierSchema]] = Field(default_factory=dict)
       intimacy_schema: Optional[IntimacySchema] = None
       # ... other schemas ...

       @model_validator(mode='after')
       def check_version_compatibility(self):
           CURRENT_VERSION = 2

           if self.schema_version < CURRENT_VERSION:
               # Log deprecation warning but don't fail
               logger.warning(
                   f'World meta schema version {self.schema_version} is deprecated. '
                   f'Current version is {CURRENT_VERSION}. '
                   f'Consider migrating to new format.'
               )

           return self
   ```

2. Create schema migration pipeline:
   ```python
   def migrate_schema_to_v2(old_schema: dict) -> dict:
       """Migrate v1 schema to v2 format."""
       new_schema = old_schema.copy()

       # Example: v2 changes mood schema from flat to domain-based
       if 'npc_mood_schema' in new_schema:
           old_mood = new_schema['npc_mood_schema']
           if 'moods' in old_mood and 'general' not in old_mood:
               # Migrate to domain-based format
               new_schema['npc_mood_schema'] = {
                   'general': {'moods': old_mood['moods']}
               }

       new_schema['schema_version'] = 2
       return new_schema

   def auto_migrate_schema(schema: dict) -> dict:
       """Automatically migrate schema to latest version."""
       version = schema.get('schema_version', 1)

       migrations = {
           1: migrate_schema_to_v2,
           # Future migrations here
       }

       while version < CURRENT_SCHEMA_VERSION:
           migration = migrations.get(version)
           if not migration:
               break
           schema = migration(schema)
           version = schema['schema_version']

       return schema
   ```

3. Add deprecation warnings to API responses:
   ```python
   @router.get("/{world_id}", response_model=GameWorldDetail)
   async def get_world(
       world_id: int,
       game_world_service: GameWorldSvc,
       user: CurrentUser,
   ) -> GameWorldDetail:
       world = await _get_owned_world(world_id, user, game_world_service)

       # Check for deprecated schema
       if world.meta:
           version = world.meta.get('schema_version', 1)
           if version < CURRENT_SCHEMA_VERSION:
               # Add deprecation header
               response.headers['X-Schema-Version'] = str(version)
               response.headers['X-Schema-Deprecated'] = 'true'
               response.headers['X-Schema-Migration-Available'] = 'true'

       return await _build_world_detail(world, game_world_service)
   ```

4. Add automatic migration endpoint:
   ```python
   @router.post("/{world_id}/migrate-schema")
   async def migrate_world_schema(
       world_id: int,
       game_world_service: GameWorldSvc,
       user: CurrentUser,
   ):
       """Automatically migrate world schema to latest version."""
       world = await _get_owned_world(world_id, user, game_world_service)

       if not world.meta:
           raise HTTPException(status_code=400, detail="No schema to migrate")

       old_version = world.meta.get('schema_version', 1)

       if old_version >= CURRENT_SCHEMA_VERSION:
           raise HTTPException(status_code=400, detail="Schema already up to date")

       # Migrate
       new_meta = auto_migrate_schema(world.meta)

       # Validate migrated schema
       try:
           WorldMetaSchemas.parse_obj(new_meta)
       except ValidationError as e:
           raise HTTPException(
               status_code=500,
               detail=f"Migration failed validation: {e.errors()}"
           )

       # Apply migration
       await game_world_service.update_world_meta(world_id, new_meta)

       return {
           'old_version': old_version,
           'new_version': new_meta['schema_version'],
           'success': True
       }
   ```

**Deliverables**:
- Schema versioning system
- Migration pipeline for version upgrades
- Deprecation warnings in API
- Automatic migration endpoint
- Documentation on schema versioning

---

## Phase 20 – Add Schema Analytics and Usage Tracking

**Goal**: Track how schemas are used to identify optimization opportunities and common patterns.

**Scope**:
- Track tier/level hit frequency
- Identify unused schema entries
- Analyze schema effectiveness
- Generate schema optimization suggestions

**Key Steps**:
1. Add schema usage tracking:
   ```python
   class SchemaUsageTracker:
       """Track which tier IDs are actually used in sessions."""

       async def record_tier_usage(
           self,
           world_id: int,
           tier_id: str,
           npc_id: int,
           session_id: int
       ):
           """Record that a specific tier was assigned."""
           # Store in Redis or DB for analytics
           key = f"schema_usage:{world_id}:tier:{tier_id}"
           await redis.hincrby(key, f"npc:{npc_id}:session:{session_id}", 1)

       async def get_tier_usage_stats(
           self,
           world_id: int
       ) -> Dict[str, int]:
           """Get usage counts for all tiers in a world."""
           pattern = f"schema_usage:{world_id}:tier:*"
           keys = await redis.keys(pattern)

           stats = {}
           for key in keys:
               tier_id = key.split(':')[-1]
               count = await redis.hlen(key)
               stats[tier_id] = count

           return stats
   ```

2. Create analytics endpoint:
   ```python
   class SchemaAnalytics(BaseModel):
       world_id: int
       tier_usage: Dict[str, int]  # tier_id -> usage count
       unused_tiers: List[str]
       most_used_tier: Optional[str]
       coverage_efficiency: float  # % of range actually used
       suggestions: List[str]

   @router.get("/{world_id}/schema-analytics", response_model=SchemaAnalytics)
   async def get_schema_analytics(
       world_id: int,
       game_world_service: GameWorldSvc,
       user: CurrentUser,
   ) -> SchemaAnalytics:
       """Get analytics on schema usage for a world."""
       world = await _get_owned_world(world_id, user, game_world_service)

       # Get usage stats
       tracker = SchemaUsageTracker()
       tier_usage = await tracker.get_tier_usage_stats(world_id)

       # Find defined tiers
       defined_tiers = set()
       if world.meta and 'relationship_schemas' in world.meta:
           for tiers in world.meta['relationship_schemas'].values():
               defined_tiers.update(t['id'] for t in tiers)

       # Find unused tiers
       unused_tiers = list(defined_tiers - set(tier_usage.keys()))

       # Find most used tier
       most_used_tier = max(tier_usage, key=tier_usage.get) if tier_usage else None

       # Generate suggestions
       suggestions = []
       if unused_tiers:
           suggestions.append(f"Consider removing unused tiers: {', '.join(unused_tiers)}")

       if len(tier_usage) == 1:
           suggestions.append("Only one tier is used. Consider simplifying schema or adjusting ranges.")

       return SchemaAnalytics(
           world_id=world_id,
           tier_usage=tier_usage,
           unused_tiers=unused_tiers,
           most_used_tier=most_used_tier,
           coverage_efficiency=calculate_coverage_efficiency(world.meta, tier_usage),
           suggestions=suggestions
       )
   ```

3. Add usage visualization to frontend:
   ```typescript
   export function SchemaUsageChart({ analytics }: { analytics: SchemaAnalytics }) {
     const total = Object.values(analytics.tierUsage).reduce((a, b) => a + b, 0);

     return (
       <div>
         <h3>Tier Usage Distribution</h3>
         {Object.entries(analytics.tierUsage).map(([tierId, count]) => (
           <div key={tierId} className="flex items-center gap-2">
             <span className="w-24">{tierId}</span>
             <div className="flex-1 bg-gray-200 h-6 relative">
               <div
                 className="bg-blue-500 h-full"
                 style={{ width: `${(count / total) * 100}%` }}
               />
             </div>
             <span>{count} uses ({((count / total) * 100).toFixed(1)}%)</span>
           </div>
         ))}

         {analytics.unusedTiers.length > 0 && (
           <div className="text-yellow-600 mt-4">
             ⚠ Unused tiers: {analytics.unusedTiers.join(', ')}
           </div>
         )}

         {analytics.suggestions.map((suggestion, i) => (
           <div key={i} className="text-blue-600 mt-2">
             💡 {suggestion}
           </div>
         ))}
       </div>
     );
   }
   ```

4. Add optimization recommendations:
   - Identify tiers that are too narrow (never hit)
   - Identify tiers that are too wide (catch too many values)
   - Suggest range adjustments based on actual usage patterns
   - Flag schemas with poor coverage

**Deliverables**:
- Schema usage tracking system
- Analytics endpoint
- Usage visualization components
- Optimization recommendation engine
- Documentation on interpreting analytics

---

## Notes for Implementation

### Current Status
- ✅ Basic Pydantic models exist for relationship and intimacy schemas
- ✅ API validation on world create/update
- ❌ No field validators (min < max, value ranges, etc.)
- ❌ No mood schema validation
- ❌ No reputation schema validation
- ❌ No cross-entry validators
- ❌ No batch validation tools

### Quick Wins
- **Phase 11**: Add field validators (prevents most common errors)
- **Phase 12**: Add mood schema validation (high usage, currently unvalidated)
- **Phase 15**: Add batch validation endpoint (enables discovery of existing issues)

### Implementation Order
Recommended order:
1. Phase 11 (field validators) – Prevents new errors
2. Phase 15 (batch validation) – Discovers existing errors
3. Phase 12-13 (mood/reputation validation) – Completes validation coverage
4. Phase 14 (cross-entry validators) – Catches complex conflicts
5. Phases 16-20 (tooling) – Improves DX and maintainability

### Testing Strategy
- Unit tests for each validator
- Integration tests for API validation flow
- Test both valid and invalid schemas
- Test edge cases (empty IDs, boundary values, etc.)
- Test backward compatibility with existing worlds

### Migration Strategy
- Add validators incrementally (one phase at a time)
- Use warnings before errors for existing worlds
- Provide batch validation to identify issues before enforcement
- Generate migration scripts for breaking changes
- Document all validation rules clearly

---

## Related Tasks
- **Task 11 (Part 1)** – World-aware session normalization (provides foundation)
- **Task 07** – Relationship preview API (uses validated schemas)
- **Task 08** – Social metrics (uses validated mood/reputation schemas)
- **Task 14** – Unified mood integration (benefits from mood schema validation)

## Success Criteria
- ✅ All schema types have comprehensive validation
- ✅ Logical errors (min > max, overlaps) are caught at API level
- ✅ Batch validation endpoint helps identify existing issues
- ✅ Clear error messages guide users to fix problems
- ✅ Schema editor provides real-time validation feedback
- ✅ Migration tools support safe schema evolution
- ✅ Analytics identify optimization opportunities

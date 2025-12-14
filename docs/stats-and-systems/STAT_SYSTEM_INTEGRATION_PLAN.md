# Abstract Stat System - Phase 2 Integration Plan

**Created**: 2025-12-02
**Status**: 🔄 In Progress

---

## Current System Analysis

### Character/NPC Architecture

The system has a multi-layered character architecture:

```
Character (template/archetype)
    ↓ instantiated in world
CharacterInstance (world-specific version)
    ↓ linked to
GameNPC (game entity)
    ↓ runtime state in
NPCState (per-NPC state)
```

**Existing Models**:

1. **Character** (`character.py`)
   - Template/archetype for reusable characters
   - Fields: `personality_traits`, `behavioral_patterns`, `voice_profile`, `visual_traits`
   - Content service entity (UUID-based)
   - Already has JSONB fields for flexible data

2. **CharacterInstance** (`character_integrations.py`)
   - World-specific version of a character
   - Fields: `personality_overrides`, `behavioral_overrides`, `current_state`
   - Links to specific world
   - Can have different stats per world

3. **GameNPC** (`domain/game/models.py`)
   - Game entity (integer ID)
   - Fields: `name`, `personality` (JSON), `home_location_id`
   - Minimal structure
   - **Missing stats field** ✅ Need to add

4. **NPCState** (`domain/game/models.py`)
   - Runtime state for NPCs
   - Fields: `current_location_id`, `state` (JSON), `version`
   - Generic state storage
   - **Missing stats field** ✅ Need to add

5. **GameSession** (`domain/game/models.py`)
   - Player session
   - Fields: `stats` (NEW), `relationships` (DEPRECATED)
   - Already updated with stats field ✅

---

## Integration Strategy

### Phase 2.1: Add Stats to NPC Models

**Approach**: Use `HasStats` mixin for entity-owned stats

#### Model Updates

```python
# GameNPC - Add base stats
from pixsim7.backend.main.domain.stats import HasStats

class GameNPC(SQLModel, HasStats, table=True):
    __tablename__ = "game_npcs"
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(max_length=64)
    personality: Optional[Dict[str, Any]] = Field(default=None, sa_column=Column(JSON))
    home_location_id: Optional[int] = Field(default=None, foreign_key="game_locations.id")
    # stats field inherited from HasStats
    # Used for: base combat skills, attributes, etc.
```

```python
# NPCState - Add runtime stat overrides
class NPCState(SQLModel, HasStats, table=True):
    __tablename__ = "npc_state"
    npc_id: Optional[int] = Field(primary_key=True)
    current_location_id: Optional[int] = Field(default=None, foreign_key="game_locations.id")
    state: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    version: int = Field(default=0)
    updated_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    # stats field inherited from HasStats
    # Used for: session-specific stat changes (damage, buffs, etc.)
```

```python
# CharacterInstance - Add world-specific stat overrides (OPTIONAL)
class CharacterInstance(SQLModel, HasStats, table=True):
    # ... existing fields ...
    # stats field inherited from HasStats
    # Used for: world-specific character stat variations
```

#### Why This Works

- **GameNPC.stats**: Base/template stats (strength: 90, agility: 60)
- **NPCState.stats**: Runtime overrides (health: 65 after damage)
- **GameSession.stats["relationships"]**: Player's relationship with NPCs
- **Hybrid merge**: `final = merge(GameNPC.stats, NPCState.stats)`

---

### Phase 2.2: Integrate stat_service

#### Update game_session_service.py

```python
from pixsim7.backend.main.services.game.stat_service import StatService

class GameSessionService:
    def __init__(self, db: AsyncSession, redis: Optional[Redis] = None):
        self.db = db
        self.redis = redis
        # NEW: Add stat service
        self.stat_service = StatService(db, redis)

    async def _normalize_session_relationships(self, session: GameSession) -> None:
        """
        Normalize relationships using stat service.

        DEPRECATED: This method will be replaced by stat_service.normalize_session_stats
        For backwards compatibility, delegate to stat service.
        """
        await self.stat_service.normalize_session_stats(session, "relationships")

    # NEW: Generic stat normalization
    async def normalize_session_stats(
        self,
        session: GameSession,
        stat_definition_id: str
    ) -> None:
        """Normalize any stat type for a session."""
        await self.stat_service.normalize_session_stats(session, stat_definition_id)
```

#### Create NPC stat service

```python
# services/game/npc_stat_service.py

class NPCStatService:
    """Service for managing NPC stats with hybrid approach."""

    def __init__(self, db: AsyncSession, redis: Optional[Redis] = None):
        self.db = db
        self.stat_service = StatService(db, redis)

    async def get_npc_effective_stats(
        self,
        npc_id: int,
        stat_definition_id: str
    ) -> Dict[str, Any]:
        """
        Get NPC's effective stats (base + runtime overrides).

        Args:
            npc_id: The NPC ID
            stat_definition_id: Which stat type (e.g., "combat_skills")

        Returns:
            Merged and normalized stats

        Example:
            Base (GameNPC): {"strength": 90, "agility": 60}
            Override (NPCState): {"health": 65}
            Result: {"strength": 90, "agility": 60, "health": 65}
        """
        # Get base stats
        npc = await self.db.get(GameNPC, npc_id)
        if not npc:
            raise ValueError("npc_not_found")

        base_stats = npc.stats.get(stat_definition_id, {})

        # Get runtime overrides
        npc_state = await self.db.get(NPCState, npc_id)
        override_stats = {}
        if npc_state and npc_state.stats:
            override_stats = npc_state.stats.get(stat_definition_id, {})

        # Merge
        merged_stats = StatEngine.merge_entity_stats(base_stats, override_stats)

        # Get stat definition and normalize
        world_id = self._get_npc_world_id(npc)
        if world_id:
            stats_config = await self.stat_service._get_world_stats_config(world_id)
            if stats_config and stat_definition_id in stats_config.definitions:
                stat_definition = stats_config.definitions[stat_definition_id]
                return StatEngine.normalize_entity_stats(merged_stats, stat_definition)

        return merged_stats

    async def update_npc_runtime_stats(
        self,
        npc_id: int,
        stat_definition_id: str,
        stat_updates: Dict[str, Any]
    ) -> None:
        """
        Update NPC's runtime stats (stored in NPCState).

        Args:
            npc_id: The NPC ID
            stat_definition_id: Which stat type
            stat_updates: Stat values to update

        Example:
            # NPC takes damage
            await update_npc_runtime_stats(
                npc_id=1,
                stat_definition_id="attributes",
                stat_updates={"health": 65}
            )
        """
        npc_state = await self.db.get(NPCState, npc_id)
        if not npc_state:
            # Create new state
            npc_state = NPCState(npc_id=npc_id)
            self.db.add(npc_state)

        # Update stats
        if not npc_state.stats:
            npc_state.stats = {}

        if stat_definition_id not in npc_state.stats:
            npc_state.stats[stat_definition_id] = {}

        npc_state.stats[stat_definition_id].update(stat_updates)
        npc_state.version += 1

        await self.db.commit()
        await self.db.refresh(npc_state)
```

---

### Phase 2.3: Update APIs

#### Add NPC stat endpoints

```python
# api/v1/game_npcs.py

@router.get("/{npc_id}/stats/{stat_type}", response_model=Dict[str, Any])
async def get_npc_stats(
    npc_id: int,
    stat_type: str,
    npc_stat_service: Annotated[NPCStatService, Depends(get_npc_stat_service)],
    user: CurrentUser
) -> Dict[str, Any]:
    """
    Get NPC's effective stats (base + runtime).

    Returns normalized stats with computed tiers/levels.
    """
    try:
        return await npc_stat_service.get_npc_effective_stats(npc_id, stat_type)
    except ValueError as e:
        if str(e) == "npc_not_found":
            raise HTTPException(status_code=404, detail="NPC not found")
        raise


@router.patch("/{npc_id}/stats/{stat_type}", response_model=Dict[str, Any])
async def update_npc_stats(
    npc_id: int,
    stat_type: str,
    stat_updates: Dict[str, Any],
    npc_stat_service: Annotated[NPCStatService, Depends(get_npc_stat_service)],
    user: CurrentUser
) -> Dict[str, Any]:
    """
    Update NPC's runtime stats.

    Example:
        PATCH /npcs/1/stats/attributes
        {"health": 65, "stamina": 80}
    """
    await npc_stat_service.update_npc_runtime_stats(npc_id, stat_type, stat_updates)
    return await npc_stat_service.get_npc_effective_stats(npc_id, stat_type)
```

#### Update session endpoints to use stat service

```python
# api/v1/game_sessions.py

# Already handles stats, but ensure normalization uses stat_service
@router.patch("/{session_id}", response_model=GameSessionResponse)
async def update_session(
    session_id: int,
    req: SessionUpdateRequest,
    game_session_service: GameSessionSvc,
    user: CurrentUser
) -> GameSessionResponse:
    # ... existing code ...

    # Normalize stats if updated
    if req.stats is not None:
        for stat_type in req.stats.keys():
            await game_session_service.normalize_session_stats(session, stat_type)

    # ... rest of endpoint ...
```

---

### Phase 2.4: Migration

#### Database Migration

```python
# migrations/versions/add_stats_to_npcs.py

def upgrade():
    # Add stats column to game_npcs
    op.add_column('game_npcs',
        sa.Column('stats', postgresql.JSONB(), nullable=True, server_default='{}'))

    # Add stats column to npc_state
    op.add_column('npc_state',
        sa.Column('stats', postgresql.JSONB(), nullable=True, server_default='{}'))

    # Optional: Add to character_instances
    op.add_column('character_instances',
        sa.Column('stats', postgresql.JSONB(), nullable=True, server_default='{}'))


def downgrade():
    op.drop_column('game_npcs', 'stats')
    op.drop_column('npc_state', 'stats')
    op.drop_column('character_instances', 'stats')
```

#### Data Migration Script

```python
# scripts/migrate_npc_personality_to_stats.py

"""
Optional: Migrate existing personality data to stats format.

If NPCs have structured personality data that could map to stats,
this script can convert it.
"""

async def migrate_npc_personality_to_stats():
    # Example: If personality has combat-related data
    for npc in npcs:
        if "combat" in npc.personality:
            npc.stats["combat_skills"] = {
                "strength": npc.personality["combat"].get("strength", 50),
                "agility": npc.personality["combat"].get("agility", 50),
            }
        await db.commit()
```

---

## Integration Points Summary

### ✅ Already Compatible

- **GameSession**: Has `stats` field, ready to use
- **WorldStatsConfig**: Stored in `GameWorld.meta.stats_config`
- **StatService**: Generic, works with any stat type
- **StatEngine**: Pure functions, reusable everywhere

### 🔧 Needs Updates

1. **Models** (simple):
   - Add `HasStats` mixin to `GameNPC`
   - Add `HasStats` mixin to `NPCState`
   - Optional: Add to `CharacterInstance`

2. **Services** (medium):
   - Update `GameSessionService` to use `StatService`
   - Create `NPCStatService` for NPC stat management
   - Add dependency injection for services

3. **APIs** (medium):
   - Add NPC stat endpoints (`GET/PATCH /npcs/{id}/stats/{type}`)
   - Ensure session endpoints use stat normalization
   - Add stat type to relevant response models

4. **Database** (simple):
   - Migration to add `stats` column to tables
   - Default value: `{}`

---

## Backwards Compatibility

### Session Relationships

**Current**: `session.relationships`
**New**: `session.stats["relationships"]`
**Migration**: Auto-migrates on first access (already implemented)

```python
# Automatic in stat_service.py
if session.relationships and not session.stats.get("relationships"):
    session.stats = migrate_session_relationships_to_stats(session.relationships)
```

### NPC Personality

**Current**: `npc.personality` (free-form JSON)
**New**: `npc.stats` (structured stat definitions)
**Migration**: Optional, personality can coexist with stats

```python
# Both can exist:
npc.personality = {"demeanor": "friendly", "quirks": [...]}
npc.stats = {"combat_skills": {"strength": 90}, "attributes": {"health": 100}}
```

---

## Usage Examples

### Example 1: NPC Combat

```python
# Define NPC with base combat stats
npc = GameNPC(
    name="Orc Warrior",
    stats={
        "combat_skills": {
            "strength": 90,
            "defense": 75,
            "agility": 40
        }
    }
)

# During combat, NPC takes damage
npc_state = NPCState(npc_id=npc.id)
npc_state.stats = {
    "combat_skills": {
        "health": 65  # Damaged from 100
    }
}

# Get effective stats
effective = await npc_stat_service.get_npc_effective_stats(npc.id, "combat_skills")
# Result: {"strength": 90, "defense": 75, "agility": 40, "health": 65}
```

### Example 2: Player-NPC Interaction

```python
# Player interacts with NPC
session.stats = {
    "relationships": {
        "npc:orc": {
            "affinity": 75,
            "trust": 60
        }
    }
}

# Normalize using stat service
await stat_service.normalize_session_stats(session, "relationships")

# Result: session.stats["relationships"]["npc:orc"]["affinityTierId"] = "friend"
```

### Example 3: World-Specific NPC Stats

```python
# Same character, different worlds
character_instance_jungle = CharacterInstance(
    character_id=koba_template.id,
    world_id=jungle_world.id,
    stats={
        "combat_skills": {
            "strength": 90,  # Evolved, stronger
            "agility": 70
        }
    }
)

character_instance_city = CharacterInstance(
    character_id=koba_template.id,
    world_id=city_world.id,
    stats={
        "combat_skills": {
            "strength": 70,  # Weaker in city
            "agility": 50
        }
    }
)
```

---

## Testing Plan

### Unit Tests

```python
def test_npc_stat_merge():
    """Test merging base and runtime NPC stats."""
    base = {"strength": 90, "agility": 60}
    override = {"health": 65}

    merged = StatEngine.merge_entity_stats(base, override)

    assert merged["strength"] == 90
    assert merged["agility"] == 60
    assert merged["health"] == 65


def test_npc_stat_normalization():
    """Test NPC stat normalization with tiers."""
    npc_stats = {"strength": 90}

    normalized = StatEngine.normalize_entity_stats(
        npc_stats,
        combat_definition
    )

    assert normalized["strengthTierId"] == "expert"
```

### Integration Tests

```python
async def test_npc_stat_service():
    """Test NPC stat service end-to-end."""
    # Create NPC with base stats
    npc = GameNPC(name="Test", stats={"combat_skills": {"strength": 90}})
    await db.commit()

    # Update runtime stats
    await npc_stat_service.update_npc_runtime_stats(
        npc.id,
        "combat_skills",
        {"health": 65}
    )

    # Get effective stats
    effective = await npc_stat_service.get_npc_effective_stats(
        npc.id,
        "combat_skills"
    )

    assert effective["strength"] == 90
    assert effective["health"] == 65
```

---

## Rollout Plan

### Stage 1: Foundation (Current)
- ✅ Abstract stat system implemented
- ✅ Entity-owned stats with mixins
- ✅ Stat engine with modifiers
- ✅ Documentation complete

### Stage 2: Model Integration (Next)
- Add HasStats mixin to GameNPC
- Add HasStats mixin to NPCState
- Create database migration
- Test model changes

### Stage 3: Service Layer (After)
- Create NPCStatService
- Update GameSessionService to use StatService
- Add dependency injection
- Unit tests

### Stage 4: API Layer (After)
- Add NPC stat endpoints
- Update session endpoints
- Integration tests
- API documentation

### Stage 5: Migration & Cleanup (Final)
- Run data migration (if needed)
- Deprecate old relationship normalization code
- Performance testing
- Production deployment

---

## Next Steps

1. **Create database migration** for adding `stats` column
2. **Update models** with `HasStats` mixin
3. **Create `NPCStatService`** for NPC stat management
4. **Add API endpoints** for NPC stats
5. **Write tests** for integration
6. **Document API changes** for frontend

---

**Document Version**: 1.0
**Last Updated**: 2025-12-02

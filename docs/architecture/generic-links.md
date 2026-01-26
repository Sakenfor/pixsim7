# Generic Template↔Runtime Link Pattern

## Overview

The generic link pattern provides a reusable infrastructure for connecting any template entity (Character, ItemTemplate, PropTemplate) to any runtime entity (NPC, Item, Prop) with:

- **Bidirectional sync** with field-level authority
- **Priority-based conflict resolution** when multiple links target the same runtime entity
- **Context-based activation** (location, time, state-aware linking)
- **Declarative FieldMapping** configuration for sync behavior
- **Composition over inheritance** - no base classes, pure data structures

This pattern generalizes the existing CharacterInstance↔GameNPC link into a reusable system for any entity pair.

## Core Concepts

### ObjectLink

A generic link contract that connects a template entity to a runtime entity:

- **Template**: The design/definition entity (Character, ItemTemplate, PropTemplate)
- **Runtime**: The in-game instance entity (NPC, Item, Prop)
- **Mapping**: FieldMapping config that defines field-level sync behavior
- **Priority**: For conflict resolution when multiple links are active
- **Activation Conditions**: Optional context-based activation (e.g., location, time)

```typescript
interface ObjectLink {
  linkId: string;
  templateKind: 'characterInstance' | 'itemTemplate' | 'propTemplate' | ...;
  templateId: string;
  runtimeKind: 'npc' | 'item' | 'prop' | ...;
  runtimeId: number;
  mappingId: string;  // e.g., 'characterInstance->npc'
  priority: number;
  activationConditions?: Record<string, unknown>;
  // ... metadata fields
}
```

### FieldMapping

Declarative configuration that specifies:

- **Which fields** sync between template and runtime
- **Authority**: Which entity is the source of truth per field
- **Fallback**: What happens when primary source is unavailable
- **Transform functions**: Optional per-field value transformations
- **Stat integration**: Optional StatEngine normalization

```python
FieldMapping(
    target_path="traits.openness",
    source="instance",           # Instance is authoritative
    fallback="npc",              # Fall back to NPC if instance missing
    instance_path="personality_traits.openness",
    npc_path="personality.openness",
    stat_axis="openness",        # Normalize via StatEngine
    stat_package_id="core.personality"
)
```

### Mapping Registry

Central registry that maps `mappingId` (e.g., `'characterInstance->npc'`) to FieldMapping configurations.

Each entity pair registers its FieldMapping configuration on service startup, making it available for links to reference.

```python
registry = get_mapping_registry()
from services.links.link_types import link_type_id
registry.register(link_type_id('characterInstance', 'npc'), NPC_FIELD_MAPPING)
registry.register(link_type_id('itemTemplate', 'item'), ITEM_FIELD_MAPPING)
```

### Entity Loader Registry

Registry of loader functions that fetch entities by kind and ID.

Each domain registers loaders for its entity types, enabling the generic sync service to load any entity without domain-specific code.

```python
registry = get_entity_loader_registry()

async def load_character_instance(instance_id, db):
    return await db.get(CharacterInstance, instance_id)

registry.register_loader('characterInstance', load_character_instance)
```

## Architecture

### Composition-Based Design

The link pattern respects the existing composition-based GameObject architecture:

- **GameObjectBase** is a shape (id/kind/transform/tags), not a base class
- **ObjectLink** is a data structure, not a class hierarchy
- Systems that need "any object" use GameObjectBase union types
- Systems that need template↔runtime sync use ObjectLink

No inheritance. No instanceof checks. Pure composition.

### Data Flow

```
Template Entity (CharacterInstance)
          ↓
    ObjectLink (characterInstance->npc)
          ↓  (FieldMapping: characterInstance->npc)
          ↓  (Sync direction, priority, activation)
          ↓
Runtime Entity (GameNPC)
```

1. **Link Creation**: Create ObjectLink connecting template→runtime
2. **Mapping Lookup**: Retrieve FieldMapping config via mappingId
3. **Entity Loading**: Load template and runtime entities via entity loaders
4. **Snapshot Building**: Use generic_resolver to merge fields per mapping
5. **Sync**: Apply field changes in specified direction (optional)

## Usage

### 1. Define a FieldMapping

Create a FieldMapping configuration for your entity pair and register the link type:

```python
# In services/links/link_types.py
from pixsim7.backend.main.services.links.link_types import LinkTypeSpec, get_link_type_registry

registry = get_link_type_registry()

def get_my_entity_mapping() -> Dict[str, FieldMapping]:
    return {
        "name": FieldMapping(
            target_path="name",
            source="template",
            fallback="runtime",
            source_paths={
                "template": "name",
                "runtime": "name"
            }
        ),
        "state.health": FieldMapping(
            target_path="state.health",
            source="runtime",  # Runtime authoritative for state
            fallback="template",
            source_paths={
                "template": "default_health",
                "runtime": "health"
            }
        ),
    }

registry.register_spec(LinkTypeSpec(
    template_kind="myTemplate",
    runtime_kind="myRuntime",
    template_model=MyTemplate,
    runtime_model=MyRuntime,
    template_label="MyTemplate",
    runtime_label="MyRuntime",
    mapping_factory=get_my_entity_mapping,
))
```

### 2. Create a Link

Use the LinkService to create a template↔runtime link:

```python
from services.links.link_service import LinkService
from services.links.link_types import link_type_id

link_service = LinkService(db)

link = await link_service.create_link(
    template_kind='myTemplate',
    template_id='abc-123',
    runtime_kind='myRuntime',
    runtime_id=456,
    mapping_id=link_type_id('myTemplate', 'myRuntime'),
    sync_direction='bidirectional',
    priority=10,
    activation_conditions={'location.zone': 'downtown'}  # Optional
)
```

### 3. Build a Snapshot

Use GenericSyncService to build a snapshot of merged field values:

```python
from services.links.sync_service import GenericSyncService

sync_service = GenericSyncService(db)

snapshot = await sync_service.build_snapshot(
    link.link_id,
    prefer_live=True  # Prefer runtime values over template values
)

# snapshot contains merged field values based on FieldMapping
```

### 4. Query Links

Get links for a template or runtime entity:

```python
# Get all links for a template
template_links = await link_service.get_links_for_template(
    'characterInstance', 'abc-123'
)

# Get all links for a runtime entity
runtime_links = await link_service.get_links_for_runtime(
    'npc', 456
)

# Get highest-priority active link for a runtime entity
context = {'location': {'zone': 'downtown'}, 'time': {'hour': 18}}
active_link = await link_service.get_active_link_for_runtime(
    'npc', 456, context
)
```

## Relationship to Other Systems

### GameObjectBase

**GameObjectBase is a shape, not a base class.**

- Use `GameObjectBase` for systems that need "any object" (spatial queries, rendering, tags)
- Use `ObjectLink` for systems that need template↔runtime sync
- They are orthogonal: An NPC can be a GameObject AND have an ObjectLink
- No inheritance; composition only

### StatEngine and Relationships

**Stats and relationships are separate from links.**

- **Links** connect template↔runtime entities (structural)
- **Stats** (affinity, trust, etc.) are applied via StatEngine and stat packages (gameplay)
- **Relationships** are actor-level (NPC↔NPC, Player↔NPC), not object-level
- FieldMapping can reference stat axes for normalization, but stats are not stored in links

### Prompt Context System

The link pattern integrates with the existing prompt context infrastructure:

- **FieldMapping** defines how to map fields (reused from npc_prompt_mapping.py)
- **generic_resolver** processes mappings to produce snapshots
- **Enrichers** can augment snapshots with link-derived data
- **Overlays** allow per-link FieldMapping customization

## Naming Conventions

### Mapping IDs

- **Format**: `templateKind->runtimeKind` (e.g., `characterInstance->npc`)
- **Delimiter**: Use `->` (ASCII-safe, easy to type)
- **Case**: Use camelCase to match TypeScript conventions
- **Examples**:
  - `characterInstance->npc`
  - `itemTemplate->item`
  - `propTemplate->prop`
  - `locationTemplate->location`

### Template Kinds

- Use singular nouns in camelCase
- Examples: `characterInstance`, `itemTemplate`, `propTemplate`
- Match the domain model name when possible
- Avoid abbreviations unless standard (e.g., `npc` is OK)

### Runtime Kinds

- Use singular nouns in camelCase
- Examples: `npc`, `item`, `prop`, `player`
- Match the GameObject `kind` field for consistency
- Keep consistent with TypeScript union types

### ID Types

- **Template IDs**: Usually UUIDs (strings)
- **Runtime IDs**: Usually integers, but can be UUIDs for some domains
- Use branded types in TypeScript for type safety where possible
- Document any domain-specific ID format deviations

## Consolidation Status

CharacterNPCLink has been consolidated into ObjectLink. Character-NPC links now
use `template_kind="characterInstance"` and `runtime_kind="npc"` exclusively.
`CharacterNPCSyncService` delegates to `LinkService` for link creation and
resolution.

## Example: Character-NPC Link

### Create a Link

```python
from services.characters.npc_sync_service import CharacterNPCSyncService

service = CharacterNPCSyncService(db)

link = await service.create_link(
    character_instance_id=instance_id,
    npc_id=npc_id,
    priority=10,
    activation_conditions={'location.zone': 'downtown'}
)
```

### Context-Based Activation

Links can be context-aware for dynamic behavior:

```python
# Day appearance (low priority)
day_link = await service.create_link(
    character_instance_id=instance_id,
    npc_id=npc_id,
    priority=5,
    activation_conditions={'time.period': 'day'}
)

# Night appearance (higher priority)
night_link = await service.create_link(
    character_instance_id=instance_id,
    npc_id=npc_id,
    priority=10,
    activation_conditions={'time.period': 'night'}
)

# At night, the night_link is active (higher priority + matches condition)
# At day, the day_link is active
# The NPC can switch appearance based on time of day
```

## Implementation Files

### TypeScript Types

- `packages/shared/types/src/links.ts` - Generic ObjectLink types with branded IDs

### Backend Domain

- `pixsim7/backend/main/domain/links.py` - ObjectLink SQLAlchemy model

### Backend Services

- `pixsim7/backend/main/services/links/mapping_registry.py` - Mapping registry
- `pixsim7/backend/main/services/links/entity_loaders.py` - Entity loader registry
- `pixsim7/backend/main/services/links/activation.py` - Activation evaluator
- `pixsim7/backend/main/services/links/default_mappings.py` - Default mapping configs
- `pixsim7/backend/main/services/links/link_service.py` - Generic CRUD service
- `pixsim7/backend/main/services/links/sync_service.py` - Generic sync service

### Integration

- `pixsim7/backend/main/services/characters/npc_sync_service.py` - CharacterNPCSyncService (ObjectLink-based)

### Database

- Migration: `YYYYMMDD_HHMM_add_object_links.py` - Creates `object_links` table

## Future Extensions

### Additional Entity Types

As new entity types are added, register their mappings:

```python
# In services/links/default_mappings.py
def get_vehicle_template_mapping():
    return { ... }

registry.register('vehicleTemplate->vehicle', get_vehicle_template_mapping())
```

### Custom Activation Logic

For more complex activation conditions, extend the activation evaluator:

```python
# Current: Simple JSON matching
# Future: Expression language, rule engine, etc.
```

### Frontend Integration

When needed, expose ObjectLink via GraphQL:

```graphql
mutation CreateLink($input: CreateObjectLinkInput!) {
  createObjectLink(input: $input) {
    linkId
    templateKind
    runtimeKind
  }
}
```

## Practical Use Cases

The ObjectLink system enables powerful content authoring patterns that were difficult or impossible before. Here are the top use case scenarios:

### 1. Author Once, Deploy Everywhere

**Challenge:** Creating separate interactions/scenes for each NPC instance in each world.

**Solution:** Author content using character templates, automatically works in any world.

```typescript
// Quest definition (authored once)
{
  id: "quest:save_the_village",
  nodes: [{
    type: 'scene',
    templateKind: 'characterInstance',
    templateId: 'koba-uuid',  // Koba character template
    // At runtime: resolves to npc:42 in world_1, npc:89 in world_2
  }]
}
```

**Benefit:** Create content once, works across all worlds/playthroughs automatically. Character relationships and progress tracked on template, not runtime NPC.

---

### 2. Dynamic Character Appearances (Day/Night, Location-Based)

**Challenge:** Same character should appear differently based on time or location.

**Solution:** Multiple links with activation conditions.

```python
# Link 1: Daytime Koba (friendly merchant)
await link_service.create_link(
    template_kind='characterInstance',
    template_id='koba-uuid',
    runtime_kind='npc',
    runtime_id=42,  # Merchant NPC
    priority=5,
    activation_conditions={'time.period': 'day'}
)

# Link 2: Nighttime Koba (mysterious informant)
await link_service.create_link(
    template_kind='characterInstance',
    template_id='koba-uuid',
    runtime_kind='npc',
    runtime_id=99,  # Informant NPC
    priority=10,
    activation_conditions={'time.period': 'night'}
)
```

**Result:**
- **Day**: Player sees Koba as a merchant at the market
- **Night**: Same "Koba" character appears as mysterious informant in dark alley
- **Character memory/relationships**: Tracked on character template, persists across appearances
- **Visual appearance/location**: Changes based on context
- **Authored content**: Single set of interactions/dialogue works for both

---

### 3. Location-Specific Character Variants

**Challenge:** Character should appear differently in different districts but maintain identity.

**Solution:** Location-based activation conditions.

```python
# Uptown Koba (sophisticated, well-dressed)
ObjectLink(
    template_id='koba-uuid',
    runtime_id=npc_uptown,
    activation_conditions={'location.zone': 'uptown'},
    priority=10
)

# Downtown Koba (casual, street-smart)
ObjectLink(
    template_id='koba-uuid',
    runtime_id=npc_downtown,
    activation_conditions={'location.zone': 'downtown'},
    priority=10
)
```

**Benefit:** Character personality/relationships stay consistent, appearance/dialogue style adapts to context. Single character progression across all variants.

---

### 4. Cross-Save Character Continuity

**Challenge:** Player's relationship with a character should carry across different playthroughs.

**Solution:** Stats stored on CharacterInstance, links resolve to new NPCs automatically.

```python
# Playthrough 1: Player builds relationship with "Koba"
# Relationship data stored on character_instance, not NPC

# Playthrough 2: New world, new NPC instances
# Same character template automatically links to new NPCs via ObjectLink
# Relationship data transfers seamlessly
```

**Benefit:** Character development persists across saves/worlds without manual migration or data duplication.

---

### 5. Multi-Role Characters in Scenes

**Challenge:** Scenes need to work with different NPC instances across worlds.

**Solution:** Template-based role bindings.

```typescript
// Scene definition
{
  templateRoleBindings: {
    'mentor': {
      templateKind: 'characterInstance',
      templateId: 'obi-wan-uuid'
    },
    'student': {
      templateKind: 'characterInstance',
      templateId: 'luke-uuid'
    }
  }
}
```

**At runtime:**
- **World 1**: Resolves to `npc:42` (old Obi-Wan) and `npc:43` (young Luke)
- **World 2**: Resolves to `npc:88` (different Obi-Wan visual) and `npc:89` (different Luke)
- **Same scene script**, different visual representations
- **Character relationships**: Tracked on templates, consistent across worlds

---

### 6. Context-Aware Interaction Availability

**Challenge:** Romantic interaction should only be available in appropriate context.

**Solution:** Template targeting + activation conditions.

```typescript
// Interaction definition
{
  id: "interaction:intimate_conversation",
  targetTemplateKind: 'characterInstance',
  targetTemplateId: 'love-interest-uuid',
  // Resolves via link with activation conditions
}

// Link setup
{
  template_id: 'love-interest-uuid',
  runtime_id: npc_42,
  activation_conditions: {
    'location.id': 5,  // Home location
    'time.period': 'evening'
  }
}
```

**Result:** Interaction only appears when character is home in the evening, creating more intimate/appropriate context.

---

### 7. Seasonal/Event-Based Transformations

**Challenge:** Holiday events should change character appearances temporarily.

**Solution:** High-priority time-limited links.

```python
# Normal link (priority 0)
ObjectLink(
    template_id='santa-uuid',
    runtime_id=npc_normal,
    priority=0
)

# Holiday link (priority 100, time-limited)
ObjectLink(
    template_id='santa-uuid',
    runtime_id=npc_holiday_outfit,
    priority=100,
    activation_conditions={'event.holiday': 'christmas'}
)
```

**Behavior:**
- **During event**: Higher priority + active conditions = holiday appearance
- **After event**: Falls back to normal appearance
- **Character data**: Unchanged throughout (relationships, quests, etc.)

---

### 8. Prompt Context with Live + Template Data

**Challenge:** AI-generated dialogue needs both stable character traits AND dynamic state.

**Solution:** Link-resolved snapshots combine template and runtime data.

```python
# Get snapshot with link-resolved data
snapshot = await prompt_service.get_prompt_context_from_template(
    template_kind='characterInstance',
    template_id='koba-uuid',
    context={'location': {'zone': 'downtown'}}
)

# Snapshot automatically includes:
# - Template data: personality, background, relationships (stable/authoritative)
# - Runtime data: current mood, location, recent events (live/dynamic)
# - Spatial data: transform for rendering position
# - Merged via FieldMapping configuration
```

**Benefit:** AI-generated content has both stable character identity AND dynamic state, no manual data merging required.

---

### 9. Plugin/Mod Character Integration

**Challenge:** Mods should add characters that work with existing content systems.

**Solution:** Register template + create ObjectLink using standard mappings.

```python
from services.links.link_types import link_type_id

# Mod registers new character template
mod_character_id = 'mod:custom-companion-uuid'

# Mod creates ObjectLink using standard mapping
await link_service.create_link(
    template_kind='characterInstance',
    template_id=mod_character_id,
    runtime_kind='npc',
    runtime_id=mod_npc_id,
    mapping_id=link_type_id('characterInstance', 'npc')  # Uses standard mapping
)

# All existing systems automatically work:
# - Quest targeting
# - Interaction availability
# - Scene role bindings
# - Prompt context resolution
# No code changes needed - just data configuration
```

**Benefit:** Extensibility without code modification. Mods integrate seamlessly with core systems.

---

### 10. Real-World Example: "The Informant"

**Scenario:** "Shadow" is an informant who uses multiple covers. Player discovers they're the same person.

**Setup:**
```python
# Daytime: appears as beggar in market
ObjectLink(
    template_id='shadow-uuid',
    runtime_id=npc_beggar,
    activation_conditions={'time.period': 'morning'},
    priority=10
)

# Evening: appears as bartender in tavern
ObjectLink(
    template_id='shadow-uuid',
    runtime_id=npc_bartender,
    activation_conditions={
        'time.period': 'evening',
        'location.zone': 'tavern'
    },
    priority=10
)

# Night: appears as hacker in hideout
ObjectLink(
    template_id='shadow-uuid',
    runtime_id=npc_hacker,
    activation_conditions={'time.period': 'night'},
    priority=10
)
```

**Gameplay:**
- Player builds trust with "Shadow" over time (tracked on character template)
- Each meeting feels different (different NPCs, different locations)
- Relationship progress/quest progress is consistent across all encounters
- Player doesn't realize it's the same person until a dramatic reveal
- All quest dialogue/interactions authored once, work across all three NPCs

**Without ObjectLink:** Would need to:
- Manually sync relationship state between 3 separate NPCs
- Author content 3 times (once per NPC)
- Manage complex state transfer logic
- Risk inconsistencies in character development

**With ObjectLink:**
- Author once
- Links handle runtime resolution automatically
- State tracked on character template, consistent everywhere
- Zero risk of desync

---

### Key Patterns Summary

1. **Template-First Authoring**: Reference templates, not runtime IDs
2. **Context-Aware Resolution**: Use activation conditions for dynamic behavior
3. **Priority-Based Fallback**: Layer behaviors with priority levels
4. **Declarative Mapping**: Configure sync behavior via FieldMapping
5. **Separation of Concerns**: Template = identity/progression, Runtime = presentation/state

## Design Principles

1. **Composition over inheritance** - No base classes, pure data structures
2. **Declarative over imperative** - FieldMapping config, not hardcoded logic
3. **Registry pattern** - Extensible without modifying core code
4. **Non-breaking** - Additive changes, existing systems unaffected
5. **2D-first, 3D-ready** - Spatial model compatibility maintained
6. **Entity-agnostic** - Works for any template↔runtime pair

## References

- Current spatial model: `packages/shared/types/src/game.ts`
- FieldMapping and generic_resolver: `services/prompt_context/`
- ObjectLink model: `pixsim7/backend/main/domain/links.py`
- CharacterNPCSyncService: `services/characters/npc_sync_service.py`
- npc_prompt_mapping: `services/characters/npc_prompt_mapping.py`

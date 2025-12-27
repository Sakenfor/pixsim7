# ObjectLink System

Generic infrastructure for linking template entities to runtime instances with automatic synchronization and field mapping.

## Overview

The ObjectLink system provides a unified way to link "template" entities (like character definitions) to "runtime" entities (like NPCs in a game world). It handles:

- **Entity Loading**: Pluggable loaders for different entity types
- **Link Resolution**: Find runtime entities linked to templates
- **Field Mapping**: Declarative configuration for syncing data between entities
- **Activation Conditions**: Context-based link activation (e.g., location-dependent)
- **Priority System**: Multiple links with conflict resolution

## Quick Start

### Load an Entity

```python
from pixsim7.backend.main.services.links.object_link_resolver import ObjectLinkResolver

resolver = ObjectLinkResolver(db)

# Load a character instance
character = await resolver.load_entity('characterInstance', character_id)

# Load an NPC
npc = await resolver.load_entity('npc', npc_id)

# Load a location
location = await resolver.load_entity('location', location_id)
```

### Resolve Template→Runtime Link

```python
# Find the runtime entity linked to a template
runtime_ref = await resolver.resolve_template_to_runtime(
    template_kind='characterInstance',
    template_id='abc-123-uuid',
    context={'location.zone': 'downtown'}  # Optional activation context
)

if runtime_ref:
    print(f"Linked to {runtime_ref.kind} {runtime_ref.entity_id}")
    npc = runtime_ref.entity
```

### Get Prompt Context

```python
# Resolve and merge template + runtime data
context = await resolver.resolve_prompt_context(
    template_kind='characterInstance',
    template_id='abc-123-uuid'
)

# Returns merged data with field mappings applied
print(context['name'])
print(context['traits'])
print(context['state'])
```

### Using with PromptContextService

```python
from pixsim7.backend.main.services.characters.prompt_context_service import PromptContextService

service = PromptContextService(db)

# NEW generic API using ObjectLinkResolver
snapshot = await service.get_prompt_context_from_link(
    template_kind='characterInstance',
    template_id='abc-123-uuid',
    context={'location.zone': 'downtown'}
)

# OLD backward-compatible API for NPCs
snapshot = await service.get_npc_prompt_context(
    instance_id=character_instance_id,
    npc_id=npc_id,
    prefer_live=True
)
```

## Architecture

### Components

```
ObjectLinkResolver
├── EntityLoaderRegistry   # Maps entity kinds to loader functions
├── MappingRegistry         # Maps template↔runtime pairs to field configs
├── LinkService             # CRUD operations on ObjectLink records
└── StatEngine             # Stat normalization (optional)
```

### Entity Kinds

Currently registered:
- `character`: CharacterInstance (template)
- `npc`: GameNPC (runtime)
- `location`: GameLocation (runtime)

### Field Mappings

Currently registered:
- `characterInstance->npc`: Maps CharacterInstance fields to GameNPC fields
- `itemTemplate->item`: Stub mapping for future use
- `propTemplate->prop`: Stub mapping for future use

## Registering New Entity Types

### 1. Add Entity Loader

Edit `pixsim7/backend/main/services/links/entity_loaders.py`:

```python
def register_default_loaders():
    # ... existing loaders ...

    # Add your custom loader
    async def load_my_entity(entity_id, db: AsyncSession):
        """Load MyEntity by ID"""
        return await db.get(MyEntity, entity_id)

    registry.register_loader('myEntity', load_my_entity)
```

### 2. Add Field Mapping

Edit `pixsim7/backend/main/services/links/default_mappings.py`:

```python
def register_default_mappings():
    # ... existing mappings ...

    # Add your custom mapping
    registry.register('myTemplate->myEntity', get_my_entity_mapping())


def get_my_entity_mapping() -> Dict[str, FieldMapping]:
    """Field mapping for myTemplate → myEntity"""
    return {
        "name": FieldMapping(
            target_path="name",
            source="template",          # Authority source
            fallback="runtime",         # Fallback if primary missing
            source_paths={
                "template": "name",     # Path in template entity
                "runtime": "name"       # Path in runtime entity
            }
        ),
        "quantity": FieldMapping(
            target_path="state.quantity",
            source="runtime",           # Runtime is authoritative
            fallback="template",
            source_paths={
                "template": "default_quantity",
                "runtime": "quantity"
            }
        ),
    }
```

### 3. Startup Automatically Registers

The `setup_link_system()` function in `startup.py` automatically calls:
- `register_default_loaders()` → Registers entity loaders
- `register_default_mappings()` → Registers field mappings

No additional startup code needed!

## Field Mapping Configuration

### FieldMapping Attributes

```python
FieldMapping(
    target_path="traits.openness",      # Output path (dot notation)
    source="instance",                   # Primary authority: "template", "runtime", "instance", "npc"
    fallback="npc",                     # Fallback source if primary unavailable
    source_paths={                      # Paths in each source entity
        "instance": "personality_traits.openness",
        "npc": "personality.openness"
    },
    stat_axis="openness",               # Optional: Stat normalization axis
    stat_package_id="core.personality", # Optional: Stat package for normalization
    transform=lambda val, ctx: val * 2 # Optional: Value transformation
)
```

### Authority Patterns

**Template Authoritative**:
- Name, description, base stats
- Visual configuration
- Personality baselines

```python
source="template", fallback="runtime"
```

**Runtime Authoritative**:
- Current state (health, mood)
- Location, position
- Runtime counters

```python
source="runtime", fallback="template"
```

**Bidirectional** (with careful conflict resolution):
- Mood (can drift, can be reset)
- Custom fields per-link

```python
source="runtime", fallback="template"  # or vice versa
```

## Activation Conditions

Links can be conditionally active based on runtime context:

```python
# Create link with activation conditions
link = await link_service.create_link(
    template_kind='characterInstance',
    template_id='abc-123',
    runtime_kind='npc',
    runtime_id=456,
    activation_conditions={'location.zone': 'downtown'}
)

# Resolve with context
runtime_ref = await resolver.resolve_template_to_runtime(
    'characterInstance',
    'abc-123',
    context={'location.zone': 'downtown'}  # Matches condition
)
# Returns the link

runtime_ref = await resolver.resolve_template_to_runtime(
    'characterInstance',
    'abc-123',
    context={'location.zone': 'suburbs'}  # Doesn't match
)
# Returns None (link not active)
```

## Priority System

When multiple links target the same runtime entity, priority determines which wins:

```python
# High priority link
link1 = await link_service.create_link(
    template_id='character-a',
    runtime_id=123,
    priority=100  # Higher priority
)

# Low priority link
link2 = await link_service.create_link(
    template_id='character-b',
    runtime_id=123,
    priority=10   # Lower priority
)

# Resolve returns highest priority active link
runtime_ref = await resolver.resolve_template_to_runtime('characterInstance', 'character-a')
# Returns link1 (priority 100)
```

## Plugin Integration

Plugins can extend the link system by registering additional loaders or mappings.

**Note**: The link system is initialized during startup (before plugins load), so registries are always available. No defensive imports needed.

```python
from pixsim7.backend.main.services.links.entity_loaders import get_entity_loader_registry
from pixsim7.backend.main.services.links.mapping_registry import get_mapping_registry
from pixsim7.backend.main.services.prompt_context.mapping import FieldMapping

class MyPlugin(Plugin):
    def on_enable(self):
        # Register custom loader
        loader_registry = get_entity_loader_registry()

        async def load_custom_entity(entity_id, db):
            return await db.get(CustomEntity, entity_id)

        loader_registry.register_loader('customEntity', load_custom_entity)

        # Register custom mapping
        mapping_registry = get_mapping_registry()
        mapping_registry.register('customTemplate->customEntity', {
            'name': FieldMapping(
                target_path='name',
                source='template',
                fallback='runtime',
                source_paths={'template': 'name', 'runtime': 'name'}
            )
        })
```

## Testing

### Unit Tests

See `tests/services/links/test_object_link_resolver.py` for examples:

```python
@pytest.mark.asyncio
async def test_load_entity(db_session):
    resolver = ObjectLinkResolver(db_session)
    character = await resolver.load_entity('characterInstance', 'some-uuid')
    assert character is not None
```

### Integration Tests

```python
@pytest.mark.asyncio
async def test_resolve_via_link(db_session, sample_link):
    resolver = ObjectLinkResolver(db_session)

    runtime_ref = await resolver.resolve_template_to_runtime(
        sample_link.template_kind,
        sample_link.template_id
    )

    assert runtime_ref.entity_id == sample_link.runtime_id
```

## Startup Verification

The system logs initialization stats:

```
link_system_initialized loaders=3 mappings=3
```

Verify in logs that:
- At least 2 loaders registered (characterInstance, npc)
- At least 1 mapping registered (characterInstance->npc)

## Migration from Legacy Systems

### CharacterNPCLink Consolidation

The old `CharacterNPCLink` table has been consolidated into `ObjectLink`.
Use `LinkService` with `template_kind='characterInstance'` and
`runtime_kind='npc'` for all character↔NPC links.

### From Direct DB Queries

```python
# OLD: Direct database query
instance = await db.get(CharacterInstance, instance_id)
npc = await db.get(GameNPC, npc_id)

# NEW: Loader registry (consistent, cacheable, extensible)
# The link_resolver is always available after startup
instance = await resolver.load_entity('characterInstance', str(instance_id))
npc = await resolver.load_entity('npc', npc_id)
```

**Benefits of using the loader registry**:
- Consistent entity loading across all services
- Single point for adding caching/middleware
- Easy to mock for testing
- Extensible by plugins

## Performance Considerations

- **Loader Registry**: O(1) lookup by entity kind
- **Mapping Registry**: O(1) lookup by mapping ID
- **Link Resolution**: O(n) where n = number of links for template (typically 1-5)
- **Field Mapping**: O(m) where m = number of mapped fields (typically 10-50)

Future optimizations:
- Loader-level caching
- Link caching by template_id
- Batch resolution for multiple templates

## Error Handling

```python
# Missing loader
try:
    entity = await resolver.load_entity('unknown_type', 'id')
except ValueError as e:
    print(e)  # "No loader registered for entity kind 'unknown_type'"

# Missing mapping
try:
    context = await resolver.resolve_prompt_context(
        'unmapped_template',
        'id',
        runtime_kind='unmapped_runtime',
        runtime_id=123
    )
except ValueError as e:
    print(e)  # "No mapping registered for 'unmapped_template->unmapped_runtime'"

# No link found
runtime_ref = await resolver.resolve_template_to_runtime('characterInstance', 'id')
assert runtime_ref is None  # No error, just None
```

## See Also

- `services/links/entity_loaders.py` - Entity loader registry
- `services/links/mapping_registry.py` - Field mapping registry
- `services/links/link_service.py` - ObjectLink CRUD operations
- `services/links/object_link_resolver.py` - Main resolver service
- `services/prompt_context/mapping.py` - FieldMapping infrastructure
- `domain/links.py` - ObjectLink domain model

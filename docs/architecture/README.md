# Architecture Documentation

This directory contains architecture documentation for PixSim7's subsystems and cross-cutting architectural concerns.

## Organization

### Root-Level Architecture

High-level architecture documents at the project root:

- **[ARCHITECTURE.md](../../ARCHITECTURE.md)** - Overall system architecture
  - System overview and design principles
  - Service architecture and communication patterns
  - Technology stack and infrastructure

- **[ARCHITECTURE_DIAGRAMS.md](../../ARCHITECTURE_DIAGRAMS.md)** - Visual architecture diagrams
  - System diagrams and flowcharts
  - Component interaction diagrams
  - Deployment architecture

### Subsystem Architecture

Detailed architecture for specific subsystems:

- **[ui-architecture.md](./subsystems/ui-architecture.md)** - Editable UI system
  - React-based editable UI architecture
  - Component composition and state management
  - UI plugin integration points
  - 1205 lines - comprehensive UI system design

- **[launcher-architecture.md](./subsystems/launcher-architecture.md)** - Application launcher
  - Launcher system design and responsibilities
  - Desktop app integration
  - Session management and lifecycle
  - 252 lines - focused on launcher concerns

- **[npc-architecture.md](./subsystems/npc-architecture.md)** - NPC persona system
  - NPC identity and personality architecture
  - Persona configuration and metadata
  - Integration with game systems and generation
  - 289 lines - NPC system design

### Cross-Cutting Architecture

Architecture that spans multiple subsystems:

- **[EXTENSION_ARCHITECTURE.md](../EXTENSION_ARCHITECTURE.md)** - Extension & plugin surfaces
  - Backend plugins (routes, domain models, behaviors)
  - Frontend UI plugins and sandboxing
  - Graph/node renderer plugins
  - Game/world JSON extension conventions
  - Decision guide for choosing extension surfaces

- **[ADR-GIZMO-ARCHITECTURE.md](../ADR-GIZMO-ARCHITECTURE.md)** - Gizmo architecture decision record
  - Architecture Decision Record (ADR) for gizmo system
  - Design rationale and trade-offs
  - Implementation decisions

### Plugin System Architecture

Plugin system documentation (consolidated in separate directory):

- **[../systems/plugins/](../systems/plugins/README.md)** - Plugin system documentation
  - Plugin loading and discovery
  - UI plugin sandboxing and permissions
  - Plugin developer guide and API reference
  - Plugin catalog

### Generation System Architecture

Generation system documentation (consolidated in separate directory):

- **[../systems/generation/](../systems/generation/README.md)** - Generation system documentation
  - Generation pipeline architecture
  - Provider integration and capabilities
  - Generation workflows and action blocks

## Archived Architecture Documentation

Historical architecture documents and completed plans:

- **[../archive/architecture/](../archive/architecture/)** - Archived architecture docs
  - ARCHITECTURE_SIMPLIFICATION_PLAN.md - Historical simplification plan
  - MERGE_MIDDLEWARE_PLUGIN_ARCHITECTURE.md - Plugin architecture merge documentation
  - ARCHITECTURE_AUDIT_CLAUDE_TASKS.md - Audit results

## Quick Navigation

### By Concern

**Frontend Architecture:**
- UI System: [ui-architecture.md](./subsystems/ui-architecture.md)
- Extension UI: [EXTENSION_ARCHITECTURE.md](../EXTENSION_ARCHITECTURE.md) (section 4)
- Gizmo System: [ADR-GIZMO-ARCHITECTURE.md](../ADR-GIZMO-ARCHITECTURE.md)

**Backend Architecture:**
- Extension Backend: [EXTENSION_ARCHITECTURE.md](../EXTENSION_ARCHITECTURE.md) (section 3)
- Plugin System: [../systems/plugins/PLUGIN_ARCHITECTURE.md](../systems/plugins/PLUGIN_ARCHITECTURE.md)

**Game Systems:**
- NPC System: [npc-architecture.md](./subsystems/npc-architecture.md)
- Generation: [../systems/generation/GENERATION_SYSTEM.md](../systems/generation/GENERATION_SYSTEM.md)

**Application Infrastructure:**
- Launcher: [launcher-architecture.md](./subsystems/launcher-architecture.md)
- Overall System: [../../ARCHITECTURE.md](../../ARCHITECTURE.md)

### By Audience

**New Developers:**
1. Start with [../../ARCHITECTURE.md](../../ARCHITECTURE.md) for system overview
2. Review [EXTENSION_ARCHITECTURE.md](../EXTENSION_ARCHITECTURE.md) to understand extension surfaces
3. Dive into specific subsystems as needed

**Plugin Developers:**
1. Read [EXTENSION_ARCHITECTURE.md](../EXTENSION_ARCHITECTURE.md) for extension surface decision guide
2. Follow [../systems/plugins/PLUGIN_DEVELOPER_GUIDE.md](../systems/plugins/PLUGIN_DEVELOPER_GUIDE.md)
3. Check subsystem architecture for integration points

**System Architects:**
1. Review [../../ARCHITECTURE.md](../../ARCHITECTURE.md) and [../../ARCHITECTURE_DIAGRAMS.md](../../ARCHITECTURE_DIAGRAMS.md)
2. Read all subsystem architecture docs
3. Understand extension surfaces in [EXTENSION_ARCHITECTURE.md](../EXTENSION_ARCHITECTURE.md)

## Related Documentation

- [Systems Documentation](../systems/) - Organized documentation for core systems
- [Developer Guides](../INDEX.md) - Comprehensive documentation index
- [Plugin System](../systems/plugins/) - Plugin system documentation
- [Generation System](../systems/generation/) - Generation system documentation

## Contributing

When documenting new architectural decisions:

1. **ADRs (Architecture Decision Records)**: Use ADR-*.md format for significant decisions
2. **Subsystem Architecture**: Add to subsystems/ for new major subsystems
3. **Cross-Cutting Concerns**: Document in docs/ root if it spans multiple subsystems
4. **Update This README**: Add links and descriptions for new architecture docs

## Best Practices

1. **Keep architecture docs synchronized** with code and implementation reality
2. **Reference related documentation** to avoid duplication
3. **Use diagrams** where helpful (add to ARCHITECTURE_DIAGRAMS.md)
4. **Document trade-offs** and design rationale, not just final decisions
5. **Update the index** when adding new architecture documentation

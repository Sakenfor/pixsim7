# PixSim7 Documentation

## Quick Start
- [Getting Started](./getting-started/README.md) - Setup, launcher, ports
- [Architecture Overview](./architecture/README.md) - System design
- [Testing Overview](./testing/TEST_OVERVIEW.md) - Test folders, runner profiles, and commands
- [Plans Registry](./plans/README.md) - DB-first plan governance and API workflow
- [DB-first Plans + Meta Contracts](./reference/db-first-plans-and-meta-contracts.md) - Plan APIs and contract discovery
- [Repository Map](./repo-map.md) - Codebase structure
- [App Map](./APP_MAP.md) - Auto-generated feature/route/store index

## Core Systems

### Backend
- [Infrastructure](./infrastructure/README.md) - Backend startup, services, middleware
- [Backend Services](./backend/SERVICES.md) - Service layer reference
- [Database & Logging](./database-and-logging/README.md) - PostgreSQL, TimescaleDB, structured logs
- [API Endpoints](./api/ENDPOINTS.md) - Generated API reference
- [API Case Conventions](../pixsim7/backend/main/CASE_CONVENTIONS.md) - snake_case vs camelCase at boundaries

### Frontend
- [Frontend Guide](./frontend/README.md) - Components, patterns, UI tasks
- [UI Systems](./ui/README.md) - Overlays, HUD, positioning

### Game
- [Game Systems](./game-systems/README.md) - Core mechanics, NPCs, interactions, relationships
- [Narrative Engine](./narrative/README.md) - Story runtime, interactions
- [Stats & Systems](./stats-and-systems/README.md) - Relationship, social metrics

## Features & Extensibility
- [Plugins](./systems/plugins/README.md) - Plugin architecture, registry
- [Generation](./systems/generation/overview.md) - Generation pipeline and providers
- [Features](./features/README.md) - Simulation, intimacy, automation
- [Prompts](./prompts/README.md) - Prompt system, templates, versioning

## Security & Auth
- [Authentication](./authentication/README.md) - Auth flows, storage abstraction, desktop support

## Reference
- [Controls](./controls/README.md) - Input handling
- [Behavior System](./behavior_system/README.md) - NPC behavior system
- [Decisions](./decisions/README.md) - Architecture decision records
- [Reviews](./architecture/reviews/README.md) - Architecture reviews and audits
- [Guides](./guides/registry-patterns.md) - Registry patterns
- [Walkthroughs](./walkthroughs/README.md) - Step-by-step guides
- [Agent Guidelines](./AGENTS.md) - AI agent conventions
- [Docs Rulebook](./plans/active/md-governance-rulebook/companions/MD_RULEBOOK.md) - Markdown authoring rules for AI and humans
- [Plans Registry](./plans/README.md) - Plan governance (DB-first)
- [DB-first Plans + Meta Contracts](./reference/db-first-plans-and-meta-contracts.md) - API-first plan operations and contract index

## Archive
- [Archive](./archive/README.md) - Historical docs, completed plans, legacy tasks

---

## Conventions
- Place new docs in appropriate subfolder (avoid top-level files in `docs/`)
- Use `README.md` as folder entry point
- Use `kebab-case.md` for new files
- Temporary notes go in `docs/archive/`

## Search
```bash
rg "<term>" docs/
```

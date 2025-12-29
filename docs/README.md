# PixSim7 Documentation

## Quick Start
- [Getting Started](./getting-started/README.md) - Setup, launcher, ports
- [Architecture Overview](./architecture/README.md) - System design
- [Repository Map](./repo-map.md) - Codebase structure

## Core Systems

### Backend
- [Infrastructure](./infrastructure/README.md) - Backend startup, services, middleware
- [Database & Logging](./database-and-logging/README.md) - PostgreSQL, TimescaleDB, structured logs

### Frontend
- [Frontend Guide](./frontend/README.md) - Components, patterns, UI tasks
- [UI Systems](./ui/README.md) - Overlays, HUD, positioning

### Game
- [Game Systems](./game-systems/README.md) - Core game mechanics
- [Narrative Engine](./narrative/README.md) - Story runtime, interactions
- [Stats & Systems](./stats-and-systems/README.md) - Relationship, social metrics

## Features & Extensibility
- [Plugins](./plugins-and-extensibility/README.md) - Plugin architecture, registry
- [Features](./features/README.md) - Simulation, intimacy, automation
- [Actions](./actions/README.md) - Action blocks, prompt engine
- [Prompts](./prompts/README.md) - LLM prompt system, versioning

## Security & Auth
- [Authentication](./authentication/README.md) - Auth flows, storage abstraction, desktop support

## Reference
- [Controls](./controls/README.md) - Input handling
- [Behavior System](./behavior_system/README.md) - AI behaviors
- [Comedy Panels](./comedy-panels/README.md) - Comic panel system
- [Decisions](./decisions/README.md) - Architecture decision records
- [Walkthroughs](./walkthroughs/README.md) - Step-by-step guides

## Analysis
- [Audits](./audits-and-analysis/README.md) - Code audits, cleanup reports

---

## Conventions
- Place new docs in appropriate subfolder (avoid top-level files in `docs/`)
- Use `README.md` as folder entry point
- Use `kebab-case.md` for new files
- Temporary notes go in `docs/implementation/` or `docs/archive/`

## Search
```bash
rg "<term>" docs/
```

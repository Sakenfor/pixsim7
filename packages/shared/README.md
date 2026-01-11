Shared Packages Overview
========================

This folder contains cross-frontend, framework-agnostic packages.

Conventions
-----------
- `shared.types`: TypeScript contract (types/schemas/constants). No runtime helpers.
- `shared.logic-core`: Cross-cutting runtime helpers that operate on shared types.
- `shared/*-core`: Domain-specific runtime helpers (assets, generation, ref, etc.).

Current Map
-----------
- `assets-core`: Asset utilities (media type helpers, asset actions, hash helpers).
- `capabilities-core`: Capability registry and adapters.
- `generation-core`: Generation domain types/utilities.
- `helpers-core`: Helper registry infrastructure.
- `logic-core`: Cross-domain helpers (content rating, world config parsing, stats helpers,
  prompt/composition helpers, brain helpers, branded ID parsers).
- `ref-core`: Ref parsing/building and guards (canonical string ref format).
- `types`: Shared TypeScript contract (Zod schemas, DTO types).
- `api-client`: Shared API client utilities.
- `config`: Shared config data.
- `ui`: Shared UI primitives.

# @pixsim7/graph (Foundation Draft)

Canonical graph schema + TypeScript types for scene + simulation graphs.

## Files
- `schema/graph.schema.json` – source-of-truth JSON Schema (version 1.0.0)
- `src/index.ts` – manual stub types + evaluator + RNG (to replace with codegen)

## Planned Generation
1. Validate schema with a JSON Schema validator.
2. Generate Zod definitions + TS types (replace manual stub).
3. Generate Python models (Pydantic/msgspec) for game service.

## Node Type Summary
| Type      | Purpose                               |
|-----------|---------------------------------------|
| Decision  | Branch selection logic                |
| Condition | Gate/branch based on predicates       |
| Action    | Declarative effects                   |
| Choice    | User-facing branching                 |
| Video     | Segment selection + playback instr.   |
| Random    | RNG-based branching                   |
| Timer     | Delay/hang for ticks                  |
| SceneCall | Invoke published scene version        |
| Subgraph  | Call another graph                    |

## Evaluation Contract
Evaluator returns `{ effects[], instructions[], nextNodes[] }`.
Integration layer decides which next node to execute (resolve choices, apply effects, manage timers).

## RNG
Provided seed → deterministic xorshift32 stream; all random decisions must use injected RNG.

## TODO (for continuation)
- Expand Condition/effect schemas (rich predicates, range ops)
- Add edge object structure (with id, conditions, weight/priority)
- Add validation library integration
- Remove placeholder evaluator logic

## Versioning
Schema version pinned (`1.0.0`). Breaking changes require bump + migration script.

---
End of draft.

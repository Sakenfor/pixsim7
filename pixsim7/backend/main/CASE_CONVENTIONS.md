# Case Conventions

This project keeps Python code and internal data in snake_case, while
public JSON uses camelCase.

## Rules

- Internal services, domain models, and DB payloads use snake_case only.
- API boundary schemas inherit from `ApiModel` to accept both snake_case
  and camelCase input, and to serialize responses as camelCase.
- When passing API payloads into internal services, call
  `model_dump(by_alias=False)` to keep snake_case keys.

## Exceptions (documented)

- Pass-through `meta` blobs may contain mixed casing from clients.
- Third-party payloads retain their native casing.
- Legacy API schemas with camelCase field names in Python remain as-is
  until migrated (e.g. `pixsim7/backend/main/api/v1/game_scenes.py`).

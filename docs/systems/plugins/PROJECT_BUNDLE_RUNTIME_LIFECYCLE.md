# Project Bundle Runtime Lifecycle

This contract defines runtime-only lifecycle semantics for project bundle modules/extensions.
Persisted project bundles remain POJO payloads (`core`, `modules`, `extensions`) and do not
store runtime state.

## States

- `bootstrap`: optional pre-registration state before runtime wiring.
- `registered`: handler/module key is registered in the runtime bridge.
- `imported`: payload has been accepted for import in the current runtime cycle.
- `active`: extension is active for the loaded world context.
- `disabled`: module is intentionally disabled and must not import/activate.
- `removed`: module/extension is no longer present in runtime for the world context.

## Allowed transitions

- `bootstrap -> registered | removed`
- `registered -> imported | active | disabled | removed`
- `imported -> active | disabled | removed`
- `active -> disabled | removed`
- `disabled -> registered | removed`
- `removed -> registered`

Idempotent reapply (`state -> same state`) is allowed and treated as a no-op.

## Invalid transition behavior

Invalid transitions throw `invalid_project_bundle_lifecycle_transition:<key>:<from>-><to>` and
must be treated as contract violations in runtime bridge/service paths.

## Runtime enforcement notes

- Disabled modules are blocked before import and never promoted to `active`.
- Import replay is idempotent per `(world_id, extension_key, payload_fingerprint)`.
- Disabling a module clears replay cache so re-enable can import again.
- Removing modules/extensions from a world context marks cached runtime entries as `removed`.

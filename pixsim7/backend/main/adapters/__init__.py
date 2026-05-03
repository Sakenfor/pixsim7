"""
Backend-side adapters for sibling-package capability locators.

Sibling-package convention (read this once, then it's all just files in
the right places):

  ┌─────────────────────────────────────────────────────────────────┐
  │  pixsim7/<sibling>/        — sibling package, no backend imports │
  │    protocol.py / protocols/  — Protocol classes + frozen DTOs    │
  │    locator.py                — bind_*/get_* runtime registry     │
  │    services/, daemon.py, …   — package-internal implementations  │
  │                                                                  │
  │  pixsim7/backend/main/                                           │
  │    adapters/<sibling>.py     — concrete protocol impls (here)    │
  │    capability_registry.py    — declares which hosts get bindings │
  └─────────────────────────────────────────────────────────────────┘

Rules:

1. **One adapter file per sibling.** `adapters/<sibling>.py` exposes
   `bind_<sibling>_capabilities()` and, if the sibling owns process-level
   resources (subprocesses, sockets, …), `shutdown_<sibling>_capabilities()`.

2. **No cross-adapter imports.** Each adapter is independent of the others.

3. **Backend → sibling, never the reverse.** Sibling packages must not
   `import pixsim7.backend.*`. That import direction is the architectural
   commitment that keeps Phase-2/3 extraction reachable.

4. **Wire-shape stability.** Protocols and DTOs are pinned by snapshot
   tests (`backend/tests/test_<sibling>_protocol_stability.py`). Changing
   a method signature or DTO field is a deliberate review-time decision —
   updating the snapshot in the same commit is the audit trail.

5. **Host wiring is single-sourced.** `capability_registry.py` lists which
   sibling gets bound in which host (FastAPI / main worker / automation
   worker / retry worker). Lifespan and worker startup call
   `bind_for_host(...)` and `shutdown_for_host(...)`; no per-package
   wiring is scattered through `main.py` or `arq_worker.py`.

When adding a new sibling:
  - Drop `pixsim7/<name>/` with its own protocol + locator (mirror automation
    or embedding for reference).
  - Implement the protocol in `adapters/<name>.py` with
    `bind_<name>_capabilities()` (+ optional shutdown).
  - Add a `CapabilityBinding` entry in `capability_registry.all_bindings()`.
  - Add `backend/tests/test_<name>_protocol_stability.py` snapshotting the
    wire shape. The drift-prevention test in
    `test_capability_registry.test_known_siblings_are_registered` will fail
    until the registry entry is added — that's the point.
"""

"""
Task 39 – Launcher Backend Stop Behavior & UX

Goal

Make the PixSim7 launcher’s stop behavior for backend-style services (backend, main-api, generation-api, and *-api) robust and predictable on Windows and Unix, especially when running uvicorn with --reload.

Background / Current State

The launcher’s ServiceProcess.stop() implementation already has fairly advanced logic for killing detached or externally-detected processes:

- Uses PID-based kills for QProcess and subprocess.Popen flows.
- For detected processes, it:
  - Kills the known PID.
  - Uses find_pid_by_port(port) to see if something is still listening.
  - On Windows + backend, tries to find the uvicorn root PID and kill the tree.
  - Logs diagnostic events via launcher_logger (detached_process_kill, detected_process_kill, detected_new_pid_after_kill, detected_process_kill_success_but_still_running).

After the backend tree unification (pixsim7.backend.main.*), there are now multiple backend-style services:

- backend (classic dev entry)
- main-api (dynamic services.json-driven main API)
- generation-api (split generation-focused API)
- any future *-api services

Recent behavior observed for main-api:

- Stop is invoked from the launcher (service_stop logged, graceful: true).
- The launcher kills the current PID and logs detected_process_kill with success: true.
- Shortly afterwards it logs detected_new_pid_after_kill / detected_process_kill_success_but_still_running for a new PID on the same port.
- Health checks hit /health and report the service as healthy + running again, even though the user just stopped it.

This is primarily a Windows + uvicorn --reload nuance: a uvicorn “reloader” parent or a second supervising process can immediately spawn a new worker after the one the launcher killed, so from the launcher’s perspective the service “comes back” on the same port.

Scope

This task focuses on the launcher behavior only:

- launcher/gui/processes.py (ServiceProcess and process stop logic)
- launcher/gui/process_utils.py (PID discovery helpers)
- launcher/services.json and/or launcher/gui/services.py (service definitions/metadata as needed)

Out of scope:

- Changing how the backend itself starts/stops inside uvicorn (that is handled by uvicorn and python -m uvicorn).
- Changing the overall architecture of the backend services.

Problems to Solve

1. Inconsistent backend-style service handling
- Currently, “backend” gets special Windows/uvicorn logic, but main-api and generation-api only partially benefit.
- This leads to inconsistent stop behavior: backend may stop cleanly; main-api may appear to “restart itself”.

2. Confusing UX when stop is invoked
- The launcher logs service_stop and detected_process_kill success for main-api, then shortly logs detected_new_pid_after_kill and reports service_health as healthy/running again.
- From the user’s perspective, “stop” looks like a no-op or immediate restart.

3. Limited fallback when a new PID appears
- In cases where the worker PID is killed but a new PID appears on the same port, the launcher currently:
  - Logs a warning (detected_process_kill_success_but_still_running).
  - Marks health_status as UNHEALTHY (for detected processes).
  - Only uses the more aggressive find_backend_candidate_pids_windows fallback for self.defn.key == "backend".

Goals / Desired Behavior

- Treat all backend-style services consistently (backend, main-api, generation-api, any *-api).
- When the user hits Stop:
  - Kill the service’s worker and any supervising uvicorn processes that are responsible for that service’s port.
  - If some other process (outside the launcher’s control) immediately rebinds the port, surface a clear log/UX message indicating that an external supervisor is restarting the service.
- Ensure the UI doesn’t immediately flip the service back to “healthy/running” if stop was requested and a “new” PID appears on the same port from an external process.

Proposed Changes

1. Normalize backend-style service detection

- Introduce a small helper in launcher/gui/processes.py:

  - is_backend_service = (
      self.defn.key in ("backend", "main-api", "generation-api")
      or self.defn.key.endswith("-api")
    )

- Use is_backend_service consistently wherever backend-specific process handling exists:
  - Uvicorn root detection (find_uvicorn_root_pid_windows).
  - Command-line fallback heuristics (find_backend_candidate_pids_windows).
  - Any future backend-specific stop/health behavior.

2. Strengthen fallback when PID changes or survives

- For detected processes (proc is None and detected_pid is set):
  - If kill reported success but a new PID appears on the same port, and is_backend_service is True:
    - Attempt the “backend candidate PID” fallback unconditionally for backend-style services, not just for key == "backend".
    - If after that fallback no process is listening on the port, mark the service as STOPPED and clear detected_pid.
    - If a process still listens on the port, clearly log that an external supervisor is likely restarting the service from outside the launcher’s control.

- Consider a small backoff / grace period before re-checking health for backend-style services after a stop:
  - Example: mark them as STOPPING for a short window (e.g., up to 2 seconds) and suppress health probes during that window.
  - Only transition to RUNNING again if the user explicitly hits Start or if there is a clear indication that the service was restarted outside the launcher.

3. Clarify health vs requested state in the launcher UI

- Distinguish between:
  - “Service is responding on its health endpoint” (health) and
  - “Service is running under the launcher’s control” (requested state).

- When stop is pressed:
  - Mark the requested state as STOPPED (or STOPPING).
  - If the port is still occupied by a process that the launcher did not start (no matching PID in started_pid / detected_pid after aggressive kill attempts), show that the service is “externally running” or “out of launcher control” rather than flipping the button back to “Running” unconditionally.

4. Logging and diagnostics

- Keep the current structured logs (service_stop, detected_process_kill, detected_new_pid_after_kill, detected_process_kill_success_but_still_running) but add:
  - A clear event when the fallback kill-by-commandline succeeds for a backend-style service (already partially implemented for backend).
  - A clear event when the launcher gives up because the port is still occupied by a process that appears to be managed externally (e.g., “fallback_exhausted_still_running_external_supervisor”).

Acceptance Criteria

- For backend, main-api, and generation-api on Windows:
  - Pressing Stop from the launcher reliably terminates the uvicorn worker and its reloader parent when they were started by the launcher.
  - The launcher no longer immediately reports the service as running/healthy again solely because a new PID appears on the port after stop, unless the user explicitly started it again or it’s clear that an external supervisor is restarting it.
  - The logs clearly differentiate between:
    - “Stop succeeded; no process is listening on the port after fallbacks.”
    - “Stop attempted but another process is still listening (likely external supervision).”

- On Unix, existing behavior remains correct or improves (no regressions), with backend-style services still being stopped via process group kills.

Nice-to-haves

- A small CLI or internal diagnostic endpoint that can dump the launcher’s view of:
  - started_pid, detected_pid, and any candidate PIDs for each service.
  - Which backend-style services are considered under launcher control vs externally managed.

Related Docs / References

- launcher/gui/processes.py – ServiceProcess.start/stop, health tracking, and logging.
- launcher/gui/process_utils.py – find_pid_by_port, kill_process_by_pid, find_uvicorn_root_pid_windows, find_backend_candidate_pids_windows.
- launcher/services.json – backend_services definitions for main-api and generation-api.
- docs/DYNAMIC_SERVICE_MANAGEMENT.md – Service discovery and orchestration design.
""" +

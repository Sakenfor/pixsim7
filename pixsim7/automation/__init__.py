"""
pixsim7.automation — device automation package.

Sibling of pixsim7.backend rather than nested inside it. The import-graph
location itself is the statement: automation does not depend on backend code.
Backend (and the launcher, and any future consumer) depends on this package
via protocol-bound seams defined in pixsim7.automation.protocols.

Phased extraction — see plan: automation-package-extraction.

Phase 1 complete: domain, services, and worker live here; backend implements
the four protocols (AccountLookup, ProviderMetadataLookup, JobQueue,
PathRegistry) via adapters bound at lifespan startup.

Phase 2 complete: automation owns its own alembic chain
(alembic_automation.ini, version_table='alembic_version_automation') and
session factory (AsyncAutomationSessionLocal). Cross-DB FK constraints to
provider_accounts / users are dropped — those columns are plain ints.
The execution loop's reservation step goes through
AccountLookup.reserve_account (backend DB does the atomic SELECT FOR UPDATE
+ capacity check), and a compensating release_reservation runs if the
automation-side INSERT or enqueue fails. tools/migrate_automation_tables.py
performs the opt-in cutover when AUTOMATION_DATABASE_URL is set.

Phase 2 invariant (enforced by the cross-DB isolation audit, Phase 2e):
- Automation code never opens a backend session — pixsim7.automation/* uses
  the automation session factory exclusively.
- Automation never queries backend tables (provider_accounts, users) directly.
  All backend reads/writes go through the protocol surface.
- Backend code that touches automation tables uses the automation session
  factory (AsyncAutomationSessionLocal / get_automation_db /
  get_async_automation_session) — not the main backend session. The 3 mixed
  FastAPI endpoints in backend/main/api/v1/automation.py inject both
  sessions explicitly.
- No SQLAlchemy Relationship() crosses the boundary in either direction.

Phase 3 doors (separate service) remain open: snapshots are serializable,
protocols are coarse + async, no transactions span the boundary.
"""

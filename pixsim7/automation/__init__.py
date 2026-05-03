"""
pixsim7.automation — device automation package.

Sibling of pixsim7.backend rather than nested inside it. The import-graph
location itself is the statement: automation does not depend on backend code.
Backend (and the launcher, and any future consumer) depends on this package
via protocol-bound seams defined in pixsim7.automation.protocols.

Phased extraction — see plan: automation-package-extraction.
Phase 1 complete: domain, services, and worker live here; backend implements
the four protocols (AccountLookup, ProviderMetadataLookup, JobQueue,
PathRegistry) via adapters bound at lifespan startup. Phase 2 (own DB) and
Phase 3 (separate service) doors are open: snapshots are serializable,
protocols are coarse, no transactions span the boundary.
"""

"""
pixsim7.automation — device automation package.

Sibling of pixsim7.backend rather than nested inside it. The import-graph
location itself is the statement: automation does not depend on backend code.
Backend (and the launcher, and any future consumer) depends on this package
via protocol-bound seams defined in pixsim7.automation.protocols.

Phased extraction — see plan: automation-package-extraction.
Phase 1a (current): protocol surface + snapshot DTOs live here, but existing
automation code still lives under pixsim7.backend.main.* until Phase 1d.
"""

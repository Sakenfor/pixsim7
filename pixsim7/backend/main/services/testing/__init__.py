"""Backend-side testing service — DB sync and test-run recording.

Pure discovery and catalog assembly (no DB dependency) live in the
repo-level :mod:`testing` package. This module hosts only the pieces
that touch backend models:

* :mod:`.sync` — syncs the catalog into ``TestSuiteRecord``
* :mod:`.report` — writes ``TestRunRecord`` rows
* :mod:`.ttl` — caching wrapper around sync
"""

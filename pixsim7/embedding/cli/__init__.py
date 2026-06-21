"""Subprocess CLI entry points for the embedding capability.

The text embedder (``text_local.py``) is spawned by the backend via
``CommandEmbeddingProvider`` and reads/writes line-delimited JSON over
stdin/stdout. Distinct from the protocol/client modules in the parent package
because its lifecycle is "another process," not "another import." (The image
path runs as the standalone ``server.py`` HTTP daemon, not a stdio CLI.)

Invoke via ``python -m pixsim7.embedding.cli.<name>``.
"""

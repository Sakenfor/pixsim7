"""Subprocess CLI entry points for the embedding capability.

These are spawned by the backend (via ``CommandEmbeddingProvider`` / the
SigLIP ``DaemonEmbeddingService``) and read/write line-delimited JSON over
stdin/stdout. Distinct from the protocol/client modules in the parent package
because their lifecycle is "another process," not "another import."

Invoke via ``python -m pixsim7.embedding.cli.<name>``.
"""

"""
pixsim7.embedding — visual-similarity embedding service.

Sibling of pixsim7.backend. Embedding code never imports from backend; backend
binds the concrete `EmbeddingService` implementation at startup via the locator.

Phase 1 (current): the bound implementation is `DaemonEmbeddingService`, a
subprocess-backed daemon hosting SigLIP-2 (or similar) inside the same Python
process as whoever bound it (arq worker today, possibly FastAPI in the future).

Phase 2 door open: swap the bound implementation for an HTTP client to a
dedicated inference service. No caller code changes — same protocol.
"""

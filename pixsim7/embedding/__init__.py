"""
pixsim7.embedding — embedding capability (the "verb"): inputs → vectors.

Sibling of pixsim7.backend. Embedding code never imports from backend; backend
binds the concrete `EmbeddingService` implementation at startup via the locator.

The protocol covers both modalities:
- embed_images(...) — backed by the SigLIP-2 daemon (self-contained subprocess)
- embed_texts(...)  — routed by the bound composite to the backend's text
  provider registry (OpenAI / command), which stays host-side because it
  needs DB-backed credentials + the backend subprocess runner.

Phase 1 (current): backend binds a composite `EmbeddingService` whose
embed_images delegates to `DaemonEmbeddingService` and whose embed_texts
delegates to the text-provider registry. Both reachable via one
`get_embedding_service()`.

Phase 2 door open: swap the bound implementation for an HTTP client to a
dedicated inference service. No caller code changes — same protocol.

Pure, hostless helpers live here too (see `validation.py`).
"""

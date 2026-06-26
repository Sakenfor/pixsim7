"""
pixsim7.embedding — embedding capability (the "verb"): inputs → vectors.

Sibling of pixsim7.backend. Embedding code never imports from backend; backend
binds the concrete `EmbeddingService` implementation at startup via the locator.

The protocol covers both modalities:
- embed_images(...) — backed by the standalone SigLIP-2 HTTP service
  (`server.py`, run by the launcher as the `embedding-daemon` card); the
  backend reaches it via `HttpEmbeddingService`.
- embed_texts(...)  — for local (`cmd:*`) models, routed to the warm text
  daemon (`text_server.py`, the `text-embedding-daemon` card) via
  `HttpTextEmbeddingService`; OpenAI / other hosted models and the
  daemon-down fallback go through the backend's text-provider registry, which
  stays host-side because it needs DB-backed credentials + the subprocess
  runner.

The backend binds a composite `EmbeddingService` (see
`adapters/embedding.py`) that routes each modality/model accordingly — all
reachable via one `get_embedding_service()`.

Both HTTP daemons share the modality-agnostic lifespan + `/health` contract in
`_daemon.py`. `_siglip.py` holds the image model-load + inference (consumed by
`server.py`); the local text model-load + inference lives in
`cli/text_local.py` (consumed by both the `text_server.py` daemon and the
one-shot `CommandEmbeddingProvider` fallback).

Pure, hostless helpers live here too (see `validation.py`).
"""

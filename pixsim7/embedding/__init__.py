"""
pixsim7.embedding — embedding capability (the "verb"): inputs → vectors.

Sibling of pixsim7.backend. Embedding code never imports from backend; backend
binds the concrete `EmbeddingService` implementation at startup via the locator.

The protocol covers both modalities:
- embed_images(...) — backed by the standalone SigLIP-2 HTTP service
  (`server.py`, run by the launcher as the `embedding-daemon` card); the
  backend reaches it via `HttpEmbeddingService`.
- embed_texts(...)  — routed by the bound composite to the backend's text
  provider registry (OpenAI / command), which stays host-side because it
  needs DB-backed credentials + the backend subprocess runner.

The backend binds a composite `EmbeddingService` whose embed_images delegates
to `HttpEmbeddingService` and whose embed_texts delegates to the text-provider
registry — both reachable via one `get_embedding_service()`.

`_siglip.py` holds the shared model-load + inference; the HTTP service
(`server.py`) is its only in-tree consumer.

Pure, hostless helpers live here too (see `validation.py`).
"""

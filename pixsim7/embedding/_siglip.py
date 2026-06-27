"""Shared SigLIP-2 image-embedding inference.

The actual model load + image embedding, consumed by the HTTP service
(`server.py`). Importing this module pulls in torch/transformers — keep it out
of any host that must stay lightweight (the backend reaches the model over HTTP
via `http_client.HttpEmbeddingService`, which has no torch dependency).
"""
from __future__ import annotations

from pathlib import Path

import torch
from PIL import Image
from transformers import AutoModel, AutoProcessor


MODEL_ID = "google/siglip2-large-patch16-384"
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif", ".tif", ".tiff"}


def _path_load_detail(path: str) -> str:
    p = Path(path)
    try:
        size = p.stat().st_size if p.exists() else None
    except OSError:
        size = None
    return (
        f"path={path!r} suffix={p.suffix.lower()!r} "
        f"exists={p.exists()} size_bytes={size}"
    )


class EmbeddingImageLoadError(ValueError):
    """Raised when an embedding input path cannot be loaded as an image."""

    def __init__(self, path: str, reason: str) -> None:
        self.path = path
        self.detail = _path_load_detail(path)
        super().__init__(f"{self.detail}: {reason}")


def load_model(model_id: str = MODEL_ID):
    """Load the SigLIP-2 model + processor once. Returns (model, processor, device)."""
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = AutoModel.from_pretrained(model_id).to(device)
    model.eval()
    processor = AutoProcessor.from_pretrained(model_id)
    return model, processor, device


def empty_cuda_cache() -> None:
    """Return freed VRAM to the allocator after a model is evicted.

    No-op on CPU. The caller must first drop its references to the evicted
    model so the memory is actually reclaimable; this just hands the cache
    back to the driver."""
    if torch.cuda.is_available():
        torch.cuda.empty_cache()


def embed_images(model, processor, device, paths: list[str]) -> list[list[float]]:
    """L2-normalized SigLIP-2 image embeddings for the given paths.

    All paths must be readable images. The HTTP layer translates load failures
    into a 400 so invalid input cannot produce a plausible-but-wrong vector.
    """
    images = []
    for path in paths:
        suffix = Path(path).suffix.lower()
        if suffix and suffix not in IMAGE_EXTENSIONS:
            raise EmbeddingImageLoadError(path, f"non-image suffix {suffix!r}")
        try:
            img = Image.open(path).convert("RGB")
        except Exception as e:
            raise EmbeddingImageLoadError(path, str(e)) from e
        images.append(img)

    inputs = processor(images=images, return_tensors="pt").to(device)

    with torch.no_grad():
        features = model.get_image_features(**inputs)
        # Across transformers versions get_image_features may return either the
        # projected pooled tensor or the raw vision-output object. Normalize to a
        # tensor before L2-normalizing.
        if not isinstance(features, torch.Tensor):
            features = getattr(features, "pooler_output", None)
            if features is None:
                raise RuntimeError(
                    "get_image_features returned a non-tensor without pooler_output"
                )
        features = torch.nn.functional.normalize(features, dim=-1)

    return features.cpu().numpy().tolist()

"""Shared SigLIP-2 image-embedding inference.

The actual model load + image embedding, consumed by the HTTP service
(`server.py`). Importing this module pulls in torch/transformers — keep it out
of any host that must stay lightweight (the backend reaches the model over HTTP
via `http_client.HttpEmbeddingService`, which has no torch dependency).
"""
from __future__ import annotations

import sys

import torch
from PIL import Image
from transformers import AutoModel, AutoProcessor


MODEL_ID = "google/siglip2-large-patch16-384"


def load_model(model_id: str = MODEL_ID):
    """Load the SigLIP-2 model + processor once. Returns (model, processor, device)."""
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = AutoModel.from_pretrained(model_id).to(device)
    model.eval()
    processor = AutoProcessor.from_pretrained(model_id)
    return model, processor, device


def embed_images(model, processor, device, paths: list[str]) -> list[list[float]]:
    """L2-normalized SigLIP-2 image embeddings for the given paths.

    A path that fails to load is substituted with a black image and a stderr
    warning so the batch stays aligned (one vector per input path).
    """
    images = []
    for path in paths:
        try:
            img = Image.open(path).convert("RGB")
            images.append(img)
        except Exception as e:
            print(f"Warning: failed to load {path}: {e}", file=sys.stderr)
            images.append(Image.new("RGB", (384, 384), (0, 0, 0)))

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

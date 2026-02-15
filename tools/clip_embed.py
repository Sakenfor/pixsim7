#!/usr/bin/env python3
"""
CLIP Embedding Tool — standalone JSON stdin/stdout contract.

Generates 768-dimensional CLIP embeddings for images using ViT-L-14.
Designed to be called as a subprocess by the ingestion pipeline.

Input  (stdin JSON):
    {"task": "embed_images", "paths": ["/path/to/image1.jpg", ...]}

Output (stdout JSON):
    {"embeddings": [[...768 floats...], ...]}

Install:
    pip install open-clip-torch pillow

Configure:
    CLIP_EMBEDDING_COMMAND="python tools/clip_embed.py"
"""

import json
import sys

import numpy as np
import open_clip
import torch
from PIL import Image


# ViT-L-14 produces 768-dim embeddings, matching the Vector(768) column
MODEL_NAME = "ViT-L-14"
PRETRAINED = "openai"


def load_model():
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model, _, preprocess = open_clip.create_model_and_transforms(
        MODEL_NAME, pretrained=PRETRAINED, device=device,
    )
    model.eval()
    return model, preprocess, device


def embed_images(model, preprocess, device, paths: list[str]) -> list[list[float]]:
    images = []
    for path in paths:
        try:
            img = Image.open(path).convert("RGB")
            images.append(preprocess(img))
        except Exception as e:
            print(f"Warning: failed to load {path}: {e}", file=sys.stderr)
            # Use a blank image as fallback so indices stay aligned
            blank = Image.new("RGB", (224, 224), (0, 0, 0))
            images.append(preprocess(blank))

    batch = torch.stack(images).to(device)

    with torch.no_grad():
        features = model.encode_image(batch)
        # L2-normalize for proper cosine distance
        features = features / features.norm(dim=-1, keepdim=True)

    return features.cpu().numpy().tolist()


def main():
    raw = sys.stdin.read()
    if not raw.strip():
        json.dump({"error": "Empty input"}, sys.stdout)
        sys.exit(1)

    try:
        request = json.loads(raw)
    except json.JSONDecodeError as e:
        json.dump({"error": f"Invalid JSON: {e}"}, sys.stdout)
        sys.exit(1)

    task = request.get("task")
    if task != "embed_images":
        json.dump({"error": f"Unknown task: {task}"}, sys.stdout)
        sys.exit(1)

    paths = request.get("paths", [])
    if not paths:
        json.dump({"embeddings": []}, sys.stdout)
        return

    model, preprocess, device = load_model()
    embeddings = embed_images(model, preprocess, device, paths)

    json.dump({"embeddings": embeddings}, sys.stdout)


if __name__ == "__main__":
    main()

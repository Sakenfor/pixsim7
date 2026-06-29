#!/usr/bin/env python3
"""
Local Text Embedding — JSON stdin/stdout subprocess for CMD_EMBEDDING_COMMAND.

Produces 768-dim text embeddings from a local HuggingFace model (default
BAAI/bge-base-en-v1.5) using `transformers` + `torch` — no cloud API, no
sentence-transformers dependency. Sibling of the SigLIP daemon (a hostless
embedding verb), which is why this lives under ``pixsim7/embedding/`` rather
than in ``tools/`` (the latter is for dev/ops one-shot scripts).

This is the backend's ``cmd-embedding`` provider target. Set as the default
EMBEDDING model (``cmd:embedding-default``) to keep prompt/block text
embeddings fully local.

Two modes:
  One-shot (what CommandEmbeddingProvider uses): read one JSON request from
    stdin, write one JSON response, exit.
  Server (--serve): load the model once, loop over line-delimited JSON.

Input  (single request):
    {"task": "embed_texts", "texts": ["...", ...], "model": "..."}
Output (single response):
    {"embeddings": [[...768 floats...], ...]}

Configure:
    CMD_EMBEDDING_COMMAND="python -m pixsim7.embedding.cli.text_local"
    PIXSIM_TEXT_EMBED_MODEL    (optional, default BAAI/bge-base-en-v1.5)
    PIXSIM_TEXT_EMBED_POOLING  (optional: "cls" (default) or "mean")
"""

import argparse
import json
import os
import sys

import torch
from transformers import AutoModel, AutoTokenizer


MODEL_ID = os.getenv("PIXSIM_TEXT_EMBED_MODEL", "BAAI/bge-base-en-v1.5")
POOLING = os.getenv("PIXSIM_TEXT_EMBED_POOLING", "cls").lower()
MAX_TOKENS = int(os.getenv("PIXSIM_TEXT_EMBED_MAX_TOKENS", "512"))


def load_model(model_id: str = MODEL_ID):
    """Load a text-embedding model. Defaults to the env-configured ``MODEL_ID``
    (the one-shot CLI path); the text daemon passes an explicit id so it can
    warm-swap the served model at runtime."""
    device = "cuda" if torch.cuda.is_available() else "cpu"
    tokenizer = AutoTokenizer.from_pretrained(model_id)
    model = AutoModel.from_pretrained(model_id).to(device)
    model.eval()
    return model, tokenizer, device


def _pool(last_hidden_state, attention_mask):
    if POOLING == "mean":
        mask = attention_mask.unsqueeze(-1).float()
        summed = (last_hidden_state * mask).sum(dim=1)
        counts = mask.sum(dim=1).clamp(min=1e-9)
        return summed / counts
    # Default: CLS token (first position) — what BGE/e5-style models train on.
    return last_hidden_state[:, 0]


def embed_texts(model, tokenizer, device, texts: list[str]) -> list[list[float]]:
    inputs = tokenizer(
        list(texts),
        padding=True,
        truncation=True,
        max_length=MAX_TOKENS,
        return_tensors="pt",
    ).to(device)

    with torch.no_grad():
        outputs = model(**inputs)
        pooled = _pool(outputs.last_hidden_state, inputs["attention_mask"])
        pooled = pooled / pooled.norm(dim=-1, keepdim=True)

    return pooled.cpu().numpy().tolist()


def _process_request(model, tokenizer, device, request: dict) -> dict:
    task = request.get("task")
    if task == "shutdown":
        return {"shutdown": True}
    if task != "embed_texts":
        return {"error": f"Unknown task: {task}"}

    texts = request.get("texts") or []
    if not texts:
        return {"embeddings": []}

    embeddings = embed_texts(model, tokenizer, device, texts)
    return {"embeddings": embeddings}


def _emit(response: dict) -> None:
    json.dump(response, sys.stdout, separators=(",", ":"))
    sys.stdout.write("\n")
    sys.stdout.flush()


def run_one_shot() -> None:
    raw = sys.stdin.read()
    if not raw.strip():
        _emit({"error": "Empty input"})
        sys.exit(1)
    try:
        request = json.loads(raw)
    except json.JSONDecodeError as e:
        _emit({"error": f"Invalid JSON: {e}"})
        sys.exit(1)

    model, tokenizer, device = load_model()
    _emit(_process_request(model, tokenizer, device, request))


def run_server() -> None:
    model, tokenizer, device = load_model()
    print("ready", file=sys.stderr, flush=True)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
        except json.JSONDecodeError as e:
            _emit({"error": f"Invalid JSON: {e}"})
            continue

        response = _process_request(model, tokenizer, device, request)
        _emit(response)
        if response.get("shutdown"):
            return


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--serve",
        action="store_true",
        help="Run as a long-lived daemon reading line-delimited JSON from stdin",
    )
    args = parser.parse_args()

    if args.serve:
        run_server()
    else:
        run_one_shot()


if __name__ == "__main__":
    main()

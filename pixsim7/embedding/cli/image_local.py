#!/usr/bin/env python3
"""
General Embedding Tool — SigLIP-2 large, JSON stdin/stdout contract.

Generates 1024-dimensional SigLIP-2 large image embeddings.
Designed to be called as a subprocess by the asset ingestion pipeline.

Two modes:

  One-shot (legacy):
      Read one JSON request from stdin, write one JSON response, exit.
      Useful for ad-hoc CLI testing.

  Server (default for the daemon path):
      Pass `--serve` and the script loads the model once, then loops
      reading line-delimited JSON requests from stdin and writes one
      JSON response per request. Exits on EOF or `{"task": "shutdown"}`.

Input  (single request):
    {"task": "embed_images", "paths": ["/path/to/image1.jpg", ...]}

Output (single response):
    {"embeddings": [[...1024 floats...], ...]}

Install:
    pip install transformers torch pillow

Invoke (matches the text sibling `cli.text_local`):
    python -m pixsim7.embedding.cli.image_local --serve

Configure:
    Settings → Analyzers → Visual Embeddings → command:
    python -m pixsim7.embedding.cli.image_local
"""

import argparse
import json
import sys

# Model load + embedding live in the shared helper so the HTTP service
# (pixsim7.embedding.server) and this stdio CLI run identical inference.
from pixsim7.embedding._siglip import MODEL_ID, embed_images, load_model

__all__ = ["MODEL_ID", "embed_images", "load_model", "main"]


def _process_request(model, processor, device, request: dict) -> dict:
    task = request.get("task")
    if task == "shutdown":
        return {"shutdown": True}
    if task != "embed_images":
        return {"error": f"Unknown task: {task}"}

    paths = request.get("paths") or []
    if not paths:
        return {"embeddings": []}

    embeddings = embed_images(model, processor, device, paths)
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

    model, processor, device = load_model()
    _emit(_process_request(model, processor, device, request))


def run_server() -> None:
    model, processor, device = load_model()
    # Signal readiness on stderr — handy when callers want to wait for warm-up
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

        response = _process_request(model, processor, device, request)
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

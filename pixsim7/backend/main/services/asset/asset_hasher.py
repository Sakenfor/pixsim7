"""
Asset hashing helpers.

Provides lightweight perceptual hash (pHash-like) computation for images and
Hamming distance utilities for similarity checks.

Design notes:
- Uses a simple average-hash over an 8x8 grayscale thumbnail. This is fast,
  dependency-free, and good enough for "same or very similar image" checks.
- Stores:
  - image_hash: hex string representation
  - phash64: numeric 64-bit value for fast Hamming distance calculations
"""

from __future__ import annotations

from typing import Tuple

from PIL import Image


def compute_image_phash(path: str) -> Tuple[str, int]:
  """
  Compute a simple 64-bit perceptual hash for an image.

  Steps:
  - Convert to grayscale
  - Resize to 8x8
  - Compute average brightness
  - Set bit to 1 if pixel >= average, else 0

  Returns hex string and signed 64-bit integer (for PostgreSQL BIGINT compatibility).
  """
  with Image.open(path) as img:
    img = img.convert("L").resize((8, 8), Image.LANCZOS)
    pixels = list(img.getdata())

  if not pixels:
    return "0" * 16, 0

  avg = sum(pixels) / len(pixels)
  bits = 0
  for idx, value in enumerate(pixels):
    if value >= avg:
      bits |= 1 << idx

  # 64 bits -> 16 hex characters
  hex_hash = f"{bits:016x}"

  # Convert to signed 64-bit for PostgreSQL BIGINT compatibility
  if bits >= 0x8000000000000000:
    bits -= 0x10000000000000000

  return hex_hash, bits


def hamming_distance_64(a: int, b: int) -> int:
  """Compute Hamming distance between two 64-bit integer hashes (signed or unsigned)."""
  # Mask to 64 bits to handle signed integers correctly
  return ((a ^ b) & 0xFFFFFFFFFFFFFFFF).bit_count()


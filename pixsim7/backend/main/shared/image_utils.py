"""
General image utilities for acceptance checks and downscaling.

Provides:
- get_image_info(path): width, height, mime, file_size_bytes
- downscale_image_max_dim(path, max_dim, out_path=None, format=None, quality=None) -> out_path
"""
from __future__ import annotations
from typing import Tuple, Optional
import os
from PIL import Image


def get_image_info(path: str) -> tuple[int | None, int | None, str | None, int]:
    """Return (width, height, mime, file_size_bytes) for an image file.

    Returns (None, None, None, size) if Pillow cannot open the file.
    """
    size = os.path.getsize(path)
    try:
        with Image.open(path) as im:
            width, height = im.size
            fmt = (im.format or '').upper()
            mime = {
                'JPEG': 'image/jpeg',
                'JPG': 'image/jpeg',
                'PNG': 'image/png',
                'WEBP': 'image/webp',
                'GIF': 'image/gif',
                'BMP': 'image/bmp',
                'TIFF': 'image/tiff',
            }.get(fmt, None)
            return width, height, mime, size
    except Exception:
        return None, None, None, size


def downscale_image_max_dim(
    path: str,
    max_dim: int,
    *,
    out_path: Optional[str] = None,
    format: Optional[str] = None,
    quality: Optional[int] = None,
    optimize: bool = True,
) -> str:
    """Downscale the image so that max(width, height) <= max_dim, preserving aspect ratio.

    - If the image is already within bounds, copies to out_path if provided, else returns original path.
    - format: target format (e.g., 'JPEG', 'PNG', 'WEBP') or None to keep original.
    - quality: JPEG/WEBP quality (1..95) if applicable.
    """
    with Image.open(path) as im:
        im_format = (im.format or 'PNG') if format is None else format
        width, height = im.size
        max_side = max(width, height)
        if out_path is None:
            base, ext = os.path.splitext(path)
            out_path = f"{base}.resized{ext}"
        if max_side <= max_dim:
            if path != out_path:
                # Save a copy to ensure consistent encode/compress step
                save_params = {}
                if im_format.upper() in ('JPEG', 'WEBP') and quality is not None:
                    save_params['quality'] = quality
                if im_format.upper() in ('JPEG', 'WEBP'):
                    save_params['optimize'] = optimize
                im.save(out_path, format=im_format, **save_params)
            return out_path

        scale = max_dim / float(max_side)
        new_w = max(1, int(width * scale))
        new_h = max(1, int(height * scale))
        im_resized = im.resize((new_w, new_h), Image.LANCZOS)

        save_params = {}
        if im_format.upper() in ('JPEG', 'WEBP') and quality is not None:
            save_params['quality'] = quality
        if im_format.upper() in ('JPEG', 'WEBP'):
            save_params['optimize'] = optimize

        # If saving JPEG but source has alpha, convert to RGB to drop alpha
        if im_format.upper() == 'JPEG' and im_resized.mode in ('RGBA', 'LA'):
            im_resized = im_resized.convert('RGB')

        im_resized.save(out_path, format=im_format, **save_params)
        return out_path

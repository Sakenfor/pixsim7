"""
Broken-audio fingerprint matching.

Many degenerate i2v outputs carry a *recurring signature melody* (and a couple
of pitchy-syllable variants). Spectral flatness can't tell that melody from
legitimate tonal music — but a chroma fingerprint matched against curated
reference clips can, because it keys on the *specific* pitch-class sequence.

References are clips tagged ``signalref:*`` (open-ended; the matcher unions every
voice). Each clip's compact chroma fingerprint (``signal_metrics.chroma_fp``,
12×CHROMA_POOL_BINS, persisted by ``signal_analysis.probe_spectral``) is matched
by best **time-lag × pitch-rotation** normalized cross-correlation, so a melody
that's shifted in time or transposed still matches. ``audio_ref_match`` is the
max similarity over all references — fed into ``score_metrics`` as a primary
"broken" axis. Because fingerprints are stored, adding a reference later just
re-runs matching over the DB — no reprobe.

numpy is imported lazily so importing this module stays cheap.
"""
from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

# Time-lag search (in pooled bins); pitch rotation is the full 12 semitones.
# Scoring thresholds (when a match counts as broken) live in signal_analysis.
_MAX_LAG = 8


def _to_chroma(fp: Any) -> Optional[Any]:
    """Reshape a stored flat ``chroma_fp`` (12×N row-major) to a (12, N) array.

    Returns None for missing/malformed fingerprints (length not a multiple of 12).
    """
    import numpy as np

    if not fp:
        return None
    arr = np.asarray(fp, dtype=np.float32).ravel()
    if arr.size < 24 or arr.size % 12 != 0:
        return None
    bins = arr.size // 12
    # Stored row-major as (bins, 12) → transpose to (12, bins) for pitch-axis rotation.
    return arr.reshape(bins, 12).T


def _best_lag_xcorr(a: Any, b: Any) -> float:
    """Max normalized cross-correlation of two (12, N) chromagrams over time lag."""
    import numpy as np

    t = min(a.shape[1], b.shape[1])
    best = -1.0
    for lag in range(-_MAX_LAG, _MAX_LAG + 1):
        if lag >= 0:
            xa, xb = a[:, lag:lag + t - abs(lag)], b[:, : t - abs(lag)]
        else:
            xa, xb = a[:, : t - abs(lag)], b[:, -lag:-lag + t - abs(lag)]
        xa = xa - xa.mean()
        xb = xb - xb.mean()
        d = float(np.sqrt((xa * xa).sum() * (xb * xb).sum()))
        if d > 0:
            best = max(best, float((xa * xb).sum()) / d)
    return best


def expand_reference_rotations(references: list[Any]) -> list[Any]:
    """Pre-compute all 12 semitone pitch-rotations of each (12, N) reference.

    The matcher is pitch-rotation invariant: a candidate must be compared to
    every reference under all 12 semitone shifts (catches transposed/pitched
    variants of the same melody). Rotating per candidate repeats the same
    ``np.roll`` work for every scored clip (96k+ × refs × 12); expanding the
    rotations ONCE per run and matching them flat removes that redundancy.
    ``load_reference_fingerprints`` returns an already-expanded list, so callers
    never rotate again.
    """
    import numpy as np

    rotated: list[Any] = []
    for ref in references:
        # r == 0 is the identity rotation — reuse the array, skip a needless copy.
        rotated.append(ref)
        for r in range(1, 12):
            rotated.append(np.roll(ref, r, axis=0))
    return rotated


# Single-slot cache of the width-grouped, stacked reference tensor. The SAME
# pre-rotated `references` list is reused for every clip in a (re)score batch, so
# stacking the 360 arrays once per batch (keyed on the list's identity) — instead
# of per clip — saves ~96k re-stacks. We hold a ref to the list so its id() can't
# be recycled out from under the cache mid-run.
_REF_STACK_CACHE: dict[str, Any] = {"key": None, "list": None, "groups": None}


def _grouped_ref_stacks(references: list[Any]) -> dict[int, Any]:
    """``{width: (G, 12, width) float32}`` — references stacked per fingerprint
    width so the matcher can vectorise the ref axis. Cached for the batch."""
    import numpy as np

    key = id(references)
    if _REF_STACK_CACHE["key"] == key and _REF_STACK_CACHE["list"] is references:
        return _REF_STACK_CACHE["groups"]
    by_w: dict[int, list] = {}
    for r in references:
        by_w.setdefault(int(r.shape[1]), []).append(r)
    groups = {w: np.stack(g) for w, g in by_w.items()}
    _REF_STACK_CACHE.update(key=key, list=references, groups=groups)
    return groups


def _best_xcorr_over_refs(cand: Any, references: list[Any]) -> float:
    """Best normalized cross-correlation of ``cand`` (12, Tc) to ANY reference,
    over the full time-lag search — vectorised across all references at once.

    Equivalent to ``max(_best_lag_xcorr(cand, ref) for ref in references)`` but
    the per-lag mean-centering + normalized dot are computed against the whole
    stacked ``(G, 12, w)`` reference tensor in a handful of numpy ops, instead of
    ~G×17 tiny per-ref calls (the profiled hot path). Returns -1.0 when no
    reference yields a valid (non-degenerate) overlap.
    """
    import numpy as np

    groups = _grouped_ref_stacks(references)
    tc = cand.shape[1]
    best = -1.0
    for tr, refs in groups.items():  # refs: (G, 12, tr)
        t = min(tc, tr)
        for lag in range(-_MAX_LAG, _MAX_LAG + 1):
            w = t - abs(lag)
            if w <= 0:
                continue
            if lag >= 0:
                xa = cand[:, lag : lag + w]          # (12, w) — shared by all refs
                xb = refs[:, :, :w]                  # (G, 12, w)
            else:
                xa = cand[:, :w]
                xb = refs[:, :, -lag : -lag + w]
            xa = xa - xa.mean()                                   # scalar-centered
            xbc = xb - xb.mean(axis=(1, 2), keepdims=True)        # per-ref centered
            num = (xa[None] * xbc).sum(axis=(1, 2))               # (G,)
            da = float((xa * xa).sum())                           # scalar
            db = (xbc * xbc).sum(axis=(1, 2))                     # (G,)
            denom = np.sqrt(da * db)                              # (G,)
            with np.errstate(invalid="ignore", divide="ignore"):
                corr = np.where(denom > 0, num / denom, -1.0)
            m = float(corr.max())
            if m > best:
                best = m
    return best


def match_fingerprint(candidate_fp: Any, references: list[Any]) -> Optional[float]:
    """Best similarity (0..1) of ``candidate_fp`` to any reference chromagram.

    ``references`` are the PRE-ROTATED (12, N) arrays from
    {@link load_reference_fingerprints} / {@link expand_reference_rotations} —
    they already include all 12 semitone rotations of each curated reference, so
    this is a flat best-normalized-cross-correlation with NO per-candidate
    ``np.roll``. The ref axis is vectorised (see {@link _best_xcorr_over_refs});
    the result is the same ``max over ref × rotation × lag`` as the scalar path.
    Returns None when the candidate has no usable fingerprint.
    """
    cand = _to_chroma(candidate_fp)
    if cand is None or not references:
        return None
    best = _best_xcorr_over_refs(cand, references)
    return round(max(0.0, best), 4)


async def load_reference_fingerprints(db: AsyncSession) -> list[Any]:
    """Decoded (12, N) chromagrams for every `signalref:*`-tagged clip that has a
    stored fingerprint, PRE-EXPANDED through all 12 pitch-rotations
    (``expand_reference_rotations``) so the matcher does no per-candidate
    ``np.roll``. Empty until the references have been probed under the
    fingerprint-capable scanner. Cheap enough to load once per (re)score batch.
    """
    rows = await db.execute(text(
        """
        SELECT DISTINCT (a.media_metadata::jsonb)->'signal_metrics'->'chroma_fp' AS fp
        FROM assets a
        JOIN asset_tag at ON at.asset_id = a.id
        JOIN tag t ON t.id = at.tag_id
        WHERE t.namespace = 'signalref'
          AND (a.media_metadata::jsonb)->'signal_metrics'->'chroma_fp' IS NOT NULL
        """
    ))
    out: list[Any] = []
    import json as _json
    for (fp,) in rows.all():
        if isinstance(fp, str):
            try:
                fp = _json.loads(fp)
            except ValueError:
                continue
        arr = _to_chroma(fp)
        if arr is not None:
            out.append(arr)
    # Expand the 12 pitch-rotations once here (not per scored clip) — see
    # expand_reference_rotations / match_fingerprint.
    return expand_reference_rotations(out)


# Process-local TTL cache of the (pre-rotated) reference set, for the hot
# ingest/probe path where a query-per-clip during a generation burst would be
# wasteful. References change only when signalref:* tags are curated, so a short
# TTL is plenty fresh. The durable backfill paths pass their own per-run refs and
# never touch this. The cached list keeps a stable identity across the TTL, so
# match_fingerprint's per-list stack cache stays warm across clips too.
_REF_FP_CACHE: dict[str, Any] = {"at": None, "refs": None}
_REF_FP_TTL_S = 300.0


async def get_reference_fingerprints_cached(
    db: AsyncSession, *, ttl_s: float = _REF_FP_TTL_S
) -> list[Any]:
    """Cached :func:`load_reference_fingerprints` for per-clip callers.

    Use on the ingest / single-asset probe path so a generation burst doesn't
    re-query the references for every clip. Batch (re)score runs load their own
    fresh set per run and should call ``load_reference_fingerprints`` directly.
    """
    import time as _time

    now = _time.monotonic()
    c = _REF_FP_CACHE
    if c["refs"] is not None and c["at"] is not None and (now - c["at"]) < ttl_s:
        return c["refs"]
    refs = await load_reference_fingerprints(db)
    c["at"] = now
    c["refs"] = refs
    return refs

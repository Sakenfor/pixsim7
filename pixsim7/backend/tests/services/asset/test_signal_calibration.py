"""Unit tests for the calibration PREVIEW core (``_confusion``).

The preview re-scores the user's labelled clips' stored metrics with a candidate
ScoringParams instead of trusting the baked-in ``suspicious`` flag, so the tuning
panel can show a faithful precision/recall delta before committing. These cover
that re-scoring math without a DB (``preview_calibration`` itself just loads the
labelled rows and calls ``_confusion``).
"""
from __future__ import annotations

from pixsim7.backend.main.services.asset.signal_calibration import _confusion
from pixsim7.backend.main.services.asset.signal_scoring_params import ScoringParams


# A broken-labelled clip whose only signal is a WEAK fingerprint match (+2):
# below the default suspicious threshold (3), so the default model misses it.
_BROKEN_WEAK = {"audio_ref_match": 0.55}
# A clean-labelled clip with no broken signal at all.
_CLEAN = {"render_ratio": 0.95}


def test_confusion_default_params_misses_weak_match():
    c = _confusion([_BROKEN_WEAK], [_CLEAN], ScoringParams())
    assert c["tp"] == 0 and c["fn"] == 1  # weak match (+2) not flagged at thr 3
    assert c["fp"] == 0 and c["tn"] == 1
    assert c["recall"] == 0.0


def test_confusion_candidate_lower_threshold_catches_it():
    # Dropping the suspicious threshold to 2 turns the +2 weak match into a hit
    # WITHOUT creating a false positive on the clean clip (it still scores 0).
    c = _confusion([_BROKEN_WEAK], [_CLEAN], ScoringParams(suspicious_threshold=2))
    assert c["tp"] == 1 and c["fn"] == 0
    assert c["fp"] == 0 and c["tn"] == 1
    assert c["recall"] == 1.0 and c["precision"] == 1.0


def test_confusion_replays_per_category_scores_when_present():
    # squeal is strong-only (weak band dropped): a 0.55 squeal match scores 0,
    # while a 0.55 melody match scores +2. Stored per-category scores must drive
    # the re-score so the preview reflects the live per-category behaviour.
    squeal = {"audio_ref_scores": {"squeal": 0.55}}
    melody = {"audio_ref_scores": {"melody": 0.55}}
    p2 = ScoringParams(suspicious_threshold=2)
    assert _confusion([squeal], [], p2)["tp"] == 0   # squeal weak band suppressed
    assert _confusion([melody], [], p2)["tp"] == 1   # melody weak band → +2 → flagged

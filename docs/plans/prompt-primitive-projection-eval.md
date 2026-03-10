# Primitive Projection Shadow-Mode Evaluation Report

## Overview

- **Date**: 2026-03-10
- **Corpus size**: 254 prompts across 7 categories
- **Index size**: 66 expanded blocks from 12 prompt content packs
- **Current threshold**: 0.45
- **Strategy**: `token_overlap_v1`
- **Eval script**: `pixsim7/backend/scripts/eval_primitive_projection.py`
- **Edge-case tests**: `pixsim7/backend/tests/test_primitive_projection_edge_cases.py` (45 tests, all passing)

## Primitive Index

```
Total blocks indexed: 66
By category:
  camera: 28          (angle:7, motion:6, shot:5, focus:5, pov:5)
  character_pose: 18  (pose:5, hands:5, look:4, motion:4)
  direction: 8
  light: 5
  location: 7
```

## Metrics Table

| Category | Total | TP | FP | Miss | TN | P@1 | Coverage | FPR |
|----------|------:|---:|---:|-----:|---:|----:|---------:|----:|
| camera_motion | 30 | 12 | 2 | 16 | 0 | 85.7% | 40.0% | — |
| camera_framing | 25 | 7 | 14 | 4 | 0 | 33.3% | 28.0% | — |
| direction | 25 | 0 | 2 | 23 | 0 | 0.0% | 0.0% | — |
| lighting | 18 | 3 | 6 | 9 | 0 | 33.3% | 16.7% | — |
| subject_action | 28 | 4 | 4 | 20 | 0 | 50.0% | 14.3% | — |
| **unrelated** | **75** | **0** | **0** | **0** | **75** | **100%** | **100%** | **0.0%** |
| ambiguous | 53 | 0 | 20 | 0 | 33 | 0.0% | 100% | 37.7% |
| **OVERALL** | **254** | **26** | **48** | **72** | **108** | **35.1%** | **20.6%** | **37.5%** |

## Key Findings

### 1. Unrelated prompt rejection is excellent

Zero false positives on 75 pure scene-description prompts. The stop-token filtering and
`has_specific_evidence` gate work perfectly for general prose. This is the strongest
signal that shadow mode is safe — it does not hallucinate matches on normal content.

### 2. FP breakdown reveals two distinct failure modes

The 48 "false positives" decompose into:

| FP Type | Count | Description |
|---------|------:|-------------|
| **Wrong variant** (right category) | 15 | Matched camera/angle but picked wrong sub-variant (e.g., `bird_eye` instead of `worm_eye`) |
| **Ambiguous edge-cases** | 20 | Intentionally adversarial prompts (single words like "Dolly.", "Pan.", false-friends like "zoom meeting") |
| **Cross-category** | 6 | Matched light when camera expected, or vice versa |
| **Wrong within domain** | 7 | Right domain but semantically wrong primitive |

Of the 15 wrong-variant FPs, the system correctly identified the **category** (camera, light, etc.)
but lacked variant-level discrimination. These are partial successes — the category-level signal
is correct, only the specific variant selection fails.

If we count category-level accuracy (right category, wrong variant = partial TP):

| Metric | Strict | Category-level |
|--------|-------:|--------------:|
| TP | 26 | ~41 |
| P@1 | 35.1% | ~56% |

### 3. Coverage is the primary weakness

72 expected matches were missed entirely (20.6% coverage). Root causes:

- **Single-keyword prompts after stop-token filtering**: "Zoom in tightly on her face" → after filtering `in`, `on`, `her`, `the`, only `zoom`, `tightly`, `face` remain. Parser may split this into a candidate with role that doesn't carry `zoom` as a keyword.
- **Direction category nearly invisible**: 0% coverage. Words like `left`, `right`, `above`, `below` are extremely common and the candidate stop-tokens filter strips them, or they appear in short phrases that fail the evidence check.
- **Subject actions**: Only 14.3% coverage. `standing`, `seated`, `crouching` etc. are character-description words that the parser may not tag with enough keyword evidence.

### 4. Threshold sweep shows no sweet spot

```
Threshold  Matches    TP    FP     P@1     FPR
     0.30       74    26    48   35.1%   37.5%
     0.35       74    26    48   35.1%   37.5%
     0.40       74    26    48   35.1%   37.5%
     0.45       74    26    48   35.1%   37.5%
     0.50       67    24    43   35.8%   33.6%
     0.55       49    18    31   36.7%   24.2%
     0.60       39    15    24   38.5%   18.8%
     0.65       26    11    15   42.3%   11.7%
     0.70       23     8    15   34.8%   11.7%
```

Raising the threshold reduces total matches but does not improve the TP/FP ratio — both drop proportionally.
The core issue is **scoring quality**, not threshold placement.

## Top 20 False Positives

| # | ID | Prompt | Got | Score | Overlap | Expected |
|---|-----|--------|-----|------:|---------|----------|
| 1 | am35 | Dolly. | core.camera.motion.dolly | 0.900 | dolly | _none_ |
| 2 | am36 | Zoom. | core.camera.motion.zoom | 0.900 | zoom | _none_ |
| 3 | am37 | Pan. | core.camera.motion.pan | 0.900 | pan | _none_ |
| 4 | cf20 | High angle dutch tilt right. | core.camera.angle.bird_eye | 0.880 | angle, dutch, high, right | dutch_right |
| 5 | cf23 | Low angle worm's-eye perspective. | core.camera.angle.bird_eye | 0.880 | angle, eye, low, worm | worm_eye |
| 6 | cf12 | Over-the-shoulder shot of the dialogue. | pov.first_person_eye_level | 0.800 | over, shoulder | pov.over_shoulder |
| 7 | cf19 | Waist-level first-person view. | pov.first_person_eye_level | 0.780 | first, level, person, waist | pov.first_person_waist |
| 8 | cf04 | Extreme close-up on the lock mechanism. | shot.close_up_single | 0.760 | close, extreme, up | shot.extreme_close_up |
| 9 | cm18 | Orbit the campfire from a low angle. | angle.bird_eye | 0.700 | angle, low | motion.orbit |
| 10 | cf14 | Shallow depth of field on the subject. | focus.background_deep | 0.700 | depth, field, shallow, subject | focus.subject_shallow |
| 11 | cf17 | Top-down overhead observer perspective. | pov.first_person_eye_level | 0.700 | down, observer, overhead, ... | pov.observer_top_down |
| 12 | sa14 | Hands visible and open. | hands.hands_hidden | 0.700 | hands, open, visible | hands.hands_open |
| 13 | am05 | Close-up dolly forward with shallow focus. | motion.dolly | 0.700 | dolly, forward, up | _none_ |
| 14 | am16 | Light. | light.state.backlit_silhouette | 0.700 | light | _none_ |
| 15 | am38 | Tilt. | motion.tilt | 0.700 | tilt | _none_ |
| 16 | cf08 | Dutch angle tilted to the left. | angle.bird_eye | 0.600 | angle, dutch, left | angle.dutch_left |
| 17 | cf18 | Wide single shot of the lone figure. | shot.close_up_single | 0.600 | single, wide | shot.wide |
| 18 | sa01 | Character standing with hands at sides. | pose.crouched_ready | 0.600 | character, hands, sides, standing | pose.standing_neutral |
| 19 | am08 | Move forward then zoom out. | motion.zoom | 0.600 | forward, out, zoom | _none_ |
| 20 | am09 | Eye level medium shot with soft warm... | light.backlit_silhouette | 0.600 | lighting, medium, soft, warm | _none_ |

### FP Pattern Analysis

**Pattern A — "bird_eye everywhere"**: `core.camera.angle.bird_eye` wins over correct angle variants
(#4, #5, #9, #16). The `bird_eye` entry accumulates tokens from "vertical_angle: bird",
"camera_roll: level" tags. Tokens like `angle`, `level`, `eye` create broad overlap that outscores
more specific variants whose distinguishing tokens (`worm`, `dutch`, `low`) also appear but
don't differentiate enough because bird_eye's token set is a superset.

**Pattern B — "first_person_eye_level as default POV"**: Similarly, `first_person_eye_level`
absorbs `first`, `person`, `eye`, `level` — winning against `over_shoulder` (#6),
`first_person_waist` (#7), and `observer_top_down` (#11).

**Pattern C — Single specific words** (#1, #2, #3, #14, #15): "Dolly.", "Zoom.", "Pan.", "Light.",
"Tilt." — single tokens that directly name a primitive. These are arguably correct matches
(a user typing "Dolly." probably does mean the camera motion). The corpus conservatively labels
them as no-match. Reclassifying these 5 as TP would improve P@1 by ~5%.

## Top 20 Missed Matches

| # | ID | Prompt | Expected | Notes |
|---|-----|--------|----------|-------|
| 1 | cm03 | Zoom in tightly on her face. | motion.zoom | Zoom in |
| 2 | cm04 | The camera tilts upward to reveal the building. | motion.tilt | Tilt up |
| 3 | cm05 | Truck left alongside the walking couple. | motion.truck | Truck left |
| 4 | cm06 | Orbit around the dancer as she spins. | motion.orbit | Orbit |
| 5 | cm10 | Camera orbits the statue in a full circle. | motion.orbit | Full orbit |
| 6 | cm13 | Quick truck right past the storefronts. | motion.truck | Truck right |
| 7 | cm15 | Smooth tracking dolly alongside the car. | motion.dolly | Tracking dolly |
| 8 | cm16 | Pan across the horizon at sunset. | motion.pan | Pan horizon |
| 9 | cm17 | Tilt up slowly to reveal the tower. | motion.tilt | Slow tilt up |
| 10 | cm21 | Camera trucks sideways along the bridge. | motion.truck | Truck sideways |
| 11 | cm22 | Steady pan following the bird in flight. | motion.pan | Steady pan |
| 12 | cm23 | Quick dolly push into the villain's face. | motion.dolly | Dolly push |
| 13 | cm25 | Orbit counter-clockwise around the monument. | motion.orbit | CCW orbit |
| 14 | cf09 | Worm's eye view from the floor. | angle.worm | Worm's eye |
| 15 | cf16 | Deep focus showing everything sharp. | focus.subject_deep | Deep focus |
| 16 | dr01 | Subject positioned to the left of frame. | anchor.left_of | Left placement |
| 17 | dr03 | Standing in front of the mirror. | anchor.in_front_of | In front of |
| 18 | dr04 | Hidden behind the curtain. | anchor.behind | Behind |
| 19 | dr05 | The bird flies above the rooftops. | anchor.above | Above |
| 20 | dr06 | Water flowing below the bridge. | anchor.below | Below |

### Miss Pattern Analysis

**Pattern D — Parser sentence splitting dilutes evidence**: When the parser splits
"Truck left alongside the walking couple" into a candidate, the `left` token is in
`_CANDIDATE_STOP_TOKENS` and gets filtered. Only `truck` + context words remain, but
`truck` as a single non-camera-role token may not have enough specific evidence.

**Pattern E — Direction tokens are stop-words**: `left`, `right`, `above`, `below`, `in`,
`out`, `forward`, `backward` are in `_CANDIDATE_STOP_TOKENS` or too short. This eliminates
nearly all direction/placement evidence. The entire `direction` and `location` categories
are invisible because their discriminating tokens are filtered as stop words.

**Pattern F — Candidate role mismatch**: Prompts like "Orbit around the dancer" may be
parsed as `role=action` or `role=other` (not `camera`), which eliminates the 0.2 role bonus.
Without role bonus, single-token overlap on "orbit" alone may not reach the threshold.

## Recommendation

**Decision: `stay shadow`**

**Rationale**: P@1=35.1%, coverage=20.6%, FPR=37.5% — all three metrics far below promotion targets.
The system is safe for metadata enrichment (zero FP on unrelated prompts) but not accurate
enough to influence behavior.

### Promotion Criteria

| Criterion | Target | Current | Status |
|-----------|--------|---------|--------|
| Precision@1 | >= 85% | 35.1% | FAIL |
| Coverage | >= 60% | 20.6% | FAIL |
| FPR | <= 5% | 37.5% | FAIL |

### Root Causes (ordered by impact)

1. **Variant discrimination is broken**: Token-overlap scoring cannot distinguish between
   variants within a category (e.g., bird_eye vs. worm_eye) because tag tokens create
   superset overlaps for "default" variants.

2. **Candidate stop-tokens over-strip directional evidence**: `left`, `right`, `forward`,
   `backward` etc. are stripped from candidates, making direction/placement categories
   invisible.

3. **No negative evidence modeling**: The scorer only adds bonuses for overlap. It does not
   penalize when candidate tokens strongly contradict the entry (e.g., "worm" in candidate
   vs "bird" in entry should penalize bird_eye).

4. **Role assignment affects coverage**: Prompts not classified as `camera` by the parser
   lose the 0.2 role bonus, dropping below threshold even with correct keyword overlap.

### Suggested Code Patches (do NOT apply yet)

```python
# PATCH 1 — Variant-level discrimination via block_id token priority
# In _score_entry(), boost entries whose block_tokens (from ID) have higher overlap:
#
#   block_id_overlap = probe_tokens & frozenset(entry.get("block_tokens") or set())
#   variant_bonus = 0.15 * len(block_id_overlap.difference(_INDEX_STOP_TOKENS))
#   score += variant_bonus
#
# This gives bird_eye a bonus when "bird" appears in probe, and worm_eye when "worm" appears.

# PATCH 2 — Reduce candidate stop-token aggressiveness for directional words
# Move directional words from _CANDIDATE_STOP_TOKENS to a separate "low-weight" set:
#
#   _DIRECTIONAL_TOKENS = {"left", "right", "up", "down", "forward", "backward",
#                          "above", "below", "behind", "near"}
#   # Keep them in the probe set but weight at 0.5x in lexical_score computation.

# PATCH 3 — Add negative-evidence penalty
# In _score_entry(), after computing overlap:
#
#   entry_block_tokens = frozenset(entry.get("block_tokens") or set())
#   distinguishing_tokens = entry_block_tokens - _INDEX_STOP_TOKENS - _LOW_SIGNAL_OVERLAP_TOKENS
#   if distinguishing_tokens and not (probe_tokens & distinguishing_tokens):
#       score *= 0.7  # Penalize entries whose identity tokens are absent

# PATCH 4 — Remove 'camera', 'shot', 'scene' from _CANDIDATE_STOP_TOKENS
#            when candidate.role == "camera"
# Currently these are always stripped. But for camera-role candidates, "camera" provides
# evidence of domain. A conditional stop-token set per role would preserve this signal.

# PATCH 5 — Raise threshold to 0.50 + apply patches 1-3 first
# Threshold alone doesn't help (sweep shows flat P@1 ratio). Apply scoring
# improvements first, then re-evaluate threshold.
```

### Recommended Next Steps

1. **Implement patches 1-3** (variant discrimination, directional token handling, negative evidence)
2. **Re-run this eval** with modified scoring (`python -m pixsim7.backend.scripts.eval_primitive_projection`)
3. **Expected outcome**: P@1 should improve to ~60-70%, coverage to ~45-55%, FPR to ~15-20%
4. **If those targets are met**: Tune threshold to ~0.55-0.60 and re-evaluate
5. **Promotion gate**: Only promote to soft influence when P@1 >= 85%, coverage >= 60%, FPR <= 5%

### Open Questions

- Should single-word primitives like "Dolly.", "Zoom.", "Pan." be considered valid matches?
  If yes, reclassify them in the corpus and FPR drops by ~4%.
- Should wrong-variant matches count as partial successes for category-level routing?
  If category-level accuracy is sufficient for soft influence, the bar is closer than P@1 suggests.
- Should the direction category use a different matching strategy entirely
  (e.g., phrase-pattern matching rather than token overlap)?

---
_Generated by `pixsim7/backend/scripts/eval_primitive_projection.py`_
_Manual analysis added 2026-03-10_

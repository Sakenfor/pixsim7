# PixSim7 Action Prompt Engine – 5–8s Segment Design (Spec for Implementation)

This spec is for a **visual action prompt engine** that sits alongside the
Narrative Prompt Engine. It focuses on short 5–8 second clips that become
`MediaSegment`s in scenes, primarily generated as **image‑to‑video** from
existing NPC/location stills.

The target implementer is a high‑capability agent (e.g. Claude Opus). This doc
assumes you will also read and respect:

- `docs/RELATIONSHIPS_AND_ARCS.md`
- `docs/GRAPH_UI_LIFE_SIM_PHASES.md`
- `docs/HOTSPOT_ACTIONS_2D.md`
- `docs/NARRATIVE_PROMPT_ENGINE_SPEC.md` (once present)

You should use those to fill any gaps or inconsistencies you notice in this
file rather than over‑fitting to its wording.

---

## 0. Context

PixSim7 scenes ultimately use `MediaSegment[]` from `@pixsim7/types`:

```ts
export interface MediaSegment {
  id: string;
  url: string;
  durationSec?: number;
  tags?: string[];
}
```

- A **short clip** (typically 5–8 seconds) becomes a single `MediaSegment`.
- Scenes can chain multiple segments:
  - Linearly (simple sequence),
  - Via `PlaybackMode` progression,
  - Or with branching choices (scene graph).

Most clips in this context will be:

- Generated via **image‑to‑video**, anchored on one or more existing stills:
  - Usually a particular NPC in a location.
  - Often with the NPC already in the correct pose (standing by bench vs sitting on couch).
- Only occasionally pure text‑to‑video.

We also want to support **transition clips** between poses/images, e.g.:

- Standing near bench → sitting on bench,
- Leaning against bar → leaning in closer,

in a single 5–8s seductive movement, using 2–7 stills as reference frames.

---

## 1. Goals

Design an **Action Prompt Engine** that:

- Defines reusable **action blocks**:
  - Each block describes a single short visual action, suitable for a 5–8s clip.
  - Blocks can be tied to one reference image (single‑state) or multiple (transition).
- Tags blocks by:
  - Location and pose (bench, bar table, sofa, walking, etc.).
  - Intimacy level (from the world’s intimacy/intimacy schema).
  - Mood/intent (playful, tender, conflicted, etc.).
  - Optional: time of day, indoor/outdoor, style.
- Supports **chaining and branching**:
  - Blocks know which other blocks can follow or precede them.
  - Branches allow different narrative paths (escalate vs cool‑down vs side event).
- Is friendly to being populated by an LLM (Claude Sonnet) later:
  - Clear JSON schemas,
  - Prompts that can be filled in from templates,
  - Constraints we can include in generation prompts.

The engine should **not** call any video generation APIs itself; it builds
structured prompt data that the rest of PixSim7 can use to drive PixVerse or
other generators.

---

## 2. Action Block Schema (Design Target)

Design a JSON schema for a single action block. It should support two main
kinds:

- `"single_state"` – motion starting from a single reference still.
- `"transition"` – motion that morphs between two or more reference stills.

### 2.1 Single‑State Block

Example shape (conceptual):

```jsonc
{
  "id": "bench_hair_move_tease",
  "kind": "single_state",
  "tags": {
    "location": "bench_park",
    "pose": "sitting_close",
    "intimacy_level": "deep_flirt",
    "mood": "playful",
    "time_of_day": "evening",
    "indoors": false
  },
  "referenceImage": {
    "npcId": 12,
    "assetId": 345,
    "crop": "full_body"        // or "waist_up", "portrait"
  },
  "isImageToVideo": true,
  "startPose": "sitting_close_facing_forward",
  "endPose": "sitting_close_head_turned_toward_partner",
  "prompt": "From this existing shot of {{lead}} and {{partner}} sitting close together on a park bench at dusk, {{lead}} gently reaches over to tuck a loose strand of {{partner}}'s hair behind her ear. Both are smiling softly, close but not yet kissing. Keep faces, outfits, and lighting consistent with the reference image.",
  "negativePrompt": null,
  "style": "soft_cinema",
  "durationSec": 6.0,
  "compatibleNext": ["bench_almost_kiss_pull_back", "bench_laughs_change_topic"],
  "compatiblePrev": ["bench_arrive_sit_down"]
}
```

Notes:

- `durationSec`: target clip duration (5–8 seconds recommended).
- `referenceImage`: the still to hand to the generator; must **preserve identity,
  clothing, and basic composition**.
- `startPose` / `endPose`: abstract pose identifiers to help chaining.
- `compatibleNext` / `compatiblePrev`: optional hints for the selector.

### 2.2 Transition Block (1–7 Images)

For movements between distinct poses or stills, support a `"transition"` kind.
Transitions may use 2–7 reference images (e.g., standing → half‑seat → seated).

Example (2‑image minimal):

```jsonc
{
  "id": "bench_stand_to_sit_seductive",
  "kind": "transition",
  "tags": {
    "location": "bench_park",
    "intimacy_level": "deep_flirt",
    "mood": "playful",
    "time_of_day": "evening"
  },
  "from": {
    "referenceImage": { "npcId": 12, "assetId": 1001, "crop": "full_body" },
    "pose": "standing_near_bench"
  },
  "to": {
    "referenceImage": { "npcId": 12, "assetId": 1002, "crop": "full_body" },
    "pose": "sitting_on_bench"
  },
  "via": [
    {
      "referenceImage": { "npcId": 12, "assetId": 1003 },
      "pose": "half_seated_turning"
    }
  ],
  "prompt": "Morph from the first still, where {{lead}} stands near the park bench, into the second still, where she is seated on the bench, moving in one smooth, slightly seductive motion. Keep her face, outfit, and lighting consistent across all reference images. The camera remains at a steady, soft cinematic angle.",
  "durationSec": 7.0,
  "style": "soft_cinema",
  "compatibleNext": ["bench_hair_move_tease"],
  "compatiblePrev": ["bench_arrive_from_path"]
}
```

Notes:

- `from` / `to` each have a `referenceImage` and a `pose` label.
- `via` is an optional array of 0–5 intermediate stills/states (so total images
  is 1–7: from, to, plus up to 5 via).
- The prompt must explicitly treat this as an **image‑to‑image‑to‑video**
  morph/transition, preserving character identity and style.

---

## 3. Chaining and Branching

The block schema must support:

- **Linear sequences:** e.g., three compatible single‑state blocks in a row.
- **Branch points**, where a given block can lead to multiple different
  successors:
  - Escalation (e.g. almost kiss → soft kiss).
  - Cool‑down (almost kiss → playful pull‑back).
  - Side events (almost kiss → phone interruption).

Fields that help this:

- `compatibleNext` / `compatiblePrev` ID lists.
- `startPose` / `endPose`: chain blocks whose poses line up logically.
- (Optionally) a `branchType` tag per block (e.g. `"escalate"`, `"cool_down"`, `"side_branch"`).

The selector should be able to, given a previous block and a desired branch
intent, propose 1–3 valid successors.

---

## 4. Selection Inputs (What the Action Engine Receives)

The Action Prompt Engine should not pull raw DB state by itself. Instead, it
should receive a distilled **context** from upstream (narrative engine / scene
runtime).

Example context:

```jsonc
{
  "locationTag": "bench_park",
  "pose": "sitting_close",
  "intimacy_level": "deep_flirt",
  "mood": "playful",
  "branchIntent": "escalate",   // or "cool_down", "side_branch"
  "previousBlockId": "bench_hair_move_tease"  // optional
}
```

The selector then:

- Filters blocks by `tags.location`, `tags.pose`, `tags.intimacy_level`, `tags.mood`.
- If `previousBlockId` is provided:
  - Prefers blocks whose `compatiblePrev` contains it, or whose `startPose`
    matches the previous `endPose`.
- Uses `branchIntent` to prioritize appropriate `compatibleNext` or `branchType`.

You should define a small, clear Python interface for this selection step (and
optionally a TS mirror for editor tooling later).

---

## 5. Implementation Expectations

For the first implementation pass, please:

1. **Define the action block JSON schema** as Python/TS types and document it
   (this doc can be the canonical description).

2. **Implement a small selector module** (backend, Python) that:
   - Loads a small in‑repo library of action blocks from JSON (seed with a few
     hand‑crafted examples).
   - Given a context (see above), returns either:
     - A single block, or
     - A short chain (2–3 blocks) whose `startPose`/`endPose`/compatibility
       make sense.
   - Returns the blocks’ `prompt` and `referenceImage` data; the caller will
     turn these into `MediaSegment` generation requests.

3. **Do not call video generation APIs**:
   - Just provide structured data: which block(s) to use, which reference
     images, and what prompt text.

4. **Do not change DB schemas**:
   - Keep everything as JSON config and a small selector library.
   - Any additional metadata needed by scenes can live in `SceneNode.meta` or
     `GameNPC.meta`, following existing conventions.

---

## 6. How Sonnet Will Populate the Library

We plan to use Claude Sonnet to **generate many action blocks** that obey this
schema. To make that easy:

- The schema should be **prompt‑friendly**:
  - Clear field names and tags.
  - Easy to say: “fill in a block for `location=bench_park`, `pose=sitting_close`,
    `intimacy_level=deep_flirt`, `mood=playful`, 5–8 second clip, single‑state.”

- For transitions:
  - Sonnet will be asked to write prompts that describe motion from a given
    `from.referenceImage` to a `to.referenceImage` (plus optional `via[]`),
    without changing identity/clothing/environment.

Your implementation should focus on getting the structure, selection logic, and
examples right so that Sonnet can later fill in a larger library of blocks
using this schema, and the rest of PixSim7 can stitch together rich, branching
visual sequences from those building blocks.


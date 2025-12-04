# Generation Config & Canonical Params

This doc explains how structured generation config flows through the backend,
and how to safely evolve it without breaking providers or dedup logic.

## Layers

- `raw_params.generation_config`  
  - Full, structured config from the frontend (`GenerationNodeConfig`).  
  - Includes: `generation_type`, `purpose`, `style`, `duration`, `constraints`,
    `strategy`, `seed_source`, `fallback`, plus extras (`prompt`, `image_url`,
    `video_url`, `image_urls`, `prompts`, `fusion_assets`, etc.).  
  - Source of truth for dev tools, inspectors, and future extensions.

- `raw_params.scene_context` / `player_context` / `social_context`  
  - Structured context objects (scene from/to, player snapshot, social state).  
  - Stored as provided; extra fields are allowed.

- `canonical_params`  
  - Compact, provider‑ready + dedup‑ready view, built in
    `GenerationCreationService._canonicalize_params` / `_canonicalize_structured_params`.  
  - Contains only fields the runtime cares about:
    - Scalars: `duration`, `content_rating`, `pacing`, `prompt`, `image_url`,
      `video_url`, `image_urls`, `prompts`, `fusion_assets`, etc.
    - Provider options from `generation_config.style.<provider_id>`:
      `model`, `quality`, `aspect_ratio`, `seed`, `motion_mode`, `style`,
      `negative_prompt`, `template_id`, `multi_shot`, `audio`, `off_peak`,
      `camera_movement`, …
    - Structured context snapshots: `scene_context`, `player_context`,
      `social_context` (copied as‑is from `params`).
  - **Does not** include a nested `generation_config` copy to avoid redundancy.

## Dedup & Caching

- `Generation.compute_hash(canonical_params, inputs)`  
  - Uses only `canonical_params` and `inputs` for reproducible hash dedup.  
  - If a field is added to `canonical_params`, it participates in dedup.

- Cache strategy & purpose  
  - Read from the original `params["generation_config"]` (via
    `generation_config_for_cache`) in `GenerationCreationService.create_generation`.  
  - This keeps caching semantics tied to the structured config, not how
    canonicalization is shaped internally.

## Adding New Fields

When introducing a new generation field, decide which layer(s) it belongs to.

1. **Frontend / schema**
   - Add to `GenerationNodeConfig` in TS and/or
     `GenerationNodeConfigSchema` in `generation_schemas.py`.  
   - Schemas are `extra = "allow"`, so unknown fields still pass through even
     before you explicitly type them.

2. **Storage / raw view**
   - New fields in `GenerationNodeConfig` automatically land in
     `raw_params.generation_config`.  
   - New context fields automatically land in `raw_params.scene_context` /
     `player_context` / `social_context`.

3. **Canonical & dedup (optional)**
   - Only add to `_canonicalize_structured_params` if:
     - Providers need it as a top‑level option, or
     - It should affect dedup / caching semantics.
   - Example: adding `camera_path` under `style.pixverse`:
     - Frontend sets `generation_config.style.pixverse.camera_path`.
     - Backend extracts to `canonical_params["camera_path"]` if needed.

4. **Provider mapping (as needed)**
   - Update `PixverseProvider.map_parameters` (or other adapters) to read the
     new canonical field and pass it into the SDK options.

If a field is **only** stored in `generation_config` and never surfaced into
`canonical_params`, it:

- Is preserved for tooling and introspection.  
- Does **not** affect dedup or provider behavior.

## Scenes & Contexts

- `scene_context.from_scene` / `scene_context.to_scene`  
  - Always stored as structured objects.  
  - `_canonicalize_structured_params` copies the whole `scene_context` dict
    into `canonical_params["scene_context"]` without unpacking, so new fields
    under `from_scene` / `to_scene` require no backend changes.

- `player_context`, `social_context`  
  - Same pattern: raw objects are preserved and mirrored into
    `canonical_params` for convenience.  
  - Rating validation (`_validate_content_rating`) only looks at
    `social_context["contentRating"]` and ignores extra fields.

## Guidelines

- Use `raw_params.generation_config` as the authoritative schema for new
  gameplay / editor features.  
- Treat `canonical_params` as a slim, runtime‑oriented view: only add fields
  that providers or dedup logic genuinely need.  
- When in doubt, start by writing new data into `generation_config` only. If
  you later need provider support or dedup sensitivity, promote the field into
  `canonical_params` and adapter mapping.*** End Patch`}/>

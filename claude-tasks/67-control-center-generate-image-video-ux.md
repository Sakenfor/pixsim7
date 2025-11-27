**Task 67: Control Center Generate – Image/Video UX & Queues**

> **For Agents**
> - Improves the Control Center “Generate” / `QuickGenerateModule` experience, especially:
>   - Image-to-video flows when an image is “chosen” via gallery/cubes or queue.
>   - Video transition flows where multiple images and prompts are required.
>   - Layout and settings density in the Generate surface.
> - Use this task when you:
>   - Touch `QuickGenerateModule`, generation queues, or media-to-video provider params.
>   - Work on image-to-video or video transition UX in the Control Center.
> - Read first:
>   - `apps/main/src/components/control/QuickGenerateModule.tsx`
>   - `apps/main/src/stores/generationQueueStore.ts`
>   - `apps/main/src/hooks/useMediaGenerationActions.ts`
>   - `apps/main/src/routes/Assets.tsx` (for how MediaCard actions queue work)

---

## Context

Current behavior (as of 2025-11-27):

- The main Control Center Generate UI lives in `QuickGenerateModule` and supports:
  - `text_to_video`
  - `image_to_video`
  - `video_extend`
  - `video_transition`
  - `fusion`
- It integrates with:
  - **Active asset** (`useAssetSelectionStore` – “Active: … (Use Asset)” banner).
  - **Generation queues** (`useGenerationQueueStore`):
    - `mainQueue` for generic generation (image-to-video, video-extend, etc.).
    - `transitionQueue` for `video_transition` (multi-image transitions).
  - **Media actions** (`useMediaGenerationActions` + `MediaCard.actions`):
    - `onImageToVideo` → `queueImageToVideo`
    - `onVideoExtend` → `queueVideoExtend`
    - `onAddToTransition` → `queueAddToTransition`
    - `onAddToGenerate` → `queueAutoGenerate`

What works reasonably well:

- Queuing:
  - Clicking “Image to Video” or “Video Extend” on a gallery asset queues a job and opens the Control Center.
  - A purple “Queue” banner appears in `QuickGenerateModule`:
    - `⚡ Queue: {provider_asset_id} ({media_type}) +N more`.
  - A separate “Transition Queue” count appears for assets destined for `video_transition`.
- Auto-fill:
  - `image_to_video` and `video_extend` try to auto-fill provider URLs from queued assets:

    ```ts
    // main queue auto-fill (simplified)
    if ((operation === 'image_to_video' || !operation) && asset.media_type === 'image') {
      setDynamicParams(prev => ({ ...prev, image_url: asset.remote_url }));
      if (!operation) setOperationType('image_to_video');
    } else if ((operation === 'video_extend' || !operation) && asset.media_type === 'video') {
      setDynamicParams(prev => ({ ...prev, video_url: asset.remote_url }));
      if (!operation) setOperationType('video_extend');
    }
    ```

  - `video_transition` auto-fills `imageUrls` from `transitionQueue`:

    ```ts
    // transition queue auto-fill (simplified)
    if (transitionQueue.length > 0) {
      setOperationType('video_transition');
      const urls = transitionQueue.map(item => item.asset.remote_url);
      setImageUrls(urls);
    }
    ```

- Validation:
  - `text_to_video` requires a prompt.
  - `image_to_video` requires an `image_url`.
  - `video_extend` requires either `video_url` or `original_video_id`.
  - `video_transition` requires:
    - `imageUrls.length > 0`
    - `prompts.length > 0`
    - `imageUrls.length === prompts.length`

Observed UX issues from usage:

- **Image-to-video feels “broken” when an image appears queued but there is no usable `image_url`:**
  - The UI shows something like:
    - `⚡ Queue: local_d7cc41d40335a0b3 (image) +2 more`
  - The user expects that “choosing an image” (via gallery actions or cubes) is enough.
  - On Generate, `QuickGenerateModule` still errors with:
    - `"Image URL is required for image-to-video"`.
  - Root cause:
    - Validation checks `dynamicParams.image_url`, not just “is there a queued image”.
    - For local-only or unsynced assets, `asset.remote_url` is empty, so `image_url` remains falsy.
    - From the user’s perspective, there *is* an image selected; from the provider’s POV, there is no usable URL.

- **Transition queue is opaque:**
  - `transitionQueue` is surfaced as:
    - `Transition Queue: {N} assets (Clear)`.
  - Internally, `imageUrls` are auto-filled from `transitionQueue`, but:
    - The UI does not show *which* images correspond to each prompt.
    - Users see two separate arrays (“Image URLs” / “Prompts”) and a validation error:
      - `"Number of image URLs must match number of prompts"`.
    - Mapping between queued images and prompts is not visually obvious.

- **Generate layout is dense and “settings-heavy”:**
  - The left column contains:
    - Active asset banner.
    - Queue banners.
    - Operation selector.
    - Prompt input.
    - Array fields for `video_transition`.
    - Dynamic parameter form based on provider `operation_specs`.
    - Optional provider-specific plugin UI.
  - The right column (`w-64`) contains:
    - Provider select.
    - Preset summary.
    - Generate button.
  - On smaller windows, the combination of banners + dynamic params + plugin UI can push critical controls out of view and makes it visually unclear what’s required vs. optional.

---

## Goals

1. **Make image-to-video behave like “I chose an image”:**
   - When the user has a clearly selected or queued image, the UI should:
     - Prefer auto-resolving `image_url` from that selection.
     - When it cannot (e.g., local-only asset with no `remote_url`), explain *why* instead of a generic “Image URL is required”.
   - Avoid forcing users to understand internal provider URL requirements to succeed.

2. **Clarify queues and transitions:**
   - Make it obvious:
     - Which queued image will be used for the next `image_to_video` / `video_extend` run.
     - For `video_transition`, how each image aligns with its corresponding prompt.
   - Surface when queued assets are not provider-usable (no `remote_url`, `local_only`, etc.).

3. **Reduce perceived settings clutter in Generate:**
   - Maintain the current functionality, but:
     - Tighten the vertical footprint of “status” banners and dynamic param/plugin sections.
     - Make advanced controls feel secondary to the core “prompt + image(s) + Generate” flow.

---

## Phase Checklist

- [ ] **Phase 67.1 – Image-to-Video Validation & Auto-Fill**
- [ ] **Phase 67.2 – Queue & Transition Visualization**
- [ ] **Phase 67.3 – Layout & Settings Density Cleanup**
- [ ] **Phase 67.4 – UX Copy & Edge-Case Messaging**

---

## Phase 67.1 – Image-to-Video Validation & Auto-Fill

**Goal**  
Ensure that when a user “chooses an image” (via gallery, cubes, or queue), image-to-video either:
- Automatically fills `image_url` using that selection, or
- Clearly explains why the image cannot be used (e.g. no provider URL).

**Scope**

- `apps/main/src/components/control/QuickGenerateModule.tsx`
- `apps/main/src/stores/generationQueueStore.ts` (if additional metadata is needed, e.g. provider_status)
- `apps/main/src/hooks/useMediaGenerationActions.ts`

**Key Ideas**

1. **Context-aware validation for image-to-video**

   Replace the generic:

   ```ts
   if (operationType === 'image_to_video' && !dynamicParams.image_url) {
     setError('Image URL is required for image-to-video');
     return;
   }
   ```

   with logic that:

   - Tries to recover from obvious states:
     - If `mainQueue[0]` is an image and has `remote_url`, auto-fill `dynamicParams.image_url` just before failing.
     - If `lastSelectedAsset.type === 'image'` and it has a URL, auto-fill from `lastSelectedAsset.url`.
   - Emits *specific* errors when auto-fill isn’t possible, for example:
     - “This queued image is local-only and has no cloud URL yet. Sync or upload it before using image-to-video.”
     - “Selected image has no usable URL. Try picking a gallery asset that has been uploaded to the provider.”
     - “Select an image from the gallery or paste an Image URL to use image-to-video.”

2. **Optional: auto-use active asset on Generate**

   - When `operationType === 'image_to_video'` and:
     - `lastSelectedAsset?.type === 'image'`
     - `dynamicParams.image_url` is empty
   - Consider auto-applying the same behavior as the “Use Asset” button instead of requiring an extra click.
   - Only do this when it’s unambiguous; otherwise, keep the explicit button behavior.

3. **Handle local-only or unsynced assets gracefully**

   - Where possible, use `AssetSummary.provider_status` or similar flags to detect:
     - `provider_status === 'local_only'` or missing `remote_url`.
   - Reflect this in both validation and banner copy (see Phase 67.4).

**Acceptance Criteria**

- Pressing Generate for image-to-video after:
  - Clicking “Image to Video” on a cloud-backed gallery image, or
  - Selecting a compatible active asset
  will **not** show a generic “Image URL is required” error.
- When an asset is unusable (local-only, missing `remote_url`), the error explicitly names that condition and hints at how to fix it (e.g. upload / sync).

---

## Phase 67.2 – Queue & Transition Visualization

**Goal**  
Make the main queue and transition queue states legible and show how they connect to the fields required to Generate.

**Scope**

- `apps/main/src/components/control/QuickGenerateModule.tsx`
- `apps/main/src/routes/Assets.tsx` (for potential hover text consistency with MediaCard)

**Key Ideas**

1. **Main queue clarity**

   - Update the purple main queue banner to:
     - Explicitly state that the first item will be used for the next Generate operation when compatible.
     - Show a short description of what’s queued, e.g.:
       - “⚡ Queue: img_123 (image) +2 more — first item will be used for Image to Video.”
   - If the first queued asset has no usable `remote_url` or is `local_only`:
     - Add a subtle warning line:
       - “This queued image is not yet synced to the provider (no URL). It can’t be used by image-to-video.”

2. **Transition queue mapping**

   - In the banner:
     - Instead of only `Transition Queue: N assets`, show:
       - A short, ordered list of the first few items (IDs or names and media type).
       - Optionally, tiny thumbnails if available (future polish).
   - In the `video_transition` form:
     - Align `imageUrls` and `prompts` as **paired rows**, not just two independent arrays:
       - For example, “Image 1 (from queue)” + “Prompt for Image 1” etc.
     - When auto-filling `imageUrls` from `transitionQueue`, also initialize `prompts` with the same length (empty strings), so the user sees one row per image by default.

3. **Explain the pairing requirement**

   - Below the transition prompts area, add helper text:
     - “Each image needs a corresponding prompt in order. We’ll generate a transition that follows this sequence.”
   - This makes the “Number of image URLs must match number of prompts” error more intuitive.

**Acceptance Criteria**

- Users can glance at the Generate panel and understand:
  - Which image asset will be used for image-to-video next, and whether it’s usable.
  - How many assets are staged for a transition and roughly what they are.
  - How prompts align with those images for transitions.

---

## Phase 67.3 – Layout & Settings Density Cleanup

**Goal**  
Reduce visual clutter in the Generate panel while preserving all existing functionality; prioritize the “prompt + selected image(s) + Generate” path.

**Scope**

- `apps/main/src/components/control/QuickGenerateModule.tsx`

**Key Ideas**

1. **Compact top banners**

   - Tighten padding and font sizes of:
     - Active asset banner (“Active: … (Use Asset)”).
     - Queue banners.
   - Consider merging them into a single row when both are present, e.g.:
     - Left: Active asset info.
     - Right: Queue info.

2. **Operation selector ergonomics**

   - Either:
     - Keep the current selector but ensure it doesn’t dominate vertical space; or
     - Move the operation selector closer to the provider/preset controls on the right, to group “mode” and “provider” settings.

3. **Contain dynamic params and plugin UI**

   - Wrap the dynamic parameter form and provider-specific plugin UI in a bounded container (e.g. `max-h-56 overflow-y-auto`) so they don’t push the Generate button out of view on smaller windows.
   - Clearly separate “core inputs” (prompt, image URLs, basic options) from “advanced provider params”.

4. **Optional: collapsible advanced settings**

   - Introduce a small “Advanced settings” toggle around the provider/preset block that:
     - Keeps the Generate button always visible.
     - Allows power users to expand provider/preset details and dynamic params while letting casual users focus on the basics.

**Acceptance Criteria**

- On typical laptop resolutions, the user can:
  - See the prompt field, core operation mode, and Generate button without excessive scrolling.
  - Still access advanced provider / preset controls when needed.

---

## Phase 67.4 – UX Copy & Edge-Case Messaging

**Goal**  
Improve error messages and helper text so users understand what’s wrong and how to fix it, especially for asset URL/provider nuances.

**Scope**

- `apps/main/src/components/control/QuickGenerateModule.tsx`
- UI copy in banners and validation errors.

**Key Ideas**

1. **Replace generic “Image URL is required” error**

   - Use context-aware messages such as:
     - “Select an image or paste an Image URL to use image-to-video.”
     - “This queued image is local-only and has no provider URL yet. Open the asset and upload/sync it before generating video.”

2. **Clarify transition errors**

   - When images and prompts lengths mismatch, consider:
     - “You have {N} images and {M} prompts. Each image needs one prompt. Add or remove prompts so they match.”
   - Add inline helper text near the array fields explaining the pairing rule (see Phase 67.2).

3. **Highlight when the system recovered automatically**

   - When the system auto-fills `image_url` or other required params right before generating, consider:
     - A subtle inline note “Using selected image: {name}” above the prompt, so the user understands what will be used.

**Acceptance Criteria**

- Error messages:
  - Reference the user’s actions (selected/queued images, transitions) instead of generic parameter names only.
  - Suggest concrete remediation steps (e.g. sync/upload, pick a different asset, add prompts).

---

## Notes for Future Work (Non-Goals for This Task)

- Do **not** change backend generation APIs or provider contracts in this task.
- Do **not** introduce new database columns; rely on existing JSON fields and provider metadata.
- Larger refactors of the Control Center layout or entirely new modes (beyond quick Generate UX) should be tracked in separate tasks (e.g. follow-ups to Task 36).


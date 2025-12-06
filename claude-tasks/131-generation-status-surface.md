## Task 131 – Surface Generation Status in Gallery + Panel

### Goal
Expose generation status (pending/processing/completed/failed) directly in media galleries and provide a dedicated panel for tracking and filtering jobs.

### Motivation
- When Pixverse (or any provider) stalls, users currently have to read backend logs to know a job is stuck.
- Gallery surfaces (LocalFolders, ReviewGallery, Intimacy previews) don’t show which assets are still generating, failed, or ready.
- A global “Generations” panel would help triage failures, retries, and timeouts without digging through logs.

### Phase 1 – Gallery badges
1. **Augment MediaCard**
   - Accept generation metadata (status, provider, last update).
   - Render subtle badges (e.g., spinner for processing, warning for failed, checkmark for done).
   - Allow filtering/toggling status overlay via props.
2. **Status source**
   - Extend `useGenerationsStore` or create a helper that maps generation IDs → assets (provider asset id or local placeholder) so the gallery knows which cards correspond to active jobs.
   - For local folders, show “uploading” vs. “processing” vs. “failed upload.”
3. **Filters**
   - Add drop-down/toggle in gallery surfaces (e.g., LocalFoldersPanel) for “All / Active / Failed / Completed” so users can quickly find failed jobs.

### Phase 2 – Generations panel
1. **Dedicated dock panel**
   - List recent jobs (time, prompt snippet, operation, provider, status, retry button).
   - Support filters (provider, status) and search by prompt.
2. **Integration**
   - Hook into `GenerationWorkbench` so clicking a status chip opens the panel at that job.
3. **Retry / open asset**
   - Provide quick actions to retry failed jobs or open the resulting asset once completed.

### Deliverables
- Updated `MediaCard` (and gallery surfaces) with status badges + filtering (Phase 1).
- New “Generations” panel hooking into `useGenerationsStore`, with filters and retry actions (Phase 2).
- Documentation snippet describing how to associate assets with generation IDs.

# Add Local LLM (llama-cpp-python) for Prompt Analysis

## Context

Prompt analysis currently has two mature paths:
- Rule-based parser (`prompt:simple`)
- Cloud LLM analyzers (`prompt:claude`, `prompt:openai`)

The parser is deterministic and fast but can miss semantic structure. A small local model can improve semantic extraction without API cost and with optional offline use.

**Target model**: `SmolLM2-1.7B-Instruct` (GGUF Q4_K_M, CPU-focused, ~1 GB RAM footprint)

## Existing Architecture (Current-State Notes)

### Two LLM abstraction layers (both currently have local stubs)
1. **AI Hub providers** (`services/llm/adapters.py`): `edit_prompt(...)` interface used by prompt analysis (`llm_registry`).
2. **General LLM providers** (`services/llm/providers.py`): `generate(LLMRequest) -> LLMResponse` used by `LLMService`.

### Analyzer registry is broader than prompt-only
- Prompt analyzers: `prompt:simple`, `prompt:claude`, `prompt:openai`
- Asset analyzers also exist in the same registry
- Legacy prompt aliases exist (`llm:claude`, `llm:openai`) and are normalized via `resolve_legacy()`

### Prompt analyzer routing
- `PromptAnalysisService._run_analyzer()` dispatches by `AnalyzerKind`
- LLM path calls `analyze_prompt_with_llm()` and resolves provider via:
  - explicit request or instance override
  - analyzer default provider
  - `provider_map` fallback
  - user preference

### Provider plugin loading
- `providers/<name>/manifest.py` is auto-discovered
- `manifest.enabled` gates registration into `llm_registry`
- `providers/local_llm/manifest.py` exists and is currently disabled

## Files to Change

| File | Action |
|------|--------|
| `pixsim7/backend/main/services/llm/local_llm_engine.py` | **Create** engine: lazy load, serialized inference, optional download |
| `pixsim7/backend/main/services/llm/adapters.py` | Implement `LocalLlmProvider` stub |
| `pixsim7/backend/main/services/llm/providers.py` | Implement `LocalLLMProvider.generate()` with valid `LLMResponse` shape |
| `pixsim7/backend/main/providers/local_llm/manifest.py` | Set `enabled=True`, update description |
| `pixsim7/backend/main/services/prompt/parser/registry.py` | Add `prompt:local` + `llm:local` legacy alias + legacy map entry |
| `pixsim7/backend/main/services/prompt/analysis.py` | Add local provider routing and normalization entries |
| `pixsim7/backend/main/services/prompt/parser/llm_analyzer.py` | Add compact system prompt path for `local-llm` |
| `pixsim7/backend/main/shared/config.py` | Add local LLM settings |
| `pixsim7/backend/main/requirements-local-llm.txt` | **Create** optional dependency file (`llama-cpp-python`, optional helpers) |
| `.env.example` | Document optional local LLM env vars |

## Dependency Strategy (Important)

Local LLM must be **optional**, so base runtime stays healthy without local native deps.

- Keep `pixsim7/backend/main/requirements.txt` unchanged for this feature.
- Add `pixsim7/backend/main/requirements-local-llm.txt` with:
  - `llama-cpp-python>=0.2.0`
  - `huggingface-hub>=0.20.0` (only if auto-download path is enabled)
- Runtime behavior when optional deps are missing:
  - local provider raises `ProviderError` with actionable message
  - prompt analyzer catches provider failure and falls back to simple parser
  - backend startup remains unaffected

Install command for local feature:
```bash
pip install -r pixsim7/backend/main/requirements-local-llm.txt
```

## Implementation Details

### 1. Config settings (`shared/config.py`)

Add under `# ===== LLM / AI =====`:

```python
local_llm_model_path: str | None = Field(default=None, description="Path to GGUF model file")
local_llm_context_size: int = Field(default=2048, description="Context window (tokens)")
local_llm_threads: int = Field(default=4, description="CPU threads for inference")
local_llm_auto_download: bool = Field(default=False, description="Auto-download model if not found")
```

Env vars:
- `LOCAL_LLM_MODEL_PATH`
- `LOCAL_LLM_CONTEXT_SIZE`
- `LOCAL_LLM_THREADS`
- `LOCAL_LLM_AUTO_DOWNLOAD`

### 2. Engine module (`services/llm/local_llm_engine.py`) - new

Create `LocalLlmEngine` with keyed pool via `get_local_llm_engine(...)`.

Design:
- **Lazy load**: no model import/load at module import time
- **Thread safety**:
  - `_load_lock` for one-time model initialization
  - `_inference_lock` to serialize inference calls
- **Async bridge**: `asyncio.to_thread(...)` around sync llama call path
- **Model resolution chain**:
  1. explicit `settings.local_llm_model_path`
  2. `<PIXSIM_HOME>/models/SmolLM2-1.7B-Instruct-Q4_K_M.gguf`
  3. optional download only when `local_llm_auto_download=True`
- **Per-instance engine overrides** (from analyzer/LLM instance config):
  - `model_path` or `local_llm_model_path`
  - `n_ctx` / `context_size` / `local_llm_context_size`
  - `n_threads` / `threads` / `local_llm_threads`
  - `auto_download` / `local_llm_auto_download`
- **Engine pooling key**: `(model_path, n_ctx, n_threads, auto_download)`
- **CPU inference**: `n_gpu_layers=0`
- **Cleanup**: `unload()` clears llama instance and allows memory release

Failure behavior:
- Missing `llama_cpp` import -> raise clear `ImportError` only when local provider is invoked
- Missing model file (and auto-download disabled or unavailable) -> `FileNotFoundError` with actionable path details

### 3. AI Hub adapter (`services/llm/adapters.py` -> `LocalLlmProvider`)

Replace stub with thin wrapper over engine:
- `generate(prompt_before, max_tokens, temperature)`
- default low temperature (`0.3`) for JSON stability
- honor `instance_config` overrides for inference parameters
- honor `instance_config` overrides for engine selection/loading:
  - `model_path`, `n_ctx`, `n_threads`, `auto_download`
- map errors to `ProviderError`:
  - `ImportError` (optional dep missing)
  - `FileNotFoundError` (model path issue)
  - generic runtime errors

### 4. General provider (`services/llm/providers.py` -> `LocalLLMProvider`)

Implement `generate()` and return a **valid** `LLMResponse` object.

Contract requirements:
- Build final prompt from `system_prompt` + `prompt`
- Call local engine
- Return:
  - `text=<generated_text>`
  - `provider=LLMProvider.LOCAL` (or `.value`)
  - `model=<resolved_model>`
  - `cached=False`
  - `cache_key=None`
  - `usage=None` (or estimated usage dict if available)
  - `estimated_cost=0.0`
  - `generation_time_ms=<measured duration>`
  - `metadata=request.metadata`

### 5. Registry + routing + alias parity

#### `services/prompt/parser/registry.py`
- Add new analyzer:
  - `id="prompt:local"`
  - `kind=AnalyzerKind.LLM`
  - `provider_id="local-llm"`
  - `model_id="smollm2-1.7b"`
  - `enabled=True`
- Add legacy alias entry:
  - `id="llm:local"`
  - `is_legacy=True`
  - alias description for `prompt:local`
- Update `resolve_legacy()` map:
  - `"llm:local": "prompt:local"`

#### `services/prompt/analysis.py`
- Add to `provider_map`:
  - `"prompt:local": "local-llm"`
  - `"llm:local": "local-llm"`
- Add provider ID normalization:
  - `"local": "local-llm"`
  - `"local-llm": "local-llm"`

#### `providers/local_llm/manifest.py`
- Set `enabled=True`
- Update description to reflect `llama-cpp-python` GGUF local inference

### 6. Compact system prompt path (`services/prompt/parser/llm_analyzer.py`)

Small local model gets a shorter instruction variant:
- Add `COMPACT_ANALYSIS_SYSTEM_PROMPT`
- `_build_system_prompt(..., compact: bool = False)`
- In `analyze_prompt_with_llm()`, use `compact=True` when `provider_id == "local-llm"`

## Key Design Decisions

1. **Pooled engines (not one global singleton)**: allows multiple local instances with different model/runtime settings while reusing engines for identical settings.
2. **Dual-lock model**: separate load serialization from inference serialization.
3. **`asyncio.to_thread()` bridge**: aligns with current command-provider pattern.
4. **Compact prompt for small context**: preserves room for user prompt + JSON response.
5. **Optional dependency model**: avoids breaking environments that do not need local inference.
6. **Legacy alias parity**: keep analyzer ID migration behavior consistent with existing LLM analyzers.

## Verification (Targeted)

Run focused tests first, then broader regression.

1. **Engine dependency gating**
   - Add tests: `pixsim7/backend/tests/services/llm/test_local_llm_engine.py`
   - Cases:
     - missing `llama_cpp` import only fails on local-provider use
     - no startup or import-time crash

2. **Missing model behavior**
   - Test local provider/analyzer with model absent and `LOCAL_LLM_AUTO_DOWNLOAD=false`
   - Expect `ProviderError` path and analyzer fallback to simple parser result shape

3. **Provider normalization + routing**
   - Add tests: `pixsim7/backend/tests/services/prompt/test_prompt_analysis_local_routing.py`
   - Cases:
     - `local` and `local-llm` normalize to `local-llm`
     - `prompt:local` and `llm:local` route to local provider

4. **LLMResponse contract correctness**
   - Add tests: `pixsim7/backend/tests/services/llm/test_local_llm_provider.py`
   - Validate required `LLMResponse` fields are populated

5. **Engine serialization**
   - Concurrency test in `test_local_llm_engine.py` using mocked llama client
   - Validate inference path is serialized (no concurrent execution of underlying llama call)

6. **Smoke with model present**
   - Place GGUF in `storage/models/`
   - Call analyze endpoint with `analyzer_id=prompt:local`
   - Verify non-empty `candidates`, valid JSON path, tags produced

7. **Regression pass**
   - `pytest pixsim7/backend/tests/test_prompt_llm_analyzer_tags.py`
   - `pytest pixsim7/backend/tests/test_prompt_tag_inference.py`
   - `pytest pixsim7/backend/tests/services/llm/test_command_llm_provider.py`

## Risks

- **Malformed JSON from small model**: mitigated by existing fallback to simple parser on JSON parse/provider errors.
- **First-request latency**: first local call includes model load.
- **Platform wheel constraints**: optional install path contains native dependency risk without affecting default runtime.
- **Unexpected model download costs/time**: controlled by `local_llm_auto_download` flag (default `False`).

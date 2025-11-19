# Auto-Retry Event Handler

Automatically retries failed generations when they fail due to:
- Content filtering (romantic/erotic content that might pass on retry)
- Temporary provider errors
- Rate limiting
- Timeouts

## Configuration

Controlled via environment variables in `.env`:

```bash
# Enable/disable auto-retry (default: true)
AUTO_RETRY_ENABLED=true

# Maximum retry attempts per generation (default: 10, range: 1-20)
AUTO_RETRY_MAX_ATTEMPTS=10
```

To disable completely, set:
```bash
AUTO_RETRY_ENABLED=false
```

## Behavior

- Listens to `job:failed` events
- Checks if generation should be auto-retried using `GenerationService.should_auto_retry()`
- Creates new generation with same parameters if appropriate
- Max attempts configurable (default: 10, including original)
- Preserves parent/child relationship
- Silent/automatic - no user interaction needed

## Detection Logic

Content filter keywords:
- "content filter", "content policy", "inappropriate content"
- "safety filter", "moderation", "nsfw"
- "adult content", "explicit content"

Temporary error keywords:
- "timeout", "rate limit", "temporarily unavailable"
- "try again", "service unavailable", "server error"

## How It Works

1. Generation fails with content filter error
2. Event handler receives `job:failed` event
3. Handler checks `should_auto_retry()` - detects "content filter" keyword
4. Handler creates new generation with same params (retry_count + 1)
5. New generation queued automatically
6. Process repeats up to max attempts
7. User sees retry attempts in UI

## Example

```
Generation #123: "romantic scene" → FAILED (content filter)
  ↓ Auto-retry triggers
Generation #124: "romantic scene" (retry 1/10) → PROCESSING...
  ↓ Still fails
Generation #125: "romantic scene" (retry 2/10) → PROCESSING...
  ↓ Still fails
Generation #126: "romantic scene" (retry 3/10) → COMPLETED ✓
```

# Generation Caching Guide

## Overview
The unified generation pipeline uses Redis-based caching with deterministic seed strategies to optimize performance and cost.

## Cache Strategies

### `once` - Generate Once, Cache Forever
- **Use case**: Static content that never changes
- **TTL**: 365 days
- **Cache key**: No seed component
- **Example**: Tutorial videos, static transitions

```typescript
{
  strategy: "once",
  // Cache key: generation:text_to_video|gap_fill|scene_001|scene_002|once|v1
}
```

### `per_playthrough` - Deterministic Per Playthrough
- **Use case**: Content that should be consistent within a playthrough but vary across playthroughs
- **TTL**: 90 days
- **Cache key**: Includes `playthrough_id` seed
- **Example**: Branching narrative choices, procedurally generated content

```typescript
{
  strategy: "per_playthrough",
  playthrough_id: "playthrough_123",
  // Cache key: generation:text_to_video|transition|scene_001|scene_002|per_playthrough|pt:playthrough_123|v1
}
```

### `per_player` - Personalized Per Player
- **Use case**: Content personalized to each player
- **TTL**: 180 days
- **Cache key**: Includes `player_id` seed
- **Example**: Player-specific cutscenes, personalized NPC responses

```typescript
{
  strategy: "per_player",
  player_id: 42,
  // Cache key: generation:npc_response|dialogue|scene_010|none|per_player|player:42|v1
}
```

### `always` - Fresh Every Time
- **Use case**: Content that must be unique each time
- **TTL**: Not cached
- **Cache key**: N/A
- **Example**: Real-time reactions, live events

```typescript
{
  strategy: "always",
  // Not cached
}
```

## How Caching Works

### 1. Request Flow
```
Frontend Request
  ↓
Generation API
  ↓
Cache Lookup (compute cache key)
  ├─ HIT → Return existing generation
  └─ MISS → Create new generation
       ↓
     Provider Call
       ↓
     Cache Result
```

### 2. Cache Key Format
```
generation:[type]|[purpose]|[fromSceneId]|[toSceneId]|[strategy]|[seed]|v[version]
```

**Examples:**
- `generation:text_to_video|gap_fill|scene_001|scene_002|once|v1`
- `generation:npc_response|dialogue|scene_010|none|per_playthrough|pt:abc123|v1`
- `generation:transition|mood_shift|scene_005|scene_006|per_player|player:42|v1`

### 3. Deduplication
Generations are also deduplicated by reproducible hash:
- Hash computed from canonical params + inputs
- Stored in Redis: `generation:hash:{hash}` → `generation_id`
- Prevents duplicate work even with different cache keys

## Frontend Integration

### Check if Cached
Before creating a generation, check if it would be cached:

```typescript
const checkResponse = await fetch('/api/v1/generations/cache/check', {
  method: 'POST',
  body: JSON.stringify({
    operation_type: 'text_to_video',
    purpose: 'gap_fill',
    canonical_params: { /* ... */ },
    strategy: 'per_playthrough',
    playthrough_id: currentPlaythrough.id,
    version: 1,
  }),
});

const { cached, generation_id, cache_key, ttl_seconds } = await checkResponse.json();

if (cached) {
  console.log(`Using cached generation ${generation_id} (TTL: ${ttl_seconds}s)`);
  // Skip generation creation, use existing
} else {
  console.log(`Creating new generation with cache key: ${cache_key}`);
  // Proceed with generation creation
}
```

### Cache Invalidation
Invalidate specific cache entries when needed:

```typescript
// Invalidate by cache key
await fetch(`/api/v1/generations/cache/${encodeURIComponent(cacheKey)}`, {
  method: 'DELETE',
});

// Or bump version number to invalidate all v1 caches
const newGeneration = {
  ...config,
  version: 2,  // All v1 caches bypassed
};
```

## Cache Statistics

### View Stats
```bash
curl http://localhost:8000/api/v1/generations/cache/stats
```

**Response:**
```json
{
  "total_cached_generations": 1523,
  "cache_hits_24h": 842,
  "cache_misses_24h": 178,
  "hit_rate_24h": 0.8255,
  "redis_connected": true
}
```

### Monitoring
- **Hit Rate**: Aim for >80% for frequently accessed content
- **Miss Rate**: High misses may indicate:
  - New content being generated
  - Cache TTL too short
  - Version bumps clearing cache

## Performance Optimization

### 1. Counter-Based Stats (Implemented)
Instead of slow SCAN operations, we use Redis counters:
- `generation:stats:total_cached` - Total cached count
- `generation:stats:cache_hits_24h` - 24h hit count
- `generation:stats:cache_misses_24h` - 24h miss count

### 2. Distributed Locking
Prevents cache stampede (multiple requests generating same content):
- Lock key: `{cache_key}:lock`
- TTL: 30 seconds
- First request acquires lock, others wait

### 3. Hash-Based Deduplication
Avoids duplicate work even when cache key differs:
```python
hash = SHA256(canonical_params + inputs)
if exists(f"generation:hash:{hash}"):
    return cached_generation
```

## Best Practices

### 1. Choose Appropriate Strategy
- **Tutorial content**: `once`
- **Branching narratives**: `per_playthrough`
- **Personalized cutscenes**: `per_player`
- **Live reactions**: `always`

### 2. Version Management
Bump version to invalidate cache for:
- Prompt changes
- Style updates
- Parameter adjustments

```typescript
const config = {
  strategy: "once",
  version: 2,  // Changed from 1 after prompt update
};
```

### 3. Cache Warming
Pre-generate common content before players need it:

```bash
# Warmup endpoint (when implemented)
POST /api/v1/generations/cache/warmup
{
  "playthrough_id": "new_playthrough_123",
  "scene_ids": ["scene_001", "scene_002", "scene_003"]
}
```

### 4. Monitor Cache Health
- Check hit rate regularly
- Alert on low hit rates (<60%)
- Monitor Redis memory usage
- Set up eviction policies

## Redis Configuration

### Recommended Settings
```
# Max memory (adjust based on load)
maxmemory 2gb

# Eviction policy (remove least recently used)
maxmemory-policy allkeys-lru

# Persistence (for cache recovery)
save 900 1
save 300 10
save 60 10000
```

### Key Expiration
Keys auto-expire based on strategy TTL:
- `once`: 31,536,000 seconds (365 days)
- `per_playthrough`: 7,776,000 seconds (90 days)
- `per_player`: 15,552,000 seconds (180 days)

## Troubleshooting

### High Cache Miss Rate
**Symptoms**: Cache hit rate < 60%

**Possible causes:**
1. Frequent version bumps
2. TTL too short
3. Cache key includes dynamic data (timestamps, etc.)
4. Redis memory full (evicting entries)

**Solutions:**
- Review version bump frequency
- Increase TTL if appropriate
- Ensure cache key is deterministic
- Increase Redis memory or adjust eviction policy

### Cache Stampede
**Symptoms**: Multiple identical generations created simultaneously

**Solution**: Distributed locking is implemented automatically
- First request acquires lock
- Subsequent requests wait
- Lock expires after 30s

### Stale Cache
**Symptoms**: Outdated content being served

**Solutions:**
```bash
# Invalidate specific key
curl -X DELETE http://localhost:8000/api/v1/generations/cache/{cacheKey}

# Or bump version
version: 2  # In generation config
```

## API Reference

### Cache Check
`POST /api/v1/generations/cache/check`
- Check if generation would be cached
- Returns cache key and cached status

### Cache Stats
`GET /api/v1/generations/cache/stats`
- View cache statistics
- Monitor hit rates

### Cache Invalidation
`DELETE /api/v1/generations/cache/{cacheKey}`
- Invalidate specific cache entry
- Use for manual cache busting

### Redis Health
`GET /api/health/redis`
- Check Redis connection
- Monitor latency

## Further Reading
- `docs/systems/generation/GENERATION_SYSTEM.md` - Overall system design
- `docs/APP_MAP_GENERATION.md` - Complete API reference
- `claude-tasks/10-unified-generation-pipeline-progress.md` - Implementation details

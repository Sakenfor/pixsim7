/**
 * Prompt Analysis Cache
 *
 * Module-level TTL cache for `/prompts/analyze` responses.
 * Shared between useShadowAnalysis (text mode) and seedBlocksFromPrompt
 * (blocks mode) to avoid redundant API calls for the same prompt text.
 *
 * Cache key: normalizedText + analyzerId (different analyzers may
 * produce different candidates).
 */
import type { PromptBlockCandidate } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface AnalysisResult {
  prompt: string;
  candidates: PromptBlockCandidate[];
  tags: Array<{ tag: string; candidates: number[]; source: string; confidence?: number }>;
}

interface CacheEntry {
  result: AnalysisResult;
  timestamp: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_TTL_MS = 90_000; // 90 seconds
const MAX_ENTRIES = 20;

// ─────────────────────────────────────────────────────────────────────────────
// Cache
// ─────────────────────────────────────────────────────────────────────────────

const cache = new Map<string, CacheEntry>();

function buildKey(text: string, analyzerId?: string): string {
  const normalizedText = text.trim();
  return analyzerId
    ? `${normalizedText}::${analyzerId}`
    : normalizedText;
}

function evictStale(ttl: number): void {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now - entry.timestamp > ttl) {
      cache.delete(key);
    }
  }
}

function evictOldest(): void {
  if (cache.size <= MAX_ENTRIES) return;

  // Find oldest entry
  let oldestKey: string | null = null;
  let oldestTime = Infinity;
  for (const [key, entry] of cache) {
    if (entry.timestamp < oldestTime) {
      oldestTime = entry.timestamp;
      oldestKey = key;
    }
  }
  if (oldestKey) cache.delete(oldestKey);
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get a cached analysis result if it exists and is not expired.
 */
export function getCachedAnalysis(
  text: string,
  analyzerId?: string,
  ttl: number = DEFAULT_TTL_MS,
): AnalysisResult | null {
  evictStale(ttl);
  const key = buildKey(text, analyzerId);
  const entry = cache.get(key);
  if (!entry) return null;

  const age = Date.now() - entry.timestamp;
  if (age > ttl) {
    cache.delete(key);
    return null;
  }

  return entry.result;
}

/**
 * Store an analysis result in the cache.
 */
export function setCachedAnalysis(
  text: string,
  analyzerId: string | undefined,
  result: AnalysisResult,
): void {
  const key = buildKey(text, analyzerId);
  cache.set(key, { result, timestamp: Date.now() });
  evictOldest();
}

/**
 * Clear all cached entries.
 */
export function clearAnalysisCache(): void {
  cache.clear();
}

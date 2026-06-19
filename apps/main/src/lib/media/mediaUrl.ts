/**
 * Media URL classification helpers.
 *
 * Single source of truth for "is this URL video/audio media" — previously
 * triplicated (useMediaThumbnail, useGenerationWebSocket, the asset model) and
 * already drifting: one copy carried a stray `i` flag, another omitted the
 * `data:` MIME check. Point new call sites here.
 */

/** Video/audio file extensions that can't serve as an <img> source. */
const VIDEO_AUDIO_EXT_RE = /\.(mp4|webm|mov|m4v|mkv|avi|mp3|wav|ogg|m4a|aac|flac)(?:$|[?#])/;

/**
 * True when `url` points at video/audio media — by file extension or by a
 * `data:video`/`data:audio` MIME prefix — and therefore can't be rendered as an
 * <img> thumbnail/poster. Null/empty input → false.
 */
export function isVideoOrAudioUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const lowered = url.toLowerCase();
  if (lowered.startsWith('data:video') || lowered.startsWith('data:audio')) return true;
  return VIDEO_AUDIO_EXT_RE.test(lowered);
}

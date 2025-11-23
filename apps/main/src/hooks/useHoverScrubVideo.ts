import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type RefObject,
} from 'react';

export function useHoverScrubVideo(videoRef: RefObject<HTMLVideoElement>) {
  const [isHovered, setIsHovered] = useState(false);
  const [hasStartedPlaying, setHasStartedPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1
  const containerRef = useRef<HTMLDivElement>(null);

  const onMouseEnter = useCallback(() => {
    setIsHovered(true);
    const v = videoRef.current;
    if (!v) return;
    v.muted = true;
    v.loop = true;
    v.currentTime = 0;
    v.play().then(() => setHasStartedPlaying(true)).catch(() => {});
  }, [videoRef]);

  const onMouseLeave = useCallback(() => {
    setIsHovered(false);
    const v = videoRef.current;
    if (!v) return;
    try {
      v.pause();
      v.currentTime = 0;
    } catch {
      // ignore
    }
    setProgress(0);
  }, [videoRef]);

  const onMouseMove = useCallback((e: MouseEvent) => {
    const v = videoRef.current;
    const el = containerRef.current;
    if (!v || !el || !hasStartedPlaying) return;
    const rect = el.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    if (isFinite(v.duration) && v.duration > 0) {
      v.currentTime = pct * v.duration;
      setProgress(pct);
    }
  }, [videoRef, hasStartedPlaying]);

  // keep progress in sync while playing normally too
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const handler = () => {
      if (isFinite(v.duration) && v.duration > 0) setProgress(v.currentTime / v.duration);
    };
    v.addEventListener('timeupdate', handler);
    return () => v.removeEventListener('timeupdate', handler);
  }, [videoRef]);

  return {
    containerRef,
    onMouseEnter,
    onMouseLeave,
    onMouseMove,
    isHovered,
    hasStartedPlaying,
    progress,
  };
}

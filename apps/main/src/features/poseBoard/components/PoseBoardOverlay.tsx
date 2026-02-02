/**
 * PoseBoardOverlay
 *
 * Compact pose board surface for the media viewer overlay.
 */

import { useEffect, useRef, useState } from 'react';

import { useGenerationScopeStores } from '@features/generation/hooks/useGenerationScope';

import { uploadPoseSnapshot } from '../lib/poseSnapshot';
import { usePoseBoardStore } from '../stores/poseBoardStore';

const CANVAS_WIDTH = 960;
const CANVAS_HEIGHT = 540;

export function PoseBoardOverlay() {
  const surfaceMode = usePoseBoardStore((s) => s.surfaceMode);
  const setSurfaceMode = usePoseBoardStore((s) => s.setSurfaceMode);
  const { useSessionStore } = useGenerationScopeStores();
  const providerId = useSessionStore((s) => s.providerId);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (surfaceMode !== '2d') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawPosePlaceholder(canvas);
  }, [surfaceMode]);

  const handleCapture = async () => {
    setStatus(null);

    if (surfaceMode !== '2d') {
      setStatus('3D snapshots are not wired yet.');
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      setStatus('Pose canvas is not ready.');
      return;
    }

    if (!providerId) {
      setStatus('Select a provider in Control Center to save snapshots.');
      return;
    }

    setIsSaving(true);
    try {
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((result) => {
          if (!result) {
            reject(new Error('Failed to capture pose snapshot.'));
            return;
          }
          resolve(result);
        }, 'image/png');
      });

      const result = await uploadPoseSnapshot({
        blob,
        providerId,
      });

      setStatus(
        result.assetId
          ? `Pose snapshot saved as asset ${result.assetId}.`
          : 'Pose snapshot saved.'
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save snapshot.';
      setStatus(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-neutral-900/40">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-neutral-700 text-xs">
        <span className="text-neutral-300 font-medium uppercase tracking-wide">
          Pose Board
        </span>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setSurfaceMode('2d')}
            className={`px-2 py-0.5 rounded ${
              surfaceMode === '2d'
                ? 'bg-blue-600 text-white'
                : 'bg-neutral-700 text-neutral-200 hover:bg-neutral-600'
            }`}
          >
            2D
          </button>
          <button
            onClick={() => setSurfaceMode('3d')}
            className={`px-2 py-0.5 rounded ${
              surfaceMode === '3d'
                ? 'bg-blue-600 text-white'
                : 'bg-neutral-700 text-neutral-200 hover:bg-neutral-600'
            }`}
          >
            3D
          </button>
        </div>

        <div className="ml-auto flex items-center gap-3 text-[10px] text-neutral-400">
          <span>Provider: {providerId || 'unset'}</span>
          <button
            onClick={handleCapture}
            disabled={isSaving}
            className="px-2 py-0.5 rounded bg-neutral-700 text-neutral-100 hover:bg-neutral-600 disabled:opacity-60"
          >
            {isSaving ? 'Saving...' : 'Save Snapshot'}
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 p-3">
        {surfaceMode === '2d' ? (
          <div className="h-full w-full rounded border border-neutral-700 bg-neutral-900/60">
            <canvas
              ref={canvasRef}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              className="w-full h-full"
            />
          </div>
        ) : (
          <div className="h-full w-full rounded border border-neutral-700 bg-gradient-to-b from-neutral-800 to-neutral-900 flex items-center justify-center text-neutral-400 text-sm">
            3D pose surface placeholder
          </div>
        )}
      </div>

      {status && (
        <div className="px-3 py-2 text-xs text-neutral-300 border-t border-neutral-800 bg-neutral-900/70">
          {status}
        </div>
      )}
    </div>
  );
}

function drawPosePlaceholder(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;

  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, width, height);

  // Grid
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.15)';
  ctx.lineWidth = 1;
  const grid = 40;
  for (let x = 0; x <= width; x += grid) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += grid) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // Stage line
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(width * 0.1, height * 0.75);
  ctx.lineTo(width * 0.9, height * 0.75);
  ctx.stroke();

  drawStickFigure(ctx, width * 0.35, height * 0.7, 1);
  drawStickFigure(ctx, width * 0.65, height * 0.7, 1);

  ctx.fillStyle = 'rgba(226, 232, 240, 0.8)';
  ctx.font = '14px monospace';
  ctx.fillText('Pose board sketch (placeholder)', 16, height - 16);
}

function drawStickFigure(
  ctx: CanvasRenderingContext2D,
  x: number,
  baseY: number,
  scale: number
) {
  const headRadius = 14 * scale;
  const bodyLength = 42 * scale;
  const armLength = 28 * scale;
  const legLength = 34 * scale;

  ctx.strokeStyle = 'rgba(248, 250, 252, 0.9)';
  ctx.lineWidth = 3;

  // Head
  ctx.beginPath();
  ctx.arc(x, baseY - bodyLength - headRadius, headRadius, 0, Math.PI * 2);
  ctx.stroke();

  // Body
  ctx.beginPath();
  ctx.moveTo(x, baseY - bodyLength);
  ctx.lineTo(x, baseY);
  ctx.stroke();

  // Arms
  ctx.beginPath();
  ctx.moveTo(x - armLength, baseY - bodyLength + 6 * scale);
  ctx.lineTo(x + armLength, baseY - bodyLength + 6 * scale);
  ctx.stroke();

  // Legs
  ctx.beginPath();
  ctx.moveTo(x, baseY);
  ctx.lineTo(x - armLength * 0.6, baseY + legLength);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x, baseY);
  ctx.lineTo(x + armLength * 0.6, baseY + legLength);
  ctx.stroke();
}

/**
 * Media transform helpers.
 *
 * Provides coordinate transforms between container (screen) space and
 * media (content) space using existing fit utilities.
 */

import type { Dimensions, FitMode, Point, Rect } from './types';
import { calculateFitRect, createCoordinateTransform } from './fit';

export interface MediaTransform {
  rect: Rect;
  toNormalized: (screen: Point) => Point;
  toScreen: (normalized: Point) => Point;
  toContent: (screen: Point) => Point;
  toScreenFromContent: (content: Point) => Point;
  screenRectToContentRect: (screenRect: Rect) => Rect;
  contentRectToScreenRect: (contentRect: Rect) => Rect;
}

export function createMediaTransform(
  container: Dimensions,
  content: Dimensions,
  fitMode: FitMode = 'contain'
): MediaTransform {
  const rect = calculateFitRect(container, content, fitMode);
  const { toNormalized, toScreen } = createCoordinateTransform(rect);

  const toContent = (screen: Point): Point => {
    const normalized = toNormalized(screen);
    return {
      x: normalized.x * content.width,
      y: normalized.y * content.height,
    };
  };

  const toScreenFromContent = (contentPoint: Point): Point => {
    return toScreen({
      x: contentPoint.x / content.width,
      y: contentPoint.y / content.height,
    });
  };

  const screenRectToContentRect = (screenRect: Rect): Rect => {
    const topLeft = toContent({ x: screenRect.x, y: screenRect.y });
    const bottomRight = toContent({
      x: screenRect.x + screenRect.width,
      y: screenRect.y + screenRect.height,
    });
    return {
      x: topLeft.x,
      y: topLeft.y,
      width: bottomRight.x - topLeft.x,
      height: bottomRight.y - topLeft.y,
    };
  };

  const contentRectToScreenRect = (contentRect: Rect): Rect => {
    const topLeft = toScreenFromContent({ x: contentRect.x, y: contentRect.y });
    const bottomRight = toScreenFromContent({
      x: contentRect.x + contentRect.width,
      y: contentRect.y + contentRect.height,
    });
    return {
      x: topLeft.x,
      y: topLeft.y,
      width: bottomRight.x - topLeft.x,
      height: bottomRight.y - topLeft.y,
    };
  };

  return {
    rect,
    toNormalized,
    toScreen,
    toContent,
    toScreenFromContent,
    screenRectToContentRect,
    contentRectToScreenRect,
  };
}

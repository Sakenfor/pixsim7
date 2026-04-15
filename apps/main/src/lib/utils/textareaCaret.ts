/**
 * textareaCaret — measure the pixel position of a character index inside
 * a <textarea>. Used to anchor floating UI (e.g. @mention popups) to a
 * specific caret position.
 *
 * Technique: build an off-screen mirror <div> that exactly duplicates the
 * textarea's font, padding, border, and wrapping. Insert the text up to the
 * target index, then append a marker span. The marker's offsetTop/offsetLeft
 * give us the coords inside the textarea's content area, corrected for
 * scroll offset.
 *
 * Derived from the well-known approach by Jonathan Ong (textarea-caret-position).
 * Inlined to avoid a dependency and keep it small and self-contained.
 */

// Style properties we must mirror for a faithful measurement.
const MIRROR_PROPERTIES: Array<keyof CSSStyleDeclaration> = [
  'direction',
  'boxSizing',
  'width',
  'height',
  'overflowX',
  'overflowY',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderStyle',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'fontStyle',
  'fontVariant',
  'fontWeight',
  'fontStretch',
  'fontSize',
  'fontSizeAdjust',
  'lineHeight',
  'fontFamily',
  'textAlign',
  'textTransform',
  'textIndent',
  'textDecoration',
  'letterSpacing',
  'wordSpacing',
  'tabSize',
  'whiteSpace',
  'wordWrap',
  'wordBreak',
];

export interface CaretCoords {
  /** Top offset of the caret within the textarea's coordinate system (px). */
  top: number;
  /** Left offset of the caret within the textarea's coordinate system (px). */
  left: number;
  /** Approximate line height at the caret (px) — handy for popup placement. */
  height: number;
}

/**
 * Return caret coordinates relative to the textarea element (top-left origin).
 * Add the textarea's getBoundingClientRect() top/left to convert to viewport.
 */
export function getTextareaCaretCoords(
  textarea: HTMLTextAreaElement,
  index: number,
): CaretCoords {
  const doc = textarea.ownerDocument;
  const win = doc.defaultView ?? window;

  const mirror = doc.createElement('div');
  mirror.id = '__textarea_caret_mirror__';
  const style = mirror.style;

  // Position the mirror off-screen but in the DOM so computed styles apply.
  style.whiteSpace = 'pre-wrap';
  style.wordWrap = 'break-word';
  style.position = 'absolute';
  style.visibility = 'hidden';
  style.top = '0';
  style.left = '-9999px';

  const computed = win.getComputedStyle(textarea);
  for (const prop of MIRROR_PROPERTIES) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (style as any)[prop] = computed[prop];
  }

  // Firefox reports width differently — handled implicitly by copying width.
  mirror.textContent = textarea.value.substring(0, index);

  const marker = doc.createElement('span');
  // A non-empty character so the span has measurable box metrics, matching
  // what would render if the caret were at this position.
  marker.textContent = textarea.value.substring(index) || '.';
  mirror.appendChild(marker);

  doc.body.appendChild(mirror);
  const coords: CaretCoords = {
    top: marker.offsetTop - textarea.scrollTop,
    left: marker.offsetLeft - textarea.scrollLeft,
    height: parseInt(computed.lineHeight, 10) || parseInt(computed.fontSize, 10) * 1.2,
  };
  doc.body.removeChild(mirror);

  return coords;
}

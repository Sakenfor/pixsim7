/**
 * Centralized z-index scale for the entire application.
 *
 * All z-index values should reference this module instead of hardcoding
 * numbers. The Tailwind preset in packages/shared/config mirrors these
 * values as utility classes (z-modal, z-popover, z-float-panel, etc.).
 *
 * Layer ordering (lowest → highest):
 *
 *   base           0       Default stacking
 *   dropdown      50       Dropdowns, inline popovers
 *   sticky       100       Sticky headers, toolbars
 *   fixed        500       Fixed UI elements
 *   modalBackdrop 1000     Modal backdrops (below floating panels)
 *   modal        1001      Modals (below floating panels)
 *   popover      1002      Popovers over modals
 *   tooltip      1003      Tooltips
 *   ─── floating panel boundary ───
 *   floatDropZone 10099    Drop-zone overlay (below floating panels)
 *   floatPanel   10100     Floating panels base (+ panel.zIndex for stacking)
 *   floatOverlay 10200     Overlays above floating panels (context menus,
 *                          popovers, advanced settings, cube widget)
 *   floatOverlayPopover 10201  Popovers from within float-overlay elements
 *   ─── top-level blocking UI ───
 *   globalBackdrop 10300   Modal backdrop that covers everything
 *   globalModal   10301    Modals/confirmation dialogs (always visible)
 *   globalToast   10400    Toast notifications (always on top)
 */
export const Z = {
  base: 0,
  dropdown: 50,
  sticky: 100,
  fixed: 500,

  // Standard UI layers (below floating panels)
  modalBackdrop: 1000,
  modal: 1001,
  popover: 1002,
  tooltip: 1003,

  // Floating panel system
  floatDropZone: 10099,
  floatPanel: 10100,

  // Above floating panels
  floatOverlay: 10200,
  floatOverlayPopover: 10201,

  // Top-level blocking UI (always above everything)
  globalBackdrop: 10300,
  globalModal: 10301,
  globalToast: 10400,
} as const;

export type ZLayer = keyof typeof Z;

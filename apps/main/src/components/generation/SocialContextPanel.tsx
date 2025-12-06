/**
 * Social Context Panel for Generation Nodes
 *
 * Displays relationship/intimacy context for generation nodes in the editor.
 * Shows how social metrics influence content generation.
 *
 * @status REFERENCE_IMPLEMENTATION
 * This component is not yet integrated into the generation node editor.
 * It serves as documentation and reference for future UI integration.
 * See docs/systems/generation/GENERATION_SYSTEM.md for generation system roadmap.
 */

import React from 'react';
import type { GenerationSocialContext } from '@pixsim7/shared.types';

interface SocialContextPanelProps {
  /**
   * Social context to display
   * If undefined, shows "No relationship context"
   */
  socialContext?: GenerationSocialContext;

  /**
   * Whether this panel is read-only or allows editing
   * Default: true (read-only)
   */
  readOnly?: boolean;

  /**
   * Callback when user requests to configure social context
   * Only called if readOnly is false
   */
  onConfigure?: () => void;
}

/**
 * Get display color for intimacy band
 */
function getIntimacyBandColor(band: string | undefined): string {
  switch (band) {
    case 'none':
      return 'text-gray-500';
    case 'light':
      return 'text-pink-400';
    case 'deep':
      return 'text-pink-600';
    case 'intense':
      return 'text-red-600';
    default:
      return 'text-gray-400';
  }
}

/**
 * Get display color for content rating
 */
function getContentRatingColor(rating: string | undefined): string {
  switch (rating) {
    case 'sfw':
      return 'text-green-600';
    case 'romantic':
      return 'text-blue-600';
    case 'mature_implied':
      return 'text-orange-600';
    case 'restricted':
      return 'text-red-600';
    default:
      return 'text-gray-400';
  }
}

/**
 * Get display label for intimacy band
 */
function getIntimacyBandLabel(band: string | undefined): string {
  switch (band) {
    case 'none':
      return 'No intimacy';
    case 'light':
      return 'Light (flirting)';
    case 'deep':
      return 'Deep (romantic)';
    case 'intense':
      return 'Intense (very intimate)';
    default:
      return 'Unknown';
  }
}

/**
 * Get display label for content rating
 */
function getContentRatingLabel(rating: string | undefined): string {
  switch (rating) {
    case 'sfw':
      return 'Safe for Work';
    case 'romantic':
      return 'Romantic';
    case 'mature_implied':
      return 'Mature (implied)';
    case 'restricted':
      return 'Restricted';
    default:
      return 'Unknown';
  }
}

/**
 * Social Context Panel Component
 *
 * Displays social/relationship context for a generation node.
 * Can be embedded in the generation node side panel or editor.
 *
 * @example
 * ```tsx
 * // In generation node side panel
 * <SocialContextPanel
 *   socialContext={node.config.socialContext}
 *   readOnly={true}
 * />
 * ```
 *
 * @example
 * ```tsx
 * // Editable version with configuration callback
 * <SocialContextPanel
 *   socialContext={currentSocialContext}
 *   readOnly={false}
 *   onConfigure={() => openSocialContextConfig()}
 * />
 * ```
 */
export function SocialContextPanel({
  socialContext,
  readOnly = true,
  onConfigure,
}: SocialContextPanelProps) {
  // If no social context, show placeholder
  if (!socialContext) {
    return (
      <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-gray-700">Social Context</h3>
          {!readOnly && onConfigure && (
            <button
              onClick={onConfigure}
              className="text-xs text-blue-600 hover:text-blue-700"
            >
              Configure
            </button>
          )}
        </div>
        <p className="text-sm text-gray-500">No relationship context</p>
        <p className="text-xs text-gray-400 mt-1">
          This generation will use default safe content
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg p-4 border border-gray-300 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-800">Social Context</h3>
        {!readOnly && onConfigure && (
          <button
            onClick={onConfigure}
            className="text-xs text-blue-600 hover:text-blue-700 font-medium"
          >
            Edit
          </button>
        )}
      </div>

      <div className="space-y-3">
        {/* Intimacy Band */}
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">
            Intimacy Band
          </label>
          <div className="flex items-center gap-2">
            <span
              className={`px-2 py-1 rounded text-sm font-medium ${getIntimacyBandColor(
                socialContext.intimacyBand
              )} bg-gray-50 border border-gray-200`}
            >
              {getIntimacyBandLabel(socialContext.intimacyBand)}
            </span>
          </div>
        </div>

        {/* Content Rating */}
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">
            Content Rating
          </label>
          <div className="flex items-center gap-2">
            <span
              className={`px-2 py-1 rounded text-sm font-medium ${getContentRatingColor(
                socialContext.contentRating
              )} bg-gray-50 border border-gray-200`}
            >
              {getContentRatingLabel(socialContext.contentRating)}
            </span>
          </div>
        </div>

        {/* Relationship Details */}
        {(socialContext.relationshipTierId || socialContext.intimacyLevelId) && (
          <div className="pt-2 border-t border-gray-200">
            <label className="text-xs font-medium text-gray-600 block mb-2">
              Relationship Details
            </label>
            <div className="space-y-1">
              {socialContext.relationshipTierId && (
                <div className="flex justify-between text-xs">
                  <span className="text-gray-600">Tier:</span>
                  <span className="text-gray-800 font-medium">
                    {socialContext.relationshipTierId}
                  </span>
                </div>
              )}
              {socialContext.intimacyLevelId && (
                <div className="flex justify-between text-xs">
                  <span className="text-gray-600">Intimacy Level:</span>
                  <span className="text-gray-800 font-medium">
                    {socialContext.intimacyLevelId}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* NPC IDs */}
        {socialContext.npcIds && socialContext.npcIds.length > 0 && (
          <div className="pt-2 border-t border-gray-200">
            <label className="text-xs font-medium text-gray-600 block mb-1">
              Involves NPCs
            </label>
            <div className="flex gap-1 flex-wrap">
              {socialContext.npcIds.map((npcId) => (
                <span
                  key={npcId}
                  className="px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-700"
                >
                  NPC {npcId}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Info note */}
      <div className="mt-3 pt-3 border-t border-gray-200">
        <p className="text-xs text-gray-500">
          This context is derived from relationship metrics and influences generated content.
        </p>
      </div>
    </div>
  );
}

/**
 * Compact Social Context Badge
 *
 * Minimal display for showing social context on the node itself
 * (not in the side panel).
 *
 * @example
 * ```tsx
 * // On generation node
 * <SocialContextBadge socialContext={node.config.socialContext} />
 * ```
 */
export function SocialContextBadge({
  socialContext,
}: {
  socialContext?: GenerationSocialContext;
}) {
  if (!socialContext) {
    return null;
  }

  const rating = socialContext.contentRating || 'sfw';
  const color = getContentRatingColor(rating);

  return (
    <div
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${color} bg-gray-50 border border-gray-200`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {rating.toUpperCase()}
    </div>
  );
}

export default SocialContextPanel;

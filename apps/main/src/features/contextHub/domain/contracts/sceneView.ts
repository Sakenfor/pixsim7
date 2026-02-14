import type {
  CapabilityCompatibilityResult,
  CapabilityContract,
} from "@pixsim7/shared.capabilities.core/contract";
import type { SceneViewContentType } from "@lib/plugins/sceneViewPlugin";

import { CAP_SCENE_VIEW } from "../capabilityKeys";

export type SceneViewOffer = {
  contentTypes: SceneViewContentType[];
  panelCount?: number;
  hasSession?: boolean;
};

export type SceneViewRequirement = {
  contentTypes: SceneViewContentType[];
  requireSession?: boolean;
};

export function checkSceneViewCompatibility(
  offer: SceneViewOffer,
  requirement: SceneViewRequirement,
): CapabilityCompatibilityResult {
  if (requirement.contentTypes.length > 0) {
    const intersection = requirement.contentTypes.filter(ct =>
      offer.contentTypes.includes(ct),
    );
    if (intersection.length === 0) {
      return {
        ok: false,
        reason: `No matching content types. Offered: ${offer.contentTypes.join(", ")}; required: ${requirement.contentTypes.join(", ")}.`,
      };
    }
  }

  if (requirement.requireSession && !offer.hasSession) {
    return { ok: false, reason: "Scene view requires an active session." };
  }

  return { ok: true };
}

export const sceneViewContract: CapabilityContract<SceneViewOffer, SceneViewRequirement> = {
  key: CAP_SCENE_VIEW,
  version: 1,
  describeOffer: (offer) => {
    const types = offer.contentTypes.join(", ") || "none";
    return `Content: ${types}${offer.panelCount != null ? ` (${offer.panelCount} panels)` : ""}`;
  },
  describeRequirement: (requirement) =>
    `Needs content types: ${requirement.contentTypes.join(", ") || "any"}`,
  isCompatible: checkSceneViewCompatibility,
};

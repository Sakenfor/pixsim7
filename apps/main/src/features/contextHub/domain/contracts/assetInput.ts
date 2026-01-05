import { resolveMediaTypes } from "@pixsim7/shared.assets-core";
import type { AssetRef } from "@pixsim7/shared.types";

import type { ViewerAsset } from "@features/assets";

import { CAP_ASSET_INPUT } from "../capabilityKeys";

import type { CapabilityCompatibilityResult, CapabilityContract } from "./index";

export type AssetInputSelection = {
  count: number;
  min: number;
  max: number;
  mode: "single" | "multi";
};

export type AssetInputConstraints = {
  types?: Array<"image" | "video">;
  canMixTypes?: boolean;
};

export type AssetInputStatus = {
  ready: boolean;
  reason?: string;
};

export type AssetInputOffer = {
  assets: ViewerAsset[];
  refs?: AssetRef[];
  selection?: AssetInputSelection;
  constraints?: AssetInputConstraints;
  status?: AssetInputStatus;
};

export type AssetInputRequirement = {
  minCount: number;
  maxCount?: number;
  allowedTypes?: Array<"image" | "video">;
  allowMixedTypes?: boolean;
};

function getAssetTypes(assets: ViewerAsset[]): Array<"image" | "video"> {
  return resolveMediaTypes(assets).filter(
    (type): type is "image" | "video" => type === "image" || type === "video",
  );
}

export function checkAssetInputCompatibility(
  offer: AssetInputOffer,
  requirement: AssetInputRequirement,
): CapabilityCompatibilityResult {
  if (offer.status && !offer.status.ready) {
    return { ok: false, reason: offer.status.reason ?? "Asset input not ready." };
  }

  const count = offer.selection?.count ?? offer.assets.length;
  if (count < requirement.minCount) {
    return {
      ok: false,
      reason: `Needs at least ${requirement.minCount} asset(s); got ${count}.`,
    };
  }

  if (typeof requirement.maxCount === "number" && count > requirement.maxCount) {
    return {
      ok: false,
      reason: `Needs at most ${requirement.maxCount} asset(s); got ${count}.`,
    };
  }

  if (requirement.allowedTypes && requirement.allowedTypes.length > 0) {
    const assetTypes = getAssetTypes(offer.assets);
    const unmatched = assetTypes.filter(
      (type) => !requirement.allowedTypes?.includes(type),
    );
    if (unmatched.length > 0) {
      return {
        ok: false,
        reason: `Unsupported asset type(s): ${unmatched.join(", ")}.`,
      };
    }
  }

  if (requirement.allowMixedTypes === false) {
    const assetTypes = getAssetTypes(offer.assets);
    if (assetTypes.length > 1) {
      return { ok: false, reason: "Mixed asset types are not allowed." };
    }
  }

  return { ok: true };
}

export const assetInputContract: CapabilityContract<AssetInputOffer, AssetInputRequirement> = {
  key: CAP_ASSET_INPUT,
  version: 1,
  describeOffer: (offer) => {
    const count = offer.selection?.count ?? offer.assets.length;
    const mode = offer.selection?.mode ?? "single";
    return `${count} assets (${mode})`;
  },
  describeRequirement: (requirement) =>
    `Needs ${requirement.minCount}-${requirement.maxCount ?? "inf"} assets`,
  isCompatible: checkAssetInputCompatibility,
};

// Auto-generated from latin prompt-pack domains metadata - DO NOT EDIT
// Re-run: pnpm latin-enhancer-domains:gen
//
// Sources:
//   - tools/cue/prompt_packs/latin_*.cue (domain tags)
//   - pixsim7/backend/main/plugins/cue_packs/vocabularies/latin_enhancer_domains.yaml (UI metadata)

/**
 * All discovered latin-enhancer domain tags from CUE prompt packs.
 */
export const LATIN_ENHANCER_DOMAINS = ["alignment","anatomy","animal_dynamics","body","breast","breath","canine","chest","claim_dynamics","connector","creature_generic","creature_neutral_anatomy","dominance","embrace","eyes","gaze","gluteal","hand_contact","hierarchy","hip","kiss","lips","motion_mechanics","mouth","mouthing","oral","partial_pin","pattern","paw_pin","pelvis","pin","play_dynamics","pose","position","positioning","pre_contact","proximity","reproductive","restraint","rhetoric","rhythm","scruff","sensory","sound","submission","tempo","threat_without_harm","torso","touch","voice"] as const;

export type LatinEnhancerDomain = typeof LATIN_ENHANCER_DOMAINS[number];

/**
 * Preferred domain order for the Latin Composer chips.
 */
export const LATIN_COMPOSER_DOMAINS = ["touch","gluteal","hand_contact","oral","mouth","lips","kiss","gaze","breath","voice","eyes","chest","breast","torso","embrace"] as const satisfies readonly LatinEnhancerDomain[];

/**
 * Allowed color tokens for latin domain UI chips.
 */
export const LATIN_ENHANCER_DOMAIN_COLOR_TOKENS = ["blue","green","purple","yellow","pink","cyan","orange","gray","amber","red","slate"] as const;

export type LatinEnhancerDomainColor = typeof LATIN_ENHANCER_DOMAIN_COLOR_TOKENS[number];

/**
 * Latin domain -> color token mapping.
 */
export const LATIN_ENHANCER_DOMAIN_COLORS = {
  "alignment": "green",
  "anatomy": "red",
  "animal_dynamics": "amber",
  "body": "green",
  "breast": "purple",
  "breath": "blue",
  "canine": "orange",
  "chest": "purple",
  "claim_dynamics": "amber",
  "connector": "slate",
  "creature_generic": "red",
  "creature_neutral_anatomy": "orange",
  "dominance": "red",
  "embrace": "purple",
  "eyes": "blue",
  "gaze": "blue",
  "gluteal": "cyan",
  "hand_contact": "cyan",
  "hierarchy": "red",
  "hip": "green",
  "kiss": "pink",
  "lips": "pink",
  "motion_mechanics": "green",
  "mouth": "pink",
  "mouthing": "amber",
  "oral": "pink",
  "partial_pin": "amber",
  "pattern": "green",
  "paw_pin": "amber",
  "pelvis": "green",
  "pin": "amber",
  "play_dynamics": "amber",
  "pose": "green",
  "position": "green",
  "positioning": "green",
  "pre_contact": "green",
  "proximity": "green",
  "reproductive": "red",
  "restraint": "amber",
  "rhetoric": "slate",
  "rhythm": "green",
  "scruff": "amber",
  "sensory": "green",
  "sound": "green",
  "submission": "red",
  "tempo": "green",
  "threat_without_harm": "red",
  "torso": "purple",
  "touch": "cyan",
  "voice": "blue"
} as const satisfies Record<LatinEnhancerDomain, LatinEnhancerDomainColor>;

/**
 * Latin domain -> source CUE pack IDs where the domain appears.
 */
export const LATIN_ENHANCER_DOMAIN_SOURCES = {
  "alignment": [
    "latin_alignment_dynamics"
  ],
  "anatomy": [
    "latin_repro_organ"
  ],
  "animal_dynamics": [
    "latin_canine_pin_dynamics",
    "latin_pin_dynamics"
  ],
  "body": [
    "latin_body_pose"
  ],
  "breast": [
    "latin_chest_torso"
  ],
  "breath": [
    "latin_breath_pattern",
    "latin_breath_proximity",
    "latin_gaze_breath"
  ],
  "canine": [
    "latin_canine_dominance_dynamics",
    "latin_canine_mouthing_dynamics",
    "latin_canine_paw_pin_dynamics",
    "latin_canine_pin_dynamics",
    "latin_canine_scruff_dynamics",
    "latin_canine_submission_dynamics"
  ],
  "chest": [
    "latin_chest_torso"
  ],
  "claim_dynamics": [
    "latin_canine_paw_pin_dynamics"
  ],
  "connector": [
    "latin_connectors"
  ],
  "creature_generic": [
    "latin_repro_organ"
  ],
  "creature_neutral_anatomy": [
    "latin_canine_dominance_dynamics",
    "latin_canine_mouthing_dynamics",
    "latin_canine_paw_pin_dynamics",
    "latin_canine_scruff_dynamics",
    "latin_canine_submission_dynamics"
  ],
  "dominance": [
    "latin_canine_dominance_dynamics"
  ],
  "embrace": [
    "latin_chest_torso"
  ],
  "eyes": [
    "latin_gaze_breath"
  ],
  "gaze": [
    "latin_gaze_breath"
  ],
  "gluteal": [
    "latin_touch_dynamics"
  ],
  "hand_contact": [
    "latin_touch_dynamics"
  ],
  "hierarchy": [
    "latin_canine_dominance_dynamics",
    "latin_canine_submission_dynamics"
  ],
  "hip": [
    "latin_hip_motion"
  ],
  "kiss": [
    "latin_lips_mouth"
  ],
  "lips": [
    "latin_lips_mouth"
  ],
  "motion_mechanics": [
    "latin_hip_motion"
  ],
  "mouth": [
    "latin_lips_mouth"
  ],
  "mouthing": [
    "latin_canine_mouthing_dynamics"
  ],
  "oral": [
    "latin_lips_mouth"
  ],
  "partial_pin": [
    "latin_canine_mouthing_dynamics",
    "latin_canine_paw_pin_dynamics",
    "latin_canine_scruff_dynamics"
  ],
  "pattern": [
    "latin_breath_pattern",
    "latin_rhythm_pattern",
    "latin_voice_pattern"
  ],
  "paw_pin": [
    "latin_canine_paw_pin_dynamics"
  ],
  "pelvis": [
    "latin_hip_motion"
  ],
  "pin": [
    "latin_canine_pin_dynamics",
    "latin_pin_dynamics"
  ],
  "play_dynamics": [
    "latin_canine_scruff_dynamics"
  ],
  "pose": [
    "latin_body_pose"
  ],
  "position": [
    "latin_body_pose"
  ],
  "positioning": [
    "latin_alignment_dynamics"
  ],
  "pre_contact": [
    "latin_alignment_dynamics"
  ],
  "proximity": [
    "latin_breath_proximity"
  ],
  "reproductive": [
    "latin_repro_organ"
  ],
  "restraint": [
    "latin_canine_pin_dynamics",
    "latin_pin_dynamics"
  ],
  "rhetoric": [
    "latin_connectors"
  ],
  "rhythm": [
    "latin_breath_pattern",
    "latin_rhythm_pattern"
  ],
  "scruff": [
    "latin_canine_scruff_dynamics"
  ],
  "sensory": [
    "latin_breath_proximity"
  ],
  "sound": [
    "latin_voice_pattern"
  ],
  "submission": [
    "latin_canine_submission_dynamics"
  ],
  "tempo": [
    "latin_rhythm_pattern"
  ],
  "threat_without_harm": [
    "latin_canine_mouthing_dynamics"
  ],
  "torso": [
    "latin_chest_torso"
  ],
  "touch": [
    "latin_touch_dynamics"
  ],
  "voice": [
    "latin_gaze_breath",
    "latin_voice_pattern"
  ]
} as const satisfies Record<LatinEnhancerDomain, readonly string[]>;

export function isLatinEnhancerDomain(value: string): value is LatinEnhancerDomain {
  return (LATIN_ENHANCER_DOMAINS as readonly string[]).includes(value);
}

package promptpacks

pack: #PromptBlockPackV1 & {
	version:      "1.0.0"
	package_name: "core_subject_action"
	defaults: {
		is_public: true
		source:    "system"
	}
	groups: [
		{id: "react",   title: "React"},
		{id: "gesture", title: "Gesture"},
		{id: "reach",   title: "Reach"},
		{id: "contact", title: "Contact"},
		{id: "release", title: "Release"},
	]
	blocks: [

		// ── react ─────────────────────────────────────────────────────────────
		// Responsive body reactions — solo or in-response-to a target.
		// Neither social signaling nor physical contact — purely reactive.
		{
			id:    "react"
			group: "react"
			block_schema: {
				id_prefix:    "core.subject.action.react"
				category:     "character_pose"
				capabilities: ["subject.action", "subject.action.react"]
				text_template: "React token: {variant}."
				tags: {
					modifier_family:  "subject_action_react"
					modality_support: "both"
					temporal:         "dynamic"
				}
				op: {
					op_id:        "subject.action.perform"
					signature_id: "subject.action.v1"
					modalities: ["both"]
					refs: [
						{key: "subject", capability: "subject", required: false},
						{key: "target",  capability: "target",  required: false},
					]
					params: #SubjectActionParams + [
						{key: "target_ref", type: "ref", required: false, ref_capability: "target"},
					]
					default_args: {
						action_verb:        "react"
						target_involvement: "none"
						intensity:          "medium"
						body_region:        "upper_body"
					}
				}
				variants: [
					{
						key: "react_strong"
						tags: {
							action_synonyms: ["flinches", "startled", "recoils", "sharp reaction", "steps back"]
						}
						op_args: {
							action_verb:        "react"
							target_involvement: "none"
							intensity:          "high"
							body_region:        "full_body"
						}
					},
					{
						key: "react_subtle"
						tags: {
							action_synonyms: ["subtle reaction", "slight flinch", "faint response", "small recoil"]
						}
						op_args: {
							action_verb:        "react"
							target_involvement: "none"
							intensity:          "low"
							body_region:        "upper_body"
						}
					},
					{
						key: "react_to_target"
						tags: {
							action_synonyms: ["reacts to", "responds to", "recoils from", "startled by", "reacts toward"]
						}
						op_args: {
							action_verb:        "react"
							target_involvement: "indirect"
							intensity:          "medium"
							body_region:        "upper_body"
						}
					},
				]
			}
		},

		// ── gesture ───────────────────────────────────────────────────────────
		// Social and expressive body signals — wave, beckon, orient toward.
		// No physical contact goal. Natural home for social/romance signaling.
		{
			id:    "gesture"
			group: "gesture"
			block_schema: {
				id_prefix:    "core.subject.action.gesture"
				category:     "character_pose"
				capabilities: ["subject.action", "subject.action.gesture"]
				text_template: "Gesture token: {variant}."
				tags: {
					modifier_family:  "subject_action_gesture"
					modality_support: "both"
					temporal:         "dynamic"
				}
				op: {
					op_id:        "subject.action.perform"
					signature_id: "subject.action.v1"
					modalities: ["both"]
					refs: [
						{key: "subject", capability: "subject", required: false},
						{key: "target",  capability: "target",  required: false},
					]
					params: #SubjectActionParams + [
						{key: "target_ref", type: "ref", required: false, ref_capability: "target"},
					]
					default_args: {
						action_verb:        "gesture"
						target_involvement: "none"
						intensity:          "medium"
						body_region:        "arms"
					}
				}
				variants: [
					{
						key: "gesture_expressive"
						tags: {
							action_synonyms: ["gestures", "gesturing", "expressive gesture", "hand gesture", "waves hand"]
						}
						op_args: {
							action_verb:        "gesture"
							target_involvement: "none"
							intensity:          "medium"
							body_region:        "arms"
						}
					},
					{
						key: "turn_to_face"
						tags: {
							action_synonyms: ["turns toward", "turns to face", "pivots to", "faces toward", "orients toward"]
						}
						op_args: {
							action_verb:        "turn_to"
							target_involvement: "indirect"
							intensity:          "medium"
							body_region:        "full_body"
						}
					},
					{
						key: "beckon"
						tags: {
							action_synonyms: ["beckons", "beckoning", "waves over", "motions toward", "invites closer"]
						}
						op_args: {
							action_verb:        "gesture"
							target_involvement: "indirect"
							intensity:          "low"
							body_region:        "arms"
						}
					},
				]
			}
		},

		// ── reach ─────────────────────────────────────────────────────────────
		// Spatial extension of body toward an object or person.
		// Contact not yet made — this is the bridge between gesture and contact.
		// Natural entry point for object interaction and romance/explicit escalation.
		{
			id:    "reach"
			group: "reach"
			block_schema: {
				id_prefix:    "core.subject.action.reach"
				category:     "character_pose"
				capabilities: ["subject.action", "subject.action.reach"]
				text_template: "Reach token: {variant}."
				tags: {
					modifier_family:  "subject_action_reach"
					modality_support: "both"
					temporal:         "dynamic"
				}
				op: {
					op_id:        "subject.action.perform"
					signature_id: "subject.action.v1"
					modalities: ["both"]
					refs: [
						{key: "subject", capability: "subject", required: false},
						{key: "target",  capability: "target",  required: false},
					]
					params: #SubjectActionParams + [
						{key: "target_ref", type: "ref", required: false, ref_capability: "target"},
					]
					default_args: {
						action_verb:        "reach"
						target_involvement: "indirect"
						intensity:          "medium"
						body_region:        "arms"
					}
				}
				variants: [
					{
						key: "reach_extend"
						tags: {
							action_synonyms: ["reaches out", "extends arm", "stretches out", "outstretches arm"]
						}
						op_args: {
							action_verb:        "reach"
							target_involvement: "none"
							intensity:          "medium"
							body_region:        "arms"
						}
					},
					{
						key: "reach_toward"
						tags: {
							action_synonyms: ["reaches toward", "extends toward", "stretches toward", "arm out toward"]
						}
						op_args: {
							action_verb:        "reach"
							target_involvement: "indirect"
							intensity:          "medium"
							body_region:        "arms"
						}
					},
					{
						key: "reach_full_body"
						tags: {
							action_synonyms: ["leans in toward", "full body reach", "leans toward", "stretches body toward"]
						}
						op_args: {
							action_verb:        "reach"
							target_involvement: "indirect"
							intensity:          "medium"
							body_region:        "full_body"
						}
					},
				]
			}
		},

		// ── contact ───────────────────────────────────────────────────────────
		// Direct physical contact with a target — target ref is required.
		// Domain packs (romance, explicit, combat) extend this block's variants;
		// the signature stays the same, only the variant set grows.
		{
			id:    "contact"
			group: "contact"
			block_schema: {
				id_prefix:    "core.subject.action.contact"
				category:     "character_pose"
				capabilities: ["subject.action", "subject.action.contact"]
				text_template: "Contact token: {variant}."
				tags: {
					modifier_family:  "subject_action_contact"
					modality_support: "both"
					temporal:         "dynamic"
				}
				op: {
					op_id:        "subject.action.perform"
					signature_id: "subject.action.v1"
					modalities: ["both"]
					refs: [
						{key: "subject", capability: "subject", required: false},
						{key: "target",  capability: "target",  required: true},
					]
					params: #SubjectActionParams + [
						{key: "target_ref", type: "ref", required: false, ref_capability: "target"},
					]
					default_args: {
						action_verb:        "grasp"
						target_involvement: "direct"
						intensity:          "medium"
						body_region:        "hands"
					}
				}
				variants: [
					{
						key: "grasp"
						tags: {
							action_synonyms: ["grabs", "grasps", "grips", "takes hold of", "clutches"]
						}
						op_args: {
							action_verb:        "grasp"
							target_involvement: "direct"
							intensity:          "medium"
							body_region:        "hands"
						}
					},
					{
						key: "grasp_firm"
						tags: {
							action_synonyms: ["grips firmly", "tight grip", "firm grasp", "holds tight"]
						}
						op_args: {
							action_verb:        "grasp"
							target_involvement: "direct"
							intensity:          "high"
							body_region:        "hands"
						}
					},
					{
						key: "pull_toward"
						tags: {
							action_synonyms: ["pulls toward", "draws in", "pulls closer", "draws closer"]
						}
						op_args: {
							action_verb:        "pull"
							target_involvement: "direct"
							intensity:          "medium"
							body_region:        "arms"
						}
					},
					{
						key: "push_away"
						tags: {
							action_synonyms: ["pushes away", "shoves", "pushes back", "drives away"]
						}
						op_args: {
							action_verb:        "push"
							target_involvement: "direct"
							intensity:          "medium"
							body_region:        "arms"
						}
					},
					{
						key: "lift"
						tags: {
							action_synonyms: ["lifts", "raises", "picks up", "hoists", "elevates"]
						}
						op_args: {
							action_verb:        "lift"
							target_involvement: "direct"
							intensity:          "medium"
							body_region:        "arms"
						}
					},
					{
						key: "embrace"
						tags: {
							action_synonyms: ["embraces", "hugs", "holds close", "wraps arms around", "pulls into arms"]
						}
						op_args: {
							action_verb:        "embrace"
							target_involvement: "direct"
							intensity:          "medium"
							body_region:        "full_body"
						}
					},
				]
			}
		},

		// ── release ───────────────────────────────────────────────────────────
		// Ending or easing physical contact — letting go, setting down, guiding away.
		{
			id:    "release"
			group: "release"
			block_schema: {
				id_prefix:    "core.subject.action.release"
				category:     "character_pose"
				capabilities: ["subject.action", "subject.action.release"]
				text_template: "Release token: {variant}."
				tags: {
					modifier_family:  "subject_action_release"
					modality_support: "both"
					temporal:         "dynamic"
				}
				op: {
					op_id:        "subject.action.perform"
					signature_id: "subject.action.v1"
					modalities: ["both"]
					refs: [
						{key: "subject", capability: "subject", required: false},
						{key: "target",  capability: "target",  required: false},
					]
					params: #SubjectActionParams + [
						{key: "target_ref", type: "ref", required: false, ref_capability: "target"},
					]
					default_args: {
						action_verb:        "release"
						target_involvement: "direct"
						intensity:          "low"
						body_region:        "hands"
					}
				}
				variants: [
					{
						key: "release"
						tags: {
							action_synonyms: ["releases", "lets go", "drops", "loosens grip", "relinquishes"]
						}
						op_args: {
							action_verb:        "release"
							target_involvement: "direct"
							intensity:          "low"
							body_region:        "hands"
						}
					},
					{
						key: "lower_gently"
						tags: {
							action_synonyms: ["lowers gently", "sets down", "places down", "eases down"]
						}
						op_args: {
							action_verb:        "lower"
							target_involvement: "direct"
							intensity:          "low"
							body_region:        "arms"
						}
					},
					{
						key: "push_back_soft"
						tags: {
							action_synonyms: ["gently pushes back", "eases away", "soft push", "guides away"]
						}
						op_args: {
							action_verb:        "push"
							target_involvement: "direct"
							intensity:          "low"
							body_region:        "hands"
						}
					},
				]
			}
		},
	]
}

manifest: #PromptPackManifestV1 & {
	id:          "core-subject-action"
	title:       "Core Subject Action"
	description: "Transitive action primitives organized by verb family: react, gesture, reach, contact, release. Domain packs (combat, romance, explicit) extend specific blocks under the same subject.action.v1 signature."
	matrix_presets: [
		{
			label: "Action Family by Target Involvement"
			query: {
				row_key:       "tag:modifier_family"
				col_key:       "tag:target_involvement"
				package_name:  "core_subject_action"
				include_empty: true
			}
		},
		{
			label: "Contact Actions by Intensity"
			query: {
				row_key:       "tag:action_verb"
				col_key:       "tag:action_intensity"
				package_name:  "core_subject_action"
				tags:          "modifier_family:subject_action_contact"
				include_empty: true
			}
		},
		{
			label: "Action Family by Body Region"
			query: {
				row_key:       "tag:modifier_family"
				col_key:       "tag:body_region"
				package_name:  "core_subject_action"
				include_empty: true
			}
		},
	]
}

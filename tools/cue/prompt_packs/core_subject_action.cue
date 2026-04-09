package promptpacks

pack: #PromptBlockPackV1 & {
	version:      "1.0.0"
	package_name: "core_subject_action"
	defaults: {
		is_public: true
		source:    "system"
	}
	blocks: [
		{
			id: "action"
			block_schema: {
				id_prefix: "core.subject.action"
				category:  "character_pose"
				capabilities: ["subject.action"]
				text_template: "Subject action token: {variant}."
				tags: {
					modifier_family:  "subject_action"
					modality_support: "both"
					temporal:         "dynamic"
				}
				op: {
					op_id:        "subject.action.perform"
					signature_id: "subject.action.v1"
					modalities: ["both"]
					refs: [
						{
							key:        "subject"
							capability: "subject"
							required:   false
						},
						{
							key:        "target"
							capability: "target"
							required:   false
						},
					]
					params: #SubjectActionParams + [
						{
							key:            "target_ref"
							type:           "ref"
							required:       false
							ref_capability: "target"
						},
					]
					default_args: {
						action_verb:        "gesture"
						target_involvement: "none"
						intensity:          "medium"
						body_region:        "upper_body"
					}
				}
				variants: [
					// --- single-subject, no target ---
					{
						key: "gesture_expressive"
						tags: {
							action_synonyms: [
								"gestures",
								"gesturing",
								"expressive gesture",
								"hand gesture",
								"waves hand",
							]
						}
						op_args: {
							action_verb:        "gesture"
							target_involvement: "none"
							intensity:          "medium"
							body_region:        "arms"
						}
					},
					{
						key: "react_strong"
						tags: {
							action_synonyms: [
								"reacts",
								"reacting",
								"startled",
								"flinches",
								"steps back",
								"sharp reaction",
							]
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
							action_synonyms: [
								"subtle reaction",
								"slight reaction",
								"faint response",
								"small flinch",
							]
						}
						op_args: {
							action_verb:        "react"
							target_involvement: "none"
							intensity:          "low"
							body_region:        "upper_body"
						}
					},
					{
						key: "turn_to_face"
						tags: {
							action_synonyms: [
								"turns toward",
								"turns to face",
								"pivots to",
								"rotates toward",
								"faces toward",
							]
						}
						op_args: {
							action_verb:        "turn_to"
							target_involvement: "indirect"
							intensity:          "medium"
							body_region:        "full_body"
						}
					},
					// --- arms/hands toward target ---
					{
						key: "reach_toward"
						tags: {
							action_synonyms: [
								"reaches toward",
								"reaches out",
								"extends arm toward",
								"stretches toward",
							]
						}
						op_args: {
							action_verb:        "reach"
							target_involvement: "indirect"
							intensity:          "medium"
							body_region:        "arms"
						}
					},
					{
						key: "grasp_target"
						tags: {
							action_synonyms: [
								"grabs",
								"grasps",
								"takes hold of",
								"grips",
								"clutches",
							]
						}
						op_args: {
							action_verb:        "grasp"
							target_involvement: "direct"
							intensity:          "medium"
							body_region:        "hands"
						}
					},
					{
						key: "lift_target"
						tags: {
							action_synonyms: [
								"lifts",
								"raises",
								"picks up",
								"hoists",
							]
						}
						op_args: {
							action_verb:        "lift"
							target_involvement: "direct"
							intensity:          "medium"
							body_region:        "arms"
						}
					},
					{
						key: "pull_toward"
						tags: {
							action_synonyms: [
								"pulls toward",
								"draws in",
								"drags closer",
								"pulls closer",
							]
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
							action_synonyms: [
								"pushes away",
								"shoves",
								"pushes back",
								"drives away",
							]
						}
						op_args: {
							action_verb:        "push"
							target_involvement: "direct"
							intensity:          "medium"
							body_region:        "arms"
						}
					},
					{
						key: "release_target"
						tags: {
							action_synonyms: [
								"releases",
								"lets go",
								"drops",
								"sets down",
								"relinquishes",
							]
						}
						op_args: {
							action_verb:        "release"
							target_involvement: "direct"
							intensity:          "low"
							body_region:        "hands"
						}
					},
					// --- full-body toward target ---
					{
						key: "embrace_target"
						tags: {
							action_synonyms: [
								"embraces",
								"hugs",
								"holds close",
								"wraps arms around",
							]
						}
						op_args: {
							action_verb:        "embrace"
							target_involvement: "direct"
							intensity:          "medium"
							body_region:        "full_body"
						}
					},
					{
						key: "lower_to_target"
						tags: {
							action_synonyms: [
								"lowers toward",
								"bends down to",
								"leans down to",
								"descends toward",
							]
						}
						op_args: {
							action_verb:        "lower"
							target_involvement: "indirect"
							intensity:          "low"
							body_region:        "full_body"
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
	description: "Generic transitive action primitives for a subject acting on or toward a target. Domain packs (combat, sports, explicit content) define their own variant sets on top of the same subject.action.v1 signature."
	matrix_presets: [
		{
			label: "Action Verb by Target Involvement"
			query: {
				row_key:       "tag:action_verb"
				col_key:       "tag:target_involvement"
				package_name:  "core_subject_action"
				include_empty: true
			}
		},
		{
			label: "Action by Body Region"
			query: {
				row_key:       "tag:action_verb"
				col_key:       "tag:body_region"
				package_name:  "core_subject_action"
				include_empty: true
			}
		},
		{
			label: "Action by Intensity"
			query: {
				row_key:       "tag:action_verb"
				col_key:       "tag:action_intensity"
				package_name:  "core_subject_action"
				include_empty: true
			}
		},
	]
}

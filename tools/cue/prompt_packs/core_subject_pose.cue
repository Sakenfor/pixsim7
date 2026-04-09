package promptpacks

pack: #PromptBlockPackV1 & {
	version:      "1.0.0"
	package_name: "core_subject_pose"
	defaults: {
		is_public: true
		source:    "system"
	}
	blocks: [
		{
			id: "pose"
			block_schema: {
				id_prefix: "core.subject.pose"
				category:  "character_pose"
				capabilities: ["subject.pose"]
				text_template: "Pose token: {variant}."
				tags: {
					modifier_family:  "subject_pose"
					modality_support: "both"
					temporal:         "neutral"
				}
				op: {
					op_id: "subject.pose.set"
					signature_id: "subject.pose.v1"
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
					params: [
						{
							key:     "pose"
							type:    "enum"
							default: "standing"
							enum:    #PoseValues
							tag_key: "pose"
						},
						{
							key:     "hands"
							type:    "enum"
							default: "neutral"
							enum:    #PoseHandsValues
							tag_key: "hands"
						},
						{
							key:     "gaze"
							type:    "enum"
							default: "forward"
							enum:    #GazeValues
							tag_key: "gaze"
						},
						{
							key:            "target_ref"
							type:           "ref"
							required:       false
							ref_capability: "target"
						},
					]
					default_args: {
						pose:  "standing"
						hands: "neutral"
						gaze:  "forward"
					}
				}
				variants: [
					{
						key: "standing_neutral"
						tags: {
							gaze:  "forward"
						}
						op_args: {
							pose:  "standing"
							hands: "at_sides"
							gaze:  "forward"
						}
					},
					{
						key: "seated_relaxed"
						tags: {
							gaze:  "down"
						}
						op_args: {
							pose:  "seated"
							hands: "neutral"
							gaze:  "down"
						}
					},
					{
						key: "leaning_forward"
						tags: {
							gaze:  "at_target"
						}
						op_args: {
							pose:  "leaning"
							hands: "on_hips"
							gaze:  "at_target"
						}
					},
					{
						key: "crouched_ready"
						tags: {
							gaze:  "forward"
						}
						op_args: {
							pose:  "crouching"
							hands: "neutral"
							gaze:  "forward"
						}
					},
					{
						key: "kneeling_reach"
						tags: {
							gaze:  "at_target"
						}
						op_args: {
							pose:  "kneeling"
							hands: "holding_object"
							gaze:  "at_target"
						}
					},
				]
			}
		},
	]
}

manifest: #PromptPackManifestV1 & {
	id:          "core-subject-pose"
	title:       "Core Subject Pose"
	description: "Subject pose and posture primitives."
	matrix_presets: [
		{
			label: "Pose Variants"
			query: {
				row_key:       "tag:modifier_family"
				col_key:       "tag:variant"
				package_name:  "core_subject_pose"
				include_empty: true
			}
		},
		{
			label: "Pose by Hands"
			query: {
				row_key:       "tag:pose"
				col_key:       "tag:hands"
				package_name:  "core_subject_pose"
				include_empty: true
			}
		},
	]
}

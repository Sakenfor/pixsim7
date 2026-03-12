package promptpacks

pack: #PromptBlockPackV1 & {
	version:      "1.0.0"
	package_name: "core_subject_look"
	defaults: {
		is_public: true
		source:    "system"
	}
	blocks: [
		{
			id: "look"
			block_schema: {
				id_prefix: "core.subject.look"
				category:  "character_pose"
				capabilities: ["subject.look"]
				text_template: "Subject look token: {variant}."
				tags: {
					modifier_family:  "subject_look"
					modality_support: "both"
					temporal:         "neutral"
				}
				op: {
					op_id: "subject.look_at"
					signature_id: "subject.look.v1"
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
							key:     "focus"
							type:    "enum"
							default: "eyes"
							enum:    #LookFocusValues
							tag_key: "look_focus"
						},
						{
							key:     "intensity"
							type:    "enum"
							default: "medium"
							enum:    #LevelValues
							tag_key: "look_intensity"
						},
						{
							key:            "target_ref"
							type:           "ref"
							required:       false
							ref_capability: "target"
						},
					]
					default_args: {
						focus:     "eyes"
						intensity: "medium"
					}
				}
				variants: [
					{
						key: "glance_target"
						op_args: {
							focus:     "eyes"
							intensity: "low"
						}
					},
					{
						key: "hold_eye_contact"
						op_args: {
							focus:     "eyes"
							intensity: "high"
						}
					},
					{
						key: "turn_head_target"
						op_args: {
							focus:     "head"
							intensity: "medium"
						}
					},
					{
						key: "look_away_soft"
						op_args: {
							focus:     "away"
							intensity: "low"
						}
					},
				]
			}
		},
	]
}

manifest: #PromptPackManifestV1 & {
	id:          "core-subject-look"
	title:       "Core Subject Look"
	description: "Subject gaze target primitives."
	matrix_presets: [
		{
			label: "Subject Look Variants"
			query: {
				row_key:       "tag:modifier_family"
				col_key:       "tag:variant"
				package_name:  "core_subject_look"
				include_empty: true
			}
		},
		{
			label: "Look Focus by Intensity"
			query: {
				row_key:       "tag:look_focus"
				col_key:       "tag:look_intensity"
				package_name:  "core_subject_look"
				include_empty: true
			}
		},
	]
}

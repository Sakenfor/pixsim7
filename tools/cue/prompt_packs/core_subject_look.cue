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
					op_id:        "subject.look.apply"
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
							key:            "target_ref"
							type:           "ref"
							required:       false
							ref_capability: "target"
						},
					]
					default_args: {
						focus: "eyes"
					}
				}
				variants: [
					{
						key: "glance_target"
						tags: {
							look_synonyms: ["glances at", "quick look", "brief glance", "steals a look"]
						}
						op_args: {
							focus: "eyes"
						}
					},
					{
						key: "hold_eye_contact"
						tags: {
							look_synonyms: ["holds eye contact", "sustained gaze", "stares", "locks eyes", "fixes gaze"]
						}
						op_args: {
							focus: "eyes"
						}
					},
					{
						key: "turn_head_target"
						tags: {
							look_synonyms: ["turns head toward", "looks toward", "faces toward", "head toward"]
						}
						op_args: {
							focus: "head"
						}
					},
					{
						key: "look_away"
						tags: {
							look_synonyms: ["looks away", "averts gaze", "glances away", "turns away", "avoids eye contact"]
						}
						op_args: {
							focus: "away"
						}
					},
					{
						key: "look_at_body"
						tags: {
							look_synonyms: ["looks at body", "gaze drifts down", "eyes scan", "looks over"]
						}
						op_args: {
							focus: "body"
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
	description: "Subject gaze target primitives. Compose with core_manner for gaze intensity (glance_target + manner.languid, hold_eye_contact + manner.deliberate, etc.)."
	matrix_presets: [
		{
			label: "Look Variants by Focus"
			query: {
				row_key:       "tag:modifier_family"
				col_key:       "tag:look_focus"
				package_name:  "core_subject_look"
				include_empty: true
			}
		},
		{
			label: "Look Variants"
			query: {
				row_key:       "tag:modifier_family"
				col_key:       "tag:variant"
				package_name:  "core_subject_look"
				include_empty: true
			}
		},
	]
}

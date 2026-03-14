package promptpacks

pack: #PromptBlockPackV1 & {
	version:      "1.0.0"
	package_name: "core_sequence_continuity"
	defaults: {
		is_public: true
		source:    "system"
	}
	blocks: [
		{
			id: "continuity"
			block_schema: {
				id_prefix: "core.sequence.continuity"
				category:  "continuity"
				role:      "composition"
				capabilities: ["sequence.continuity"]
				text_template: "Sequence continuity token: {variant}."
				tags: {
					modifier_family:  "sequence_continuity"
					modality_support: "both"
					temporal:         "dynamic"
				}
				op: {
					op_id: "sequence.continuity.apply"
					signature_id: "sequence.continuity.v1"
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
						{
							key:        "previous_frame"
							capability: "frame_context"
							required:   false
						},
					]
					params: [
						{
							key:     "role_in_sequence"
							type:    "enum"
							default: "continuation"
							enum: ["initial", "continuation", "transition", "unspecified"]
						},
						{
							key:     "continuity_focus"
							type:    "enum"
							default: "subject"
							enum: ["subject", "target", "setting", "props", "tone"]
						},
						{
							key:     "continuity_priority"
							type:    "enum"
							default: "medium"
							enum: ["low", "medium", "high"]
						},
						{
							key:            "target_ref"
							type:           "ref"
							required:       false
							ref_capability: "target"
						},
					]
					default_args: {
						role_in_sequence:   "continuation"
						continuity_focus:   "subject"
						continuity_priority: "medium"
					}
				}
				variants: [
					{
						key: "initial_setting_lock"
						op_args: {
							role_in_sequence:   "initial"
							continuity_focus:   "setting"
							continuity_priority: "medium"
						}
					},
					{
						key: "continuation_subject_lock"
						op_args: {
							role_in_sequence:   "continuation"
							continuity_focus:   "subject"
							continuity_priority: "high"
						}
					},
					{
						key: "continuation_target_lock"
						op_args: {
							role_in_sequence:   "continuation"
							continuity_focus:   "target"
							continuity_priority: "high"
						}
					},
					{
						key: "transition_setting_shift"
						op_args: {
							role_in_sequence:   "transition"
							continuity_focus:   "setting"
							continuity_priority: "medium"
						}
					},
					{
						key: "transition_tone_shift"
						op_args: {
							role_in_sequence:   "transition"
							continuity_focus:   "tone"
							continuity_priority: "medium"
						}
					},
					{
						key: "transition_props_shift"
						op_args: {
							role_in_sequence:   "transition"
							continuity_focus:   "props"
							continuity_priority: "low"
						}
					},
					{
						key: "unspecified_soft_hold"
						op_args: {
							role_in_sequence:   "unspecified"
							continuity_focus:   "subject"
							continuity_priority: "low"
						}
					},
				]
			}
		},
	]
}

manifest: #PromptPackManifestV1 & {
	id:          "core-sequence-continuity"
	title:       "Core Sequence Continuity"
	description: "Sequence role/continuity primitives for initial, continuation, and transition beats."
	matrix_presets: [
		{
			label: "Sequence Role by Focus"
			query: {
				row_key:       "tag:role_in_sequence"
				col_key:       "tag:continuity_focus"
				package_name:  "core_sequence_continuity"
				include_empty: true
			}
		},
		{
			label: "Continuity Focus by Priority"
			query: {
				row_key:       "tag:continuity_focus"
				col_key:       "tag:continuity_priority"
				package_name:  "core_sequence_continuity"
				include_empty: true
			}
		},
	]
}

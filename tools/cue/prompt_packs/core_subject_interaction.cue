package promptpacks

pack: #PromptBlockPackV1 & {
	version:      "1.0.0"
	package_name: "core_subject_interaction"
	defaults: {
		is_public: true
		source:    "system"
	}
	blocks: [
		{
			id: "interaction"
			block_schema: {
				id_prefix: "core.subject.interaction"
				category:  "interaction_beat"
				capabilities: ["subject.interaction"]
				text_template: "Interaction token: {variant}."
				tags: {
					modifier_family:  "subject_interaction"
					modality_support: "both"
					temporal:         "dynamic"
				}
				op: {
					op_id: "subject.interaction.apply"
					signature_id: "subject.interaction.v1"
					modalities: ["both"]
					refs: [
						{
							key:        "subject"
							capability: "subject"
							required:   true
						},
						{
							key:        "target"
							capability: "target"
							required:   true
						},
					]
					params: [
						{
							key:     "beat_type"
							type:    "enum"
							default: "greet"
							enum: ["greet", "brief_exchange", "pass_item", "hold", "brief_acknowledge"]
						},
						{
							key:     "contact_stage"
							type:    "enum"
							default: "none"
							enum: ["none", "offered_hand", "brief_contact"]
						},
						{
							key:     "response_mode"
							type:    "enum"
							default: "neutral"
							enum: ["neutral", "receptive", "hesitant", "boundary"]
						},
						{
							key:     "social_tone"
							type:    "enum"
							default: "neutral"
							enum: ["neutral", "warm", "playful"]
						},
						{
							key:            "target_ref"
							type:           "ref"
							required:       false
							ref_capability: "target"
						},
					]
					default_args: {
						beat_type:     "greet"
						contact_stage: "none"
						response_mode: "neutral"
						social_tone:   "neutral"
					}
				}
				variants: [
					{
						key: "greet_offer_hand"
						op_args: {
							beat_type:     "greet"
							contact_stage: "offered_hand"
							response_mode: "neutral"
							social_tone:   "warm"
						}
					},
					{
						key: "brief_exchange_contact"
						op_args: {
							beat_type:     "brief_exchange"
							contact_stage: "brief_contact"
							response_mode: "receptive"
							social_tone:   "warm"
						}
					},
					{
						key: "pass_item_handoff"
						op_args: {
							beat_type:     "pass_item"
							contact_stage: "brief_contact"
							response_mode: "neutral"
							social_tone:   "neutral"
						}
					},
					{
						key: "hold_boundary"
						op_args: {
							beat_type:     "hold"
							contact_stage: "none"
							response_mode: "boundary"
							social_tone:   "neutral"
						}
					},
					{
						key: "acknowledge_playful"
						op_args: {
							beat_type:     "brief_acknowledge"
							contact_stage: "none"
							response_mode: "receptive"
							social_tone:   "playful"
						}
					},
				]
			}
		},
	]
}

manifest: #PromptPackManifestV1 & {
	id:          "core-subject-interaction"
	title:       "Core Subject Interaction"
	description: "Subject-to-target interaction beat primitives."
	matrix_presets: [
		{
			label: "Interaction by Contact"
			query: {
				row_key:       "tag:beat_type"
				col_key:       "tag:contact_stage"
				package_name:  "core_subject_interaction"
				include_empty: true
			}
		},
		{
			label: "Interaction by Tone"
			query: {
				row_key:       "tag:response_mode"
				col_key:       "tag:social_tone"
				package_name:  "core_subject_interaction"
				include_empty: true
			}
		},
	]
}

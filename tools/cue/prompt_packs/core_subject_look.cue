package promptpacks

pack: #PromptBlockPackV1 & {
	version:      "1.0.0"
	package_name: "core_subject_look"
	defaults: {
		is_public: true
		source:    "system"
	}
	block_schema: {
		id_prefix:    "core.subject.look"
		category:     "character_pose"
		capabilities: ["subject.look"]
		text_template: "Subject look token: {variant}."
		tags: {
			modifier_family:  "subject_look"
			modality_support: "both"
			temporal:         "neutral"
		}
		op: {
			op_id: "subject.look_at"
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
					enum: ["eyes", "head", "body"]
				},
				{
					key:     "intensity"
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
				focus:     "eyes"
				intensity: "medium"
			}
		}
		variants: [
			{
				key: "glance_target"
				tags: {
					look_focus:     "eyes"
					look_intensity: "low"
				}
				op_args: {
					focus:     "eyes"
					intensity: "low"
				}
			},
			{
				key: "hold_eye_contact"
				tags: {
					look_focus:     "eyes"
					look_intensity: "high"
				}
				op_args: {
					focus:     "eyes"
					intensity: "high"
				}
			},
			{
				key: "turn_head_target"
				tags: {
					look_focus:     "head"
					look_intensity: "medium"
				}
				op_args: {
					focus:     "head"
					intensity: "medium"
				}
			},
			{
				key: "look_away_soft"
				tags: {
					look_focus:     "away"
					look_intensity: "low"
				}
				op_args: {
					focus:     "head"
					intensity: "low"
				}
			},
		]
	}
}

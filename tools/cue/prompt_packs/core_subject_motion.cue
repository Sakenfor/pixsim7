package promptpacks

pack: #PromptBlockPackV1 & {
	version:      "1.0.0"
	package_name: "core_subject_motion"
	defaults: {
		is_public: true
		source:    "system"
	}
	blocks: [
		{
			id: "motion"
			block_schema: {
				id_prefix: "core.subject.motion"
				category:  "character_pose"
				capabilities: ["subject.move"]
				text_template: "Subject motion token: {variant}."
				tags: {
					modifier_family:  "subject_motion"
					modality_support: "video"
					temporal:         "dynamic"
				}
				op: {
					op_id: "subject.move.apply"
					modalities: ["video"]
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
							key:     "direction"
							type:    "enum"
							default: "forward"
							enum:    #DirectionValuesNoNone
						},
						{
							key:     "speed"
							type:    "enum"
							default: "normal"
							enum:    #SpeedValues
						},
						{
							key:     "gait"
							type:    "enum"
							default: "walk"
							enum:    #GaitValues
						},
						{
							key:            "target_ref"
							type:           "ref"
							required:       false
							ref_capability: "target"
						},
					]
					default_args: {
						direction: "forward"
						speed:     "normal"
						gait:      "walk"
					}
				}
				variants: [
					{
						key: "move_forward"
						tags: {
							motion_direction: "forward"
							motion_speed:     "normal"
						}
						op_args: {
							direction: "forward"
							speed:     "normal"
							gait:      "walk"
						}
					},
					{
						key: "move_left"
						tags: {
							motion_direction: "left"
							motion_speed:     "slow"
						}
						op_args: {
							direction: "left"
							speed:     "slow"
							gait:      "step"
						}
					},
					{
						key: "move_right"
						tags: {
							motion_direction: "right"
							motion_speed:     "slow"
						}
						op_args: {
							direction: "right"
							speed:     "slow"
							gait:      "step"
						}
					},
					{
						key: "turn_around"
						tags: {
							motion_direction: "around"
							motion_speed:     "normal"
						}
						op_args: {
							direction: "around"
							speed:     "normal"
							gait:      "turn"
						}
					},
				]
			}
		},
	]
}

manifest: #PromptPackManifestV1 & {
	id:          "core-subject-motion"
	title:       "Core Subject Motion"
	description: "Subject movement and gaze-target primitives."
	matrix_presets: [
		{
			label: "Subject Motion Variants"
			query: {
				row_key:       "tag:modifier_family"
				col_key:       "tag:variant"
				package_name:  "core_subject_motion"
				include_empty: true
			}
		},
		{
			label: "Motion by Speed"
			query: {
				row_key:       "tag:motion_direction"
				col_key:       "tag:motion_speed"
				package_name:  "core_subject_motion"
				include_empty: true
			}
		},
	]
}

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
					signature_id: "subject.motion.v1"
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
							tag_key: "motion_direction"
						},
						{
							key:     "speed"
							type:    "enum"
							default: "normal"
							enum:    #SpeedValues
							tag_key: "motion_speed"
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
						op_args: {
							direction: "forward"
							speed:     "normal"
							gait:      "walk"
						}
					},
					{
						key: "move_left"
						op_args: {
							direction: "left"
							speed:     "slow"
							gait:      "step"
						}
					},
					{
						key: "move_right"
						op_args: {
							direction: "right"
							speed:     "slow"
							gait:      "step"
						}
					},
					{
						key: "turn_around"
						op_args: {
							direction: "around"
							speed:     "normal"
							gait:      "turn"
						}
					},
					{
						key: "move_backward"
						op_args: {
							direction: "backward"
							speed:     "normal"
							gait:      "walk"
						}
					},
					{
						key: "move_in"
						op_args: {
							direction: "in"
							speed:     "slow"
							gait:      "step"
						}
					},
					{
						key: "move_out"
						op_args: {
							direction: "out"
							speed:     "slow"
							gait:      "step"
						}
					},
					{
						key: "run_forward"
						op_args: {
							direction: "forward"
							speed:     "fast"
							gait:      "run"
						}
					},
					{
						key: "drift_left"
						op_args: {
							direction: "left"
							speed:     "slow"
							gait:      "drift"
						}
					},
					{
						key: "drift_right"
						op_args: {
							direction: "right"
							speed:     "slow"
							gait:      "drift"
						}
					},
					{
						key: "turn_left"
						op_args: {
							direction: "left"
							speed:     "slow"
							gait:      "turn"
						}
					},
					{
						key: "turn_right"
						op_args: {
							direction: "right"
							speed:     "slow"
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

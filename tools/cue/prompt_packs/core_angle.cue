package promptpacks

pack: #PromptBlockPackV1 & {
	version:      "1.0.0"
	package_name: "core_angle"
	defaults: {
		is_public: true
		source:    "system"
	}
	blocks: [
		{
			id: "angle"
			block_schema: {
				id_prefix: "core.camera.angle"
				category:  "camera"
				capabilities: ["camera.angle"]
				text_template: "Angle token: {variant}."
				tags: {
					modifier_family:  "angle"
					modality_support: "both"
					temporal:         "neutral"
				}
				op: {
					op_id: "camera.angle.set"
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
							key:     "vertical_angle"
							type:    "enum"
							default: "eye"
							enum:    #VerticalAngleValues
						},
						{
							key:     "roll"
							type:    "enum"
							default: "level"
							enum:    #RollValues
						},
						{
							key:            "target_ref"
							type:           "ref"
							required:       false
							ref_capability: "target"
						},
					]
					default_args: {
						vertical_angle: "eye"
						roll:           "level"
					}
				}
				variants: [
					{
						key: "eye_level"
						tags: {
							vertical_angle: "eye"
							camera_roll:    "level"
						}
						op_args: {
							vertical_angle: "eye"
							roll:           "level"
						}
					},
					{
						key: "high_angle"
						tags: {
							vertical_angle: "high"
							camera_roll:    "level"
						}
						op_args: {
							vertical_angle: "high"
							roll:           "level"
						}
					},
					{
						key: "low_angle"
						tags: {
							vertical_angle: "low"
							camera_roll:    "level"
						}
						op_args: {
							vertical_angle: "low"
							roll:           "level"
						}
					},
					{
						key: "bird_eye"
						tags: {
							vertical_angle: "bird"
							camera_roll:    "level"
						}
						op_args: {
							vertical_angle: "bird"
							roll:           "level"
						}
					},
					{
						key: "worm_eye"
						tags: {
							vertical_angle: "worm"
							camera_roll:    "level"
						}
						op_args: {
							vertical_angle: "worm"
							roll:           "level"
						}
					},
					{
						key: "dutch_left"
						tags: {
							vertical_angle: "eye"
							camera_roll:    "dutch_left"
						}
						op_args: {
							vertical_angle: "eye"
							roll:           "dutch_left"
						}
					},
					{
						key: "dutch_right"
						tags: {
							vertical_angle: "eye"
							camera_roll:    "dutch_right"
						}
						op_args: {
							vertical_angle: "eye"
							roll:           "dutch_right"
						}
					},
				]
			}
		},
	]
}

manifest: #PromptPackManifestV1 & {
	id:          "core-angle"
	title:       "Core Angle"
	description: "Vertical camera angle and roll primitives."
	matrix_presets: [
		{
			label: "Angle Variants"
			query: {
				row_key:       "tag:modifier_family"
				col_key:       "tag:variant"
				package_name:  "core_angle"
				include_empty: true
			}
		},
		{
			label: "Vertical Angle by Roll"
			query: {
				row_key:       "tag:vertical_angle"
				col_key:       "tag:camera_roll"
				package_name:  "core_angle"
				include_empty: true
			}
		},
	]
}

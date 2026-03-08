package promptpacks

pack: #PromptBlockPackV1 & {
	version:      "1.0.0"
	package_name: "core_focus"
	defaults: {
		is_public: true
		source:    "system"
	}
	blocks: [
		{
			id: "focus"
			block_schema: {
				id_prefix: "core.camera.focus"
				category:  "camera"
				capabilities: ["camera.focus"]
				text_template: "Focus token: {variant}."
				tags: {
					modifier_family:  "focus"
					modality_support: "both"
					temporal:         "neutral"
				}
				op: {
					op_id: "camera.focus.set"
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
							key:     "focus_target"
							type:    "enum"
							default: "subject"
							enum:    #FocusTargetValues
						},
						{
							key:     "depth_of_field"
							type:    "enum"
							default: "medium"
							enum:    #DepthOfFieldValues
						},
						{
							key:     "rack"
							type:    "boolean"
							default: false
						},
						{
							key:            "target_ref"
							type:           "ref"
							required:       false
							ref_capability: "target"
						},
					]
					default_args: {
						focus_target:   "subject"
						depth_of_field: "medium"
						rack:           false
					}
				}
				variants: [
					{
						key: "subject_shallow"
						tags: {
							focus_target:   "subject"
							depth_of_field: "shallow"
							rack_focus:     "false"
						}
						op_args: {
							focus_target:   "subject"
							depth_of_field: "shallow"
							rack:           false
						}
					},
					{
						key: "subject_deep"
						tags: {
							focus_target:   "subject"
							depth_of_field: "deep"
							rack_focus:     "false"
						}
						op_args: {
							focus_target:   "subject"
							depth_of_field: "deep"
							rack:           false
						}
					},
					{
						key: "target_shallow"
						tags: {
							focus_target:   "target"
							depth_of_field: "shallow"
							rack_focus:     "false"
						}
						op_args: {
							focus_target:   "target"
							depth_of_field: "shallow"
							rack:           false
						}
					},
					{
						key: "background_deep"
						tags: {
							focus_target:   "background"
							depth_of_field: "deep"
							rack_focus:     "false"
						}
						op_args: {
							focus_target:   "background"
							depth_of_field: "deep"
							rack:           false
						}
					},
					{
						key: "rack_subject_to_target"
						tags: {
							focus_target:   "target"
							depth_of_field: "shallow"
							rack_focus:     "true"
						}
						op_args: {
							focus_target:   "target"
							depth_of_field: "shallow"
							rack:           true
						}
					},
				]
			}
		},
	]
}

manifest: #PromptPackManifestV1 & {
	id:          "core-focus"
	title:       "Core Focus"
	description: "Focus target, depth-of-field, and rack-focus primitives."
	matrix_presets: [
		{
			label: "Focus Variants"
			query: {
				row_key:       "tag:modifier_family"
				col_key:       "tag:variant"
				package_name:  "core_focus"
				include_empty: true
			}
		},
		{
			label: "Focus Target by DoF"
			query: {
				row_key:       "tag:focus_target"
				col_key:       "tag:depth_of_field"
				package_name:  "core_focus"
				include_empty: true
			}
		},
	]
}

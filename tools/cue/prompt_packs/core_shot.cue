package promptpacks

pack: #PromptBlockPackV1 & {
	version:      "1.0.0"
	package_name: "core_shot"
	defaults: {
		is_public: true
		source:    "system"
	}
	blocks: [
		{
			id: "shot"
			block_schema: {
				id_prefix: "core.camera.shot"
				category:  "camera"
				capabilities: ["camera.shot"]
				text_template: "Shot token: {variant}."
				tags: {
					modifier_family:  "shot"
					modality_support: "both"
					temporal:         "neutral"
				}
				op: {
					op_id: "camera.shot.set"
					signature_id: "camera.shot.v1"
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
							key:     "shot_size"
							type:    "enum"
							default: "medium"
							enum:    #ShotSizeValues
						},
						{
							key:     "subject_count"
							type:    "enum"
							default: "single"
							enum:    #SubjectCountValues
						},
						{
							key:            "target_ref"
							type:           "ref"
							required:       false
							ref_capability: "target"
						},
					]
					default_args: {
						shot_size:     "medium"
						subject_count: "single"
					}
				}
				variants: [
					{
						key: "extreme_wide_establishing"
						op_args: {
							shot_size:     "extreme_wide"
							subject_count: "group"
						}
					},
					{
						key: "wide_single"
						op_args: {
							shot_size:     "wide"
							subject_count: "single"
						}
					},
					{
						key: "medium_single"
						op_args: {
							shot_size:     "medium"
							subject_count: "single"
						}
					},
					{
						key: "close_up_single"
						op_args: {
							shot_size:     "close_up"
							subject_count: "single"
						}
					},
					{
						key: "medium_pair"
						op_args: {
							shot_size:     "medium"
							subject_count: "pair"
						}
					},
					{
						key: "close_up_pair"
						op_args: {
							shot_size:     "close_up"
							subject_count: "pair"
						}
					},
					{
						key: "wide_group"
						op_args: {
							shot_size:     "wide"
							subject_count: "group"
						}
					},
					{
						key: "extreme_close_up_detail"
						op_args: {
							shot_size:     "extreme_close_up"
							subject_count: "single"
						}
					},
				]
			}
		},
	]
}

manifest: #PromptPackManifestV1 & {
	id:          "core-shot"
	title:       "Core Shot"
	description: "Shot size and subject count primitives."
	matrix_presets: [
		{
			label: "Shot Variants"
			query: {
				row_key:       "tag:modifier_family"
				col_key:       "tag:variant"
				package_name:  "core_shot"
				include_empty: true
			}
		},
		{
			label: "Shot Size by Subject Count"
			query: {
				row_key:       "tag:shot_size"
				col_key:       "tag:subject_count"
				package_name:  "core_shot"
				include_empty: true
			}
		},
	]
}

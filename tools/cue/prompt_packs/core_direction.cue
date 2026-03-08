package promptpacks

pack: #PromptBlockPackV1 & {
	version:      "1.0.0"
	package_name: "core_direction"
	defaults: {
		is_public: true
		source:    "system"
	}
	blocks: [
		{
			id: "axis"
			block_schema: {
				id_prefix: "core.direction"
				category:  "direction"
				capabilities: ["direction.axis"]
				op: {
					op_id_template: "direction.axis.{variant}"
					modalities: ["both"]
					refs: [
						{
							key:        "subject"
							capability: "subject"
							required:   false
						},
					]
				}
				text_template: "Direction token: {variant}."
				tags: {
					modifier_family:  "direction"
					modality_support: "both"
					temporal:         "neutral"
				}
				variants: [
					{
						key: "in"
						tags: {
							direction: "in"
						}
					},
					{
						key: "out"
						tags: {
							direction: "out"
						}
					},
					{
						key: "left"
						tags: {
							direction: "left"
						}
					},
					{
						key: "right"
						tags: {
							direction: "right"
						}
					},
					{
						key: "up"
						tags: {
							direction: "up"
						}
					},
					{
						key: "down"
						tags: {
							direction: "down"
						}
					},
					{
						key: "forward"
						tags: {
							direction: "forward"
						}
					},
					{
						key: "backward"
						tags: {
							direction: "backward"
						}
					},
				]
			}
		},
	]
}

manifest: #PromptPackManifestV1 & {
	id:          "core-direction"
	title:       "Core Direction"
	description: "Direction primitives intended to be shared by movement-capable domains."
	matrix_presets: [
		{
			label: "Direction Variants"
			query: {
				row_key:       "tag:modifier_family"
				col_key:       "tag:variant"
				package_name:  "core_direction"
				include_empty: true
			}
		},
		{
			label: "Direction Tokens (All)"
			query: {
				row_key:       "category"
				col_key:       "composition_role"
				package_name:  "core_direction"
				include_empty: true
			}
		},
	]
}

package promptpacks

pack: #PromptBlockPackV1 & {
	version:      "1.0.0"
	package_name: "core_light"
	defaults: {
		is_public: true
		source:    "system"
	}
	blocks: [
		{
			id: "state"
			block_schema: {
				id_prefix: "core.light.state"
				category:  "light"
				capabilities: ["light.state"]
				text_template: "Lighting token: {variant}."
				tags: {
					modifier_family:  "light"
					modality_support: "both"
					temporal:         "neutral"
				}
				op: {
					op_id: "light.state.set"
					modalities: ["both"]
					refs: [
						{
							key:        "subject"
							capability: "subject"
							required:   false
						},
					]
					params: [
						{
							key:     "key_light"
							type:    "enum"
							default: "diffuse"
							enum:    #LightKeyValues
						},
						{
							key:     "intensity"
							type:    "enum"
							default: "medium"
							enum:    #LevelValues
						},
						{
							key:     "temperature"
							type:    "enum"
							default: "neutral"
							enum:    #LightTemperatureValues
						},
						{
							key:     "contrast"
							type:    "enum"
							default: "medium"
							enum:    #LevelValues
						},
					]
					default_args: {
						key_light:   "diffuse"
						intensity:   "medium"
						temperature: "neutral"
						contrast:    "medium"
					}
				}
				variants: [
					{
						key: "soft_warm"
						tags: {
							light_key:         "soft"
							light_temperature: "warm"
							light_intensity:   "medium"
						}
						op_args: {
							key_light:   "soft"
							temperature: "warm"
							intensity:   "medium"
							contrast:    "low"
						}
					},
					{
						key: "hard_cool"
						tags: {
							light_key:         "hard"
							light_temperature: "cool"
							light_intensity:   "high"
						}
						op_args: {
							key_light:   "hard"
							temperature: "cool"
							intensity:   "high"
							contrast:    "high"
						}
					},
					{
						key: "diffuse_neutral"
						tags: {
							light_key:         "diffuse"
							light_temperature: "neutral"
							light_intensity:   "medium"
						}
						op_args: {
							key_light:   "diffuse"
							temperature: "neutral"
							intensity:   "medium"
							contrast:    "medium"
						}
					},
					{
						key: "rim_dramatic"
						tags: {
							light_key:         "rim"
							light_temperature: "cool"
							light_intensity:   "high"
						}
						op_args: {
							key_light:   "rim"
							temperature: "cool"
							intensity:   "high"
							contrast:    "high"
						}
					},
					{
						key: "backlit_silhouette"
						tags: {
							light_key:         "backlit"
							light_temperature: "mixed"
							light_intensity:   "high"
						}
						op_args: {
							key_light:   "backlit"
							temperature: "mixed"
							intensity:   "high"
							contrast:    "high"
						}
					},
				]
			}
		},
	]
}

manifest: #PromptPackManifestV1 & {
	id:          "core-light"
	title:       "Core Light"
	description: "Lighting state primitives for mood and readability."
	matrix_presets: [
		{
			label: "Light Variants"
			query: {
				row_key:       "tag:modifier_family"
				col_key:       "tag:variant"
				package_name:  "core_light"
				include_empty: true
			}
		},
		{
			label: "Light Temperature by Intensity"
			query: {
				row_key:       "tag:light_temperature"
				col_key:       "tag:light_intensity"
				package_name:  "core_light"
				include_empty: true
			}
		},
	]
}

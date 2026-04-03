package promptpacks

pack: #PromptBlockPackV1 & {
	version:      "1.0.0"
	package_name: "core_color"
	defaults: {
		is_public: true
		source:    "system"
	}
	blocks: [
		{
			id: "grade"
			block_schema: {
				id_prefix: "core.color.grade"
				category:  "color"
				capabilities: ["color.grade"]
				text_template: "Color grade token: {variant}."
				tags: {
					modifier_family:      "color_grade"
					modality_support:     "both"
					temporal:             "neutral"
					grade_context_synonyms: [
						"color grade",
						"color grading",
						"palette",
						"tone",
						"look",
						"style",
						"lighting",
						"light",
						"cinematic",
					]
				}
				op: {
					op_id: "color.grade.apply"
					signature_id: "color.grade.v1"
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
							key:     "temperature"
							type:    "enum"
							default: "neutral"
							enum: ["very_warm", "warm", "neutral", "cool", "very_cool"]
							tag_key: "grade_temperature"
						},
						{
							key:     "saturation"
							type:    "enum"
							default: "medium"
							enum: ["muted", "low", "medium", "high", "vibrant"]
							tag_key: "grade_saturation"
						},
						{
							key:     "contrast"
							type:    "enum"
							default: "medium"
							enum: ["soft", "low", "medium", "high", "punchy"]
							tag_key: "grade_contrast"
						},
						{
							key:     "exposure"
							type:    "enum"
							default: "balanced"
							enum: ["dark", "low", "balanced", "bright", "high"]
							tag_key: "grade_exposure"
						},
					]
					default_args: {
						temperature: "neutral"
						saturation:  "medium"
						contrast:    "medium"
						exposure:    "balanced"
					}
				}
				variants: #CoreColorVariants
			}
		},
	]
}

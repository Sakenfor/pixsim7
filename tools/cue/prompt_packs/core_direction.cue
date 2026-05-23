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
					signature_id:   "direction.axis.v1"
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
					direction_context_synonyms: [
						"move",
						"moving",
						"turn",
						"turning",
						"step",
						"steps",
						"glance",
						"glancing",
						"look",
						"looking",
						"positioned",
						"placed",
						"rotate",
						"rotating",
						"spin",
						"orbit",
					]
				}
				// Variants comprehended from the shared direction vocabulary
				// (schema_v1.cue #DirectionVocabularyList) — single source of
				// truth for values + synonyms.
				variants: [for _e in #DirectionVocabularyList {
					key: _e.value
					tags: {
						direction:          _e.value
						direction_synonyms: _e.synonyms
					}
				}]
			},
		},
	]
}

manifest: #PromptPackManifestV1 & {
	id:          "core-direction"
	title:       "Core Direction"
	description: "Direction primitives intended to be shared by movement-capable domains."
	category:    "camera"
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

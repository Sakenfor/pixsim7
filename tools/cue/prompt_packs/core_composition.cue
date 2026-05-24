package promptpacks

pack: #PromptBlockPackV1 & {
	version:      "1.0.0"
	package_name: "core_composition"
	defaults: {
		is_public: true
		source:    "system"
	}
	blocks: [
		{
			id: "composition"
			block_schema: {
				id_prefix: "core.camera.composition"
				category:  "composition"
				capabilities: ["camera.composition"]
				text_template: "Composition token: {variant}."
				tags: {
					modifier_family:  "composition"
					modality_support: "both"
					temporal:         "neutral"
				}
				op: {
					op_id:        "camera.composition.set"
					signature_id: "camera.composition.v1"
					modalities: ["image", "video"]
					refs: [
						{
							key:        "subject"
							capability: "subject"
							required:   false
						},
					]
					params: [
						{
							key:     "framing"
							type:    "enum"
							default: "centered"
							enum:    #CompositionValues
							tag_key: "composition_framing"
						},
					]
					default_args: {
						framing: "centered"
					}
				}
				// Per-variant synonyms feed the projection token index. Most
				// composition terms are multi-word (rule_of_thirds, leading_lines,
				// negative_space), so the phrase-aware block-id gate naturally
				// stops a stray "lines"/"space"/"thirds" from matching alone.
				variants: [
					{
						key: "centered"
						op_args: framing: "centered"
						tags: composition_synonyms: ["centered composition", "dead center", "central framing", "symmetrically centered"]
					},
					{
						key: "rule_of_thirds"
						op_args: framing: "rule_of_thirds"
						tags: composition_synonyms: ["rule of thirds", "thirds grid", "off-center thirds placement"]
					},
					{
						key: "symmetrical"
						op_args: framing: "symmetrical"
						tags: composition_synonyms: ["symmetry", "symmetric", "mirror symmetry", "balanced framing"]
					},
					{
						key: "off_center"
						op_args: framing: "off_center"
						tags: composition_synonyms: ["off-center", "asymmetric", "asymmetrical", "decentered framing"]
					},
					{
						key: "leading_lines"
						op_args: framing: "leading_lines"
						tags: composition_synonyms: ["leading lines", "converging lines", "diagonal guiding lines"]
					},
					{
						key: "negative_space"
						op_args: framing: "negative_space"
						tags: composition_synonyms: ["negative space", "empty space framing", "minimalist negative space"]
					},
				]
			}
		},
	]
}

tag_registry: #TagRegistryV1 & {
	composition_framing: {
		label:          "Composition"
		description:    "Framing/composition strategy: centered, rule_of_thirds, symmetrical, off_center, leading_lines, or negative_space."
		allowed_values: #CompositionValues
		applies_to: [{role: "modifier", category: "composition"}]
		status: "active"
	}
}

manifest: #PromptPackManifestV1 & {
	id:          "core-composition"
	title:       "Core Composition"
	description: "Framing / composition primitives (centered, rule of thirds, symmetry, etc.)."
	category:    "composition"
	matrix_presets: [
		{
			label: "Composition Variants"
			query: {
				row_key:       "tag:modifier_family"
				col_key:       "tag:variant"
				package_name:  "core_composition"
				include_empty: true
			}
		},
		{
			label: "Framing Tokens"
			query: {
				row_key:       "tag:composition_framing"
				col_key:       "category"
				package_name:  "core_composition"
				include_empty: true
			}
		},
	]
}

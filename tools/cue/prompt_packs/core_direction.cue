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
					]
				}
				variants: [
					{
						key: "in"
						tags: {
							direction: "in"
							direction_synonyms: [
								"inward",
								"inside",
								"into",
								"toward center",
								"closer",
							]
						}
					},
					{
						key: "out"
						tags: {
							direction: "out"
							direction_synonyms: [
								"outward",
								"outside",
								"away",
								"from center",
								"further",
							]
						}
					},
					{
						key: "left"
						tags: {
							direction: "left"
							direction_synonyms: [
								"leftward",
								"port",
								"left side",
								"to the left",
								"slide left",
							]
						}
					},
					{
						key: "right"
						tags: {
							direction: "right"
							direction_synonyms: [
								"rightward",
								"starboard",
								"right side",
								"to the right",
								"slide right",
							]
						}
					},
					{
						key: "up"
						tags: {
							direction: "up"
							direction_synonyms: [
								"upward",
								"rise",
								"ascend",
								"look up",
								"toward ceiling",
							]
						}
					},
					{
						key: "down"
						tags: {
							direction: "down"
							direction_synonyms: [
								"downward",
								"lower",
								"descend",
								"look down",
								"toward floor",
							]
						}
					},
					{
						key: "forward"
						tags: {
							direction: "forward"
							direction_synonyms: [
								"ahead",
								"onward",
								"toward",
								"advance",
								"move forward",
							]
						}
					},
					{
						key: "backward"
						tags: {
							direction: "backward"
							direction_synonyms: [
								"back",
								"reverse",
								"rearward",
								"retreat",
								"step back",
							]
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

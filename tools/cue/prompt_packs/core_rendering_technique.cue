package promptpacks

pack: #PromptBlockPackV1 & {
	version:      "1.0.0"
	package_name: "core_rendering_technique"
	defaults: {
		is_public: true
		source:    "system"
	}
	blocks: [
		{
			id: "technique"
			block_schema: {
				id_prefix: "core.rendering.technique"
				category:  "rendering_technique"
				role:      "style"
				capabilities: ["style.rendering"]
				tags: {
					modifier_family:  "rendering_technique"
					modality_support: "both"
					temporal:         "neutral"
				}
				variants: [
					{
						key:  "cinematic_film_grain"
						text: "Render with cinematic film grain, warm tungsten highlights, and controlled contrast."
						tags: {
							rendering_technique: "cinematic_film_grain"
						}
					},
					{
						key:  "watercolor_wash"
						text: "Render as watercolor with soft pigment bleeding, visible brushstrokes, and paper texture."
						tags: {
							rendering_technique: "watercolor_wash"
						}
					},
					{
						key:  "cel_shaded_flat"
						text: "Render with cel-shaded flat color, clean contour lines, and minimal tonal gradients."
						tags: {
							rendering_technique: "cel_shaded_flat"
						}
					},
					{
						key:  "victorian_etching"
						text: "Render with Victorian etching crosshatching, stippled shadow, and engraved line detail."
						tags: {
							rendering_technique: "victorian_etching"
						}
					},
					{
						key:  "oil_impasto"
						text: "Render as oil impasto with thick paint buildup, directional strokes, and tactile texture."
						tags: {
							rendering_technique: "oil_impasto"
						}
					},
				]
			}
		},
	]
}

manifest: #PromptPackManifestV1 & {
	id:          "core-rendering-technique"
	title:       "Core Rendering Technique"
	description: "Global rendering medium/process modifiers."
	matrix_presets: [
		{
			label: "Rendering Technique Variants"
			query: {
				row_key:       "tag:modifier_family"
				col_key:       "tag:variant"
				package_name:  "core_rendering_technique"
				include_empty: true
			}
		},
		{
			label: "Rendering Technique Catalog"
			query: {
				row_key:       "tag:rendering_technique"
				col_key:       "tag:variant"
				package_name:  "core_rendering_technique"
				include_empty: true
			}
		},
	]
}

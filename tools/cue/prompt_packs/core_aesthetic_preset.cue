package promptpacks

pack: #PromptBlockPackV1 & {
	version:      "1.0.0"
	package_name: "core_aesthetic_preset"
	defaults: {
		is_public: true
		source:    "system"
	}
	blocks: [
		{
			id: "preset"
			block_schema: {
				id_prefix: "core.aesthetic.preset"
				category:  "aesthetic_preset"
				role:      "style"
				capabilities: ["style.aesthetic"]
				tags: {
					modifier_family:  "aesthetic_preset"
					modality_support: "both"
					temporal:         "neutral"
				}
				variants: [
					{
						key:  "steampunk"
						text: "Steampunk aesthetic with brass machinery motifs, Victorian-era industrial detail, and weathered engineered forms."
						tags: {
							aesthetic_preset: "steampunk"
						}
					},
					{
						key:  "cyberpunk"
						text: "Cyberpunk aesthetic with neon-accented contrast, dense urban tech clutter, and sharp high-voltage geometry."
						tags: {
							aesthetic_preset: "cyberpunk"
						}
					},
					{
						key:  "art_deco"
						text: "Art Deco aesthetic with geometric symmetry, polished metallic accents, and refined ornamental rhythm."
						tags: {
							aesthetic_preset: "art_deco"
						}
					},
					{
						key:  "gothic_noir"
						text: "Gothic noir aesthetic with dramatic shadow architecture, ornate dark materials, and moody high-contrast atmosphere."
						tags: {
							aesthetic_preset: "gothic_noir"
						}
					},
					{
						key:  "retrofuturism"
						text: "Retrofuturist aesthetic with mid-century future design language, analog controls, and optimistic industrial styling."
						tags: {
							aesthetic_preset: "retrofuturism"
						}
					},
				]
			}
		},
	]
}

manifest: #PromptPackManifestV1 & {
	id:          "core-aesthetic-preset"
	title:       "Core Aesthetic Preset"
	description: "Bundled thematic aesthetic modifiers."
	matrix_presets: [
		{
			label: "Aesthetic Preset Variants"
			query: {
				row_key:       "tag:modifier_family"
				col_key:       "tag:variant"
				package_name:  "core_aesthetic_preset"
				include_empty: true
			}
		},
		{
			label: "Aesthetic Preset Catalog"
			query: {
				row_key:       "tag:aesthetic_preset"
				col_key:       "tag:variant"
				package_name:  "core_aesthetic_preset"
				include_empty: true
			}
		},
	]
}

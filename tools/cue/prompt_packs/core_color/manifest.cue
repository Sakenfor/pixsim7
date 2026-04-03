package promptpacks

manifest: #PromptPackManifestV1 & {
	id:          "core-color"
	title:       "Core Color"
	description: "Color grade primitives that bridge lighting and style language."
	matrix_presets: [
		{
			label: "Color Grade Variants"
			query: {
				row_key:       "tag:modifier_family"
				col_key:       "tag:variant"
				package_name:  "core_color"
				include_empty: true
			}
		},
		{
			label: "Temperature by Saturation"
			query: {
				row_key:       "tag:grade_temperature"
				col_key:       "tag:grade_saturation"
				package_name:  "core_color"
				include_empty: true
			}
		},
	]
}

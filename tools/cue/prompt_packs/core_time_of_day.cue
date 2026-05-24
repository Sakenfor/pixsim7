package promptpacks

pack: #PromptBlockPackV1 & {
	version:      "1.0.0"
	package_name: "core_time_of_day"
	defaults: {
		is_public: true
		source:    "system"
	}
	blocks: [
		{
			id: "time_of_day"
			block_schema: {
				id_prefix: "core.scene.time_of_day"
				category:  "scene"
				capabilities: ["scene.time_of_day"]
				text_template: "Time-of-day token: {variant}."
				tags: {
					modifier_family:  "time_of_day"
					modality_support: "both"
					temporal:         "neutral"
				}
				op: {
					op_id:        "scene.timeofday.set"
					signature_id: "scene.timeofday.v1"
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
							key:     "phase"
							type:    "enum"
							default: "midday"
							enum:    #TimeOfDayValues
							tag_key: "time_of_day_phase"
						},
					]
					default_args: {
						phase: "midday"
					}
				}
				// Per-variant synonyms feed the projection token index directly
				// (plain `*_synonyms` tags are lexical, like core_direction's
				// direction_synonyms). Multi-word entries also register as
				// adjacency phrases. The phrase-aware block-id gate keeps a bare
				// "golden"/"hour" from matching golden_hour on its own.
				variants: [
					{
						key: "dawn"
						op_args: phase: "dawn"
						tags: time_of_day_synonyms: ["sunrise", "daybreak", "first light", "early dawn"]
					},
					{
						key: "morning"
						op_args: phase: "morning"
						tags: time_of_day_synonyms: ["early morning", "morning light", "mid morning"]
					},
					{
						key: "midday"
						op_args: phase: "midday"
						tags: time_of_day_synonyms: ["noon", "high noon", "midday sun", "middle of the day"]
					},
					{
						key: "golden_hour"
						op_args: phase: "golden_hour"
						tags: time_of_day_synonyms: ["golden hour", "magic hour", "warm evening sun", "late golden light"]
					},
					{
						key: "dusk"
						op_args: phase: "dusk"
						tags: time_of_day_synonyms: ["twilight", "sunset", "nightfall", "evening light"]
					},
					{
						key: "night"
						op_args: phase: "night"
						tags: time_of_day_synonyms: ["nighttime", "midnight", "moonlit", "after dark"]
					},
					{
						key: "blue_hour"
						op_args: phase: "blue_hour"
						tags: time_of_day_synonyms: ["blue hour", "predawn blue", "post sunset blue"]
					},
				]
			}
		},
	]
}

tag_registry: #TagRegistryV1 & {
	time_of_day_phase: {
		label:          "Time of Day"
		description:    "Diurnal phase of the scene: dawn, morning, midday, golden_hour, dusk, night, or blue_hour."
		allowed_values: #TimeOfDayValues
		applies_to: [{role: "modifier", category: "scene"}]
		status: "active"
	}
}

manifest: #PromptPackManifestV1 & {
	id:          "core-time-of-day"
	title:       "Core Time of Day"
	description: "Diurnal scene-condition primitives (dawn → night)."
	category:    "scene"
	matrix_presets: [
		{
			label: "Time-of-Day Variants"
			query: {
				row_key:       "tag:modifier_family"
				col_key:       "tag:variant"
				package_name:  "core_time_of_day"
				include_empty: true
			}
		},
		{
			label: "Phase Tokens"
			query: {
				row_key:       "tag:time_of_day_phase"
				col_key:       "category"
				package_name:  "core_time_of_day"
				include_empty: true
			}
		},
	]
}

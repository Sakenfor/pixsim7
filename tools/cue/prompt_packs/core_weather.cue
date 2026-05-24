package promptpacks

pack: #PromptBlockPackV1 & {
	version:      "1.0.0"
	package_name: "core_weather"
	defaults: {
		is_public: true
		source:    "system"
	}
	blocks: [
		{
			id: "weather"
			block_schema: {
				id_prefix: "core.scene.weather"
				category:  "scene"
				capabilities: ["scene.weather"]
				text_template: "Weather token: {variant}."
				tags: {
					modifier_family:  "weather"
					modality_support: "both"
					temporal:         "neutral"
				}
				op: {
					op_id:        "scene.weather.set"
					signature_id: "scene.weather.v1"
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
							key:     "condition"
							type:    "enum"
							default: "sunny"
							enum:    #WeatherValues
							tag_key: "weather_condition"
						},
					]
					default_args: {
						condition: "sunny"
					}
				}
				// Per-variant synonyms feed the projection token index directly
				// (plain `*_synonyms` tags are lexical). The "clear" condition is
				// authored as a `clear_sky` compound block-id so the phrase-aware
				// gate stops a bare "clear" (a clear shot / clear water) from
				// false-matching — it needs "clear sky" or both tokens.
				variants: [
					{
						key: "sunny"
						op_args: condition: "sunny"
						// Canonical token is the distinctive "sunny", NOT the
						// generic "clear" — and no "clear"-bearing synonym — so a
						// "clear shot"/"clear water" can't false-match. Clear-sky
						// prose is covered via cloudless / blue sky.
						tags: weather_synonyms: ["cloudless", "blue sky", "bright sunshine", "sunlit", "fair weather"]
					},
					{
						key: "overcast"
						op_args: condition: "overcast"
						tags: weather_synonyms: ["cloudy", "grey sky", "gray sky", "gloomy sky", "heavy clouds"]
					},
					{
						key: "rain"
						op_args: condition: "rain"
						tags: weather_synonyms: ["rainy", "rainfall", "downpour", "drizzle", "pouring rain"]
					},
					{
						key: "snow"
						op_args: condition: "snow"
						tags: weather_synonyms: ["snowy", "snowfall", "snowing", "blizzard", "falling snow"]
					},
					{
						key: "fog"
						op_args: condition: "fog"
						tags: weather_synonyms: ["foggy", "mist", "misty", "haze", "hazy"]
					},
					{
						key: "storm"
						op_args: condition: "storm"
						tags: weather_synonyms: ["stormy", "thunderstorm", "lightning", "tempest", "thunder"]
					},
					{
						key: "wind"
						op_args: condition: "wind"
						tags: weather_synonyms: ["windy", "gusty", "blustery", "gusts", "strong breeze"]
					},
				]
			}
		},
	]
}

tag_registry: #TagRegistryV1 & {
	weather_condition: {
		label:          "Weather"
		description:    "Atmospheric condition of the scene: clear, overcast, rain, snow, fog, storm, or wind."
		allowed_values: #WeatherValues
		applies_to: [{role: "modifier", category: "scene"}]
		status: "active"
	}
}

manifest: #PromptPackManifestV1 & {
	id:          "core-weather"
	title:       "Core Weather"
	description: "Atmospheric / weather-condition scene primitives."
	category:    "scene"
	matrix_presets: [
		{
			label: "Weather Variants"
			query: {
				row_key:       "tag:modifier_family"
				col_key:       "tag:variant"
				package_name:  "core_weather"
				include_empty: true
			}
		},
		{
			label: "Condition Tokens"
			query: {
				row_key:       "tag:weather_condition"
				col_key:       "category"
				package_name:  "core_weather"
				include_empty: true
			}
		},
	]
}

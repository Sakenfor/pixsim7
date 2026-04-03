package promptpacks

#CoreColorVariants: [
	{
		key: "neutral_clean"
		tags: {
			grade_synonyms: ["balanced color", "neutral look", "clean grade"]
		}
		op_args: {
			temperature: "neutral"
			saturation:  "medium"
			contrast:    "medium"
			exposure:    "balanced"
		}
	},
	{
		key: "warm_golden_hour"
		tags: {
			grade_synonyms: [
				"golden hour",
				"warm sunlight",
				"amber tones",
				"cozy lighting",
			]
		}
		op_args: {
			temperature: "warm"
			saturation:  "high"
			contrast:    "low"
			exposure:    "bright"
		}
	},
	{
		key: "cool_moonlit"
		tags: {
			grade_synonyms: [
				"moonlit",
				"blue hour",
				"cool lighting",
				"steel blue tones",
			]
		}
		op_args: {
			temperature: "cool"
			saturation:  "low"
			contrast:    "high"
			exposure:    "low"
		}
	},
	{
		key: "teal_orange_cinematic"
		tags: {
			grade_synonyms: [
				"teal and orange",
				"blockbuster",
				"cinematic grade",
				"film look",
			]
		}
		op_args: {
			temperature: "cool"
			saturation:  "high"
			contrast:    "high"
			exposure:    "balanced"
		}
	},
	{
		key: "desaturated_filmic"
		tags: {
			grade_synonyms: ["desaturated", "muted palette", "filmic", "matte look"]
		}
		op_args: {
			temperature: "neutral"
			saturation:  "muted"
			contrast:    "medium"
			exposure:    "low"
		}
	},
	{
		key: "high_contrast_noir"
		tags: {
			grade_synonyms: [
				"noir",
				"moody contrast",
				"dramatic shadows",
				"monochrome feel",
			]
		}
		op_args: {
			temperature: "cool"
			saturation:  "low"
			contrast:    "punchy"
			exposure:    "dark"
		}
	},
	{
		key: "pastel_dreamy"
		tags: {
			grade_synonyms: ["pastel", "dreamy", "airy style", "soft color"]
		}
		op_args: {
			temperature: "warm"
			saturation:  "low"
			contrast:    "soft"
			exposure:    "bright"
		}
	},
	{
		key: "vibrant_pop"
		tags: {
			grade_synonyms: [
				"vibrant color",
				"punchy palette",
				"pop art",
				"saturated style",
			]
		}
		op_args: {
			temperature: "warm"
			saturation:  "vibrant"
			contrast:    "high"
			exposure:    "high"
		}
	},
]

package promptpacks

// core_manner — cross-domain quality modifier.
//
// Describes HOW any action, motion, pose, or interaction is performed.
// Composes with subject action, motion, interaction, and camera ops alike.
// Domain packs that need intensity-specific language (e.g. romance, explicit)
// add variants here rather than duplicating intensity into action blocks.

pack: #PromptBlockPackV1 & {
	version:      "1.0.0"
	package_name: "core_manner"
	defaults: {
		is_public: true
		source:    "system"
	}
	blocks: [
		{
			id: "quality"
			block_schema: {
				id_prefix:    "core.manner.quality"
				category:     "manner"
				capabilities: ["manner.quality"]
				text_template: "Manner token: {variant}."
				tags: {
					modifier_family:  "manner"
					modality_support: "both"
					temporal:         "neutral"
					manner_context_synonyms: [
						"gently",
						"firmly",
						"slowly",
						"softly",
						"carefully",
						"sharply",
						"tenderly",
						"deliberately",
						"hesitantly",
						"urgently",
						"playfully",
						"fluidly",
					]
				}
				op: {
					op_id:        "manner.apply"
					signature_id: "manner.v1"
					modalities: ["both"]
					params: [
						{
							key:     "quality"
							type:    "enum"
							enum:    #MannerQualityValues
							default: "neutral"
							tag_key: "manner_quality"
						},
						{
							key:     "intensity"
							type:    "enum"
							enum:    #LevelValues
							default: "medium"
							tag_key: "manner_intensity"
						},
						{
							key:     "delay"
							type:    "enum"
							enum:    #MannerDelayValues
							default: "none"
							tag_key: "manner_delay"
						},
					]
					default_args: {
						quality:   "neutral"
						intensity: "medium"
						delay:     "none"
					}
				}
				variants: [
					// ── soft / low energy ──────────────────────────────────────────
					{
						key: "gentle"
						tags: {
							manner_synonyms: ["gently", "softly", "with care", "lightly", "carefully"]
						}
						op_args: {
							quality:   "gentle"
							intensity: "low"
						}
					},
					{
						key: "tender"
						tags: {
							manner_synonyms: ["tenderly", "with tenderness", "lovingly", "affectionately", "warmly"]
						}
						op_args: {
							quality:   "tender"
							intensity: "medium"
						}
					},
					{
						key: "languid"
						tags: {
							manner_synonyms: ["languidly", "lazily", "unhurriedly", "slowly", "with ease"]
						}
						op_args: {
							quality:   "languid"
							intensity: "low"
						}
					},
					{
						key: "hesitant"
						tags: {
							manner_synonyms: ["hesitantly", "uncertainly", "tentatively", "cautiously", "with hesitation"]
						}
						op_args: {
							quality:   "hesitant"
							intensity: "low"
						}
					},
					{
						key: "cautious"
						tags: {
							manner_synonyms: ["cautiously", "carefully", "warily", "guardedly", "with caution"]
						}
						op_args: {
							quality:   "cautious"
							intensity: "low"
						}
					},
					// ── measured / medium energy ───────────────────────────────────
					{
						key: "fluid"
						tags: {
							manner_synonyms: ["fluidly", "smoothly", "with flow", "continuously", "seamlessly"]
						}
						op_args: {
							quality:   "fluid"
							intensity: "medium"
						}
					},
					{
						key: "deliberate"
						tags: {
							manner_synonyms: ["deliberately", "intentionally", "with purpose", "measured", "controlled"]
						}
						op_args: {
							quality:   "deliberate"
							intensity: "medium"
						}
					},
					{
						key: "playful"
						tags: {
							manner_synonyms: ["playfully", "teasingly", "with playfulness", "lightly", "in jest"]
						}
						op_args: {
							quality:   "playful"
							intensity: "medium"
						}
					},
					// ── high energy / force ────────────────────────────────────────
					{
						key: "firm"
						tags: {
							manner_synonyms: ["firmly", "with firmness", "steadily", "with force", "decisively"]
						}
						op_args: {
							quality:   "firm"
							intensity: "medium"
						}
					},
					{
						key: "forceful"
						tags: {
							manner_synonyms: ["forcefully", "with force", "powerfully", "strongly", "hard"]
						}
						op_args: {
							quality:   "firm"
							intensity: "high"
						}
					},
					{
						key: "sharp"
						tags: {
							manner_synonyms: ["sharply", "suddenly", "with precision", "crisp", "snapping"]
						}
						op_args: {
							quality:   "sharp"
							intensity: "high"
						}
					},
					{
						key: "urgent"
						tags: {
							manner_synonyms: ["urgently", "desperately", "with urgency", "hurriedly", "frantically"]
						}
						op_args: {
							quality:   "urgent"
							intensity: "high"
						}
					},
					{
						key: "abrupt"
						tags: {
							manner_synonyms: ["abruptly", "suddenly", "without warning", "jarringly", "with a jolt"]
						}
						op_args: {
							quality:   "abrupt"
							intensity: "high"
						}
					},
				]
			}
		},
	]
}

manifest: #PromptPackManifestV1 & {
	id:          "core-manner"
	title:       "Core Manner"
	description: "Cross-domain quality modifier describing how an action, motion, or interaction is performed. Composes with subject action, motion, interaction, and camera ops."
	matrix_presets: [
		{
			label: "Manner Quality by Intensity"
			query: {
				row_key:       "tag:manner_quality"
				col_key:       "tag:manner_intensity"
				package_name:  "core_manner"
				include_empty: true
			}
		},
		{
			label: "Manner Variants"
			query: {
				row_key:       "tag:modifier_family"
				col_key:       "tag:variant"
				package_name:  "core_manner"
				include_empty: true
			}
		},
	]
}

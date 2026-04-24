package promptpacks

pack: #PromptBlockPackV1 & {
	version:      "1.0.0"
	package_name: "core_subject_expression"
	defaults: {
		is_public: true
		source:    "system"
	}
	blocks: [
		{
			id: "expression"
			block_schema: {
				id_prefix: "core.subject.expression"
				category:  "character_pose"
				capabilities: ["subject.expression"]
				text_template: "Expression token: {variant}."
				tags: {
					modifier_family:  "subject_expression"
					modality_support: "both"
					temporal:         "neutral"
				}
				op: {
					op_id:        "subject.expression.set"
					signature_id: "subject.expression.v1"
					modalities: ["both"]
					refs: [
						{
							key:        "subject"
							capability: "subject"
							required:   false
						},
					]
					params: [
						{
							key:     "expression"
							type:    "enum"
							default: "neutral"
							enum:    #ExpressionValues
							tag_key: "expression"
						},
						{
							key:     "intensity"
							type:    "enum"
							default: "medium"
							enum:    #LevelValues
							tag_key: "expression_intensity"
						},
					]
					default_args: {
						expression: "neutral"
						intensity:  "medium"
					}
				}
				variants: [
					{
						key: "neutral"
						tags: {
							expression_synonyms: ["neutral expression", "blank face", "expressionless", "composed", "impassive", "straight face"]
						}
						op_args: {
							expression: "neutral"
							intensity:  "low"
						}
					},
					{
						key: "smile_soft"
						tags: {
							expression_synonyms: ["soft smile", "slight smile", "gentle smile", "warm smile", "faint smile", "small smile"]
						}
						op_args: {
							expression: "happy"
							intensity:  "low"
						}
					},
					{
						key: "smile_wide"
						tags: {
							expression_synonyms: ["wide smile", "bright smile", "beaming", "grinning", "big smile", "full smile", "laughing"]
						}
						op_args: {
							expression: "happy"
							intensity:  "high"
						}
					},
					{
						key: "sad"
						tags: {
							expression_synonyms: ["sad expression", "downcast", "melancholy", "sorrowful", "forlorn", "frowning", "unhappy look"]
						}
						op_args: {
							expression: "sad"
							intensity:  "medium"
						}
					},
					{
						key: "tearful"
						tags: {
							expression_synonyms: ["tearful", "on verge of tears", "watery eyes", "about to cry", "eyes welling up", "distressed face"]
						}
						op_args: {
							expression: "sad"
							intensity:  "high"
						}
					},
					{
						key: "fearful"
						tags: {
							expression_synonyms: ["fearful expression", "scared look", "wide-eyed fear", "frightened", "terrified look", "panicked face"]
						}
						op_args: {
							expression: "fearful"
							intensity:  "medium"
						}
					},
					{
						key: "surprised"
						tags: {
							expression_synonyms: ["surprised expression", "shocked look", "wide eyes", "mouth agape", "startled", "astonished face"]
						}
						op_args: {
							expression: "surprised"
							intensity:  "medium"
						}
					},
					{
						key: "angry"
						tags: {
							expression_synonyms: ["angry expression", "scowl", "glaring", "clenched jaw", "furious look", "tense brow", "furrowed brow"]
						}
						op_args: {
							expression: "angry"
							intensity:  "medium"
						}
					},
					{
						key: "pained"
						tags: {
							expression_synonyms: ["pained expression", "wincing", "grimacing", "anguished look", "contorted with pain", "pain on face"]
						}
						op_args: {
							expression: "pained"
							intensity:  "high"
						}
					},
					{
						key: "disgusted"
						tags: {
							expression_synonyms: ["disgusted expression", "look of disgust", "revulsion", "sneer", "curled lip", "repulsed look"]
						}
						op_args: {
							expression: "disgusted"
							intensity:  "medium"
						}
					},
				]
			}
		},
	]
}

manifest: #PromptPackManifestV1 & {
	id:          "core-subject-expression"
	title:       "Core Subject Expression"
	description: "Facial expression primitives covering primary emotion states. Compose with core_manner for quality (e.g. smile_soft + manner.tender) and core_subject_look for gaze direction."
	matrix_presets: [
		{
			label: "Expression Variants"
			query: {
				row_key:       "tag:modifier_family"
				col_key:       "tag:variant"
				package_name:  "core_subject_expression"
				include_empty: true
			}
		},
		{
			label: "Expression by Intensity"
			query: {
				row_key:       "tag:expression"
				col_key:       "tag:expression_intensity"
				package_name:  "core_subject_expression"
				include_empty: true
			}
		},
	]
}

package promptpacks

// latin_breath_pattern — Latin phrase enhancers for breath rhythm and pattern.
//
// Distinct from latin_breath_proximity (sensation of breath near skin).
// This pack covers the temporal dynamics of breathing under physical or
// emotional load: interrupted sequences, consecutive failed attempts,
// held breath before release, rapid shallow succession, synchronisation
// between two subjects.
//
// pattern_type tag identifies the specific breath behaviour.
// rhythm_quality tag (irregular / rapid / suspended / rhythmic) describes
// the temporal character for pairing with motion or intensity variables.

pack: #PromptBlockPackV1 & {
	version:      "1.0.0"
	package_name: "latin_breath_pattern"
	defaults: {
		is_public: true
		source:    "system"
	}
	blocks: [
		{
			id: "pattern"
			block_schema: {
				id_prefix: "latin.breath.pattern"
				mode:      "surface"
				category:  "latin_enhancer"
				capabilities: ["latin.enhancer", "breath.pattern"]
				text_template: "Latin enhancer: {variant}."
				tags: {
					modifier_family:  "latin_enhancer"
					modality_support: "both"
					temporal:         "dynamic"
					domain: ["breath", "pattern", "rhythm"]
				}
				variants: [
					// ── technical — interrupted / broken ───────────────────────────
					{
						key:  "spiritus_interruptus"
						text: "spiritus interruptus"
						tags: {
							register:        "technical"
							pattern_type:    "interrupted"
							rhythm_quality:  "irregular"
							latin_form:      "noun_phrase"
						}
					},
					{
						key:  "exspiratio_fracta"
						text: "exspiratio fracta"
						tags: {
							register:        "technical"
							pattern_type:    "interrupted"
							rhythm_quality:  "irregular"
							latin_form:      "noun_phrase"
						}
					},
					{
						key:  "respiratio_inaequalis"
						text: "respiratio inaequalis"
						tags: {
							register:        "technical"
							pattern_type:    "interrupted"
							rhythm_quality:  "irregular"
							latin_form:      "noun_phrase"
						}
					},
					// ── technical — consecutive attempts ───────────────────────────
					{
						key:  "spiritus_semel_bis_ter_tentatur"
						text: "spiritus semel, bis, ter tentatur"
						tags: {
							register:        "technical"
							pattern_type:    "consecutive"
							rhythm_quality:  "rapid"
							latin_form:      "predication"
						}
					},
					{
						key:  "anhelitus_brevis_saepe_repetitus"
						text: "anhelitus brevis saepe repetitus"
						tags: {
							register:        "technical"
							pattern_type:    "consecutive"
							rhythm_quality:  "rapid"
							latin_form:      "noun_phrase"
						}
					},
					{
						key:  "inspiratio_incompleta_iteratur"
						text: "inspiratio incompleta iteratur"
						tags: {
							register:        "technical"
							pattern_type:    "consecutive"
							rhythm_quality:  "irregular"
							latin_form:      "predication"
						}
					},
					// ── technical — held / suspended ───────────────────────────────
					{
						key:  "spiritus_suspensus"
						text: "spiritus suspensus"
						tags: {
							register:        "technical"
							pattern_type:    "held"
							rhythm_quality:  "suspended"
							latin_form:      "noun_phrase"
						}
					},
					{
						key:  "pausa_inter_spiritus"
						text: "pausa inter spiritus"
						tags: {
							register:        "technical"
							pattern_type:    "held"
							rhythm_quality:  "suspended"
							latin_form:      "noun_phrase"
						}
					},
					// ── technical — rapid / shallow ────────────────────────────────
					{
						key:  "frequens_brevisque_anhelitus"
						text: "frequens brevisque anhelitus"
						tags: {
							register:        "technical"
							pattern_type:    "shallow"
							rhythm_quality:  "rapid"
							latin_form:      "noun_phrase"
						}
					},
					{
						key:  "singultus_spirandi"
						text: "singultus spirandi"
						tags: {
							register:        "technical"
							pattern_type:    "gasp"
							rhythm_quality:  "irregular"
							latin_form:      "noun_phrase"
						}
					},
					// ── poetic — struggle / failure ────────────────────────────────
					{
						key:  "quotiens_tentat_toties_deficit"
						text: "quotiens tentat, toties deficit"
						tags: {
							register:        "poetic"
							pattern_type:    "consecutive"
							rhythm_quality:  "irregular"
							latin_form:      "predication"
						}
					},
					{
						key:  "pulmones_impleri_nesciunt"
						text: "pulmones impleri nesciunt"
						tags: {
							register:        "poetic"
							pattern_type:    "shallow"
							rhythm_quality:  "rapid"
							latin_form:      "predication"
						}
					},
					{
						key:  "spiritus_in_se_haeret"
						text: "spiritus in se haeret"
						tags: {
							register:        "poetic"
							pattern_type:    "interrupted"
							rhythm_quality:  "suspended"
							latin_form:      "predication"
						}
					},
					{
						key:  "spiritus_sibi_restitui_non_potest"
						text: "spiritus sibi restitui non potest"
						tags: {
							register:        "poetic"
							pattern_type:    "consecutive"
							rhythm_quality:  "irregular"
							latin_form:      "predication"
						}
					},
					// ── poetic — held / release ────────────────────────────────────
					{
						key:  "aer_captus_dimitti_non_vult"
						text: "aer captus dimitti non vult"
						tags: {
							register:        "poetic"
							pattern_type:    "held"
							rhythm_quality:  "suspended"
							latin_form:      "predication"
						}
					},
					{
						key:  "inter_inspirationem_et_exspirationem_quies"
						text: "inter inspirationem et exspirationem quies"
						tags: {
							register:        "poetic"
							pattern_type:    "held"
							rhythm_quality:  "suspended"
							latin_form:      "noun_phrase"
						}
					},
					{
						key:  "halitus_tremulus"
						text: "halitus tremulus"
						tags: {
							register:        "poetic"
							pattern_type:    "interrupted"
							rhythm_quality:  "irregular"
							latin_form:      "noun_phrase"
						}
					},
					// ── poetic — synchronisation ───────────────────────────────────
					{
						key:  "spiritus_aliis_spiritibus_respondet"
						text: "spiritus aliis spiritibus respondet"
						tags: {
							register:        "poetic"
							pattern_type:    "synchronize"
							rhythm_quality:  "rhythmic"
							latin_form:      "predication"
						}
					},
					{
						key:  "duo_uno_rhythmo_spirant"
						text: "duo uno rhythmo spirant"
						tags: {
							register:        "poetic"
							pattern_type:    "synchronize"
							rhythm_quality:  "rhythmic"
							latin_form:      "predication"
						}
					},
					{
						key:  "anhelitus_anhelitui_respondet"
						text: "anhelitus anhelitui respondet"
						tags: {
							register:        "poetic"
							pattern_type:    "synchronize"
							rhythm_quality:  "rhythmic"
							latin_form:      "predication"
						}
					},
				]
			}
		},
	]
}

manifest: #PromptPackManifestV1 & {
	id:          "latin-breath-pattern"
	title:       "Latin Breath Pattern"
	description: "Latin phrase enhancers for breath rhythm and temporal pattern: interrupted sequences, consecutive failed attempts, held breath before release, rapid shallow succession, synchronisation. Tagged by pattern_type and rhythm_quality."
	matrix_presets: [
		{
			label: "Pattern Type by Register"
			query: {
				row_key:       "tag:pattern_type"
				col_key:       "tag:register"
				package_name:  "latin_breath_pattern"
				include_empty: true
			}
		},
		{
			label: "Rhythm Quality by Pattern Type"
			query: {
				row_key:       "tag:rhythm_quality"
				col_key:       "tag:pattern_type"
				package_name:  "latin_breath_pattern"
				include_empty: true
			}
		},
	]
}

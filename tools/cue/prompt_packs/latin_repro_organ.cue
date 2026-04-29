package promptpacks

// latin_repro_organ — Latin phrase enhancers for reproductive anatomy.
//
// Deliberately creature-agnostic: terms cover cloacal, mammalian, reptilian,
// and other morphologies without assuming human anatomy.  Organ class tags
// (receptive / insertive / neutral) allow targeted suggestion filtering.
//
// Technical variants use classical anatomical vocabulary (meatus, rima,
// processus, virga, membra genitalia).  Poetic variants draw on the Lucretian
// tradition of semina vitae and natural generative mystery.

pack: #PromptBlockPackV1 & {
	version:      "1.0.0"
	package_name: "latin_repro_organ"
	defaults: {
		is_public: true
		source:    "system"
	}
	blocks: [
		{
			id: "organ"
			block_schema: {
				id_prefix: "latin.repro.organ"
				mode:      "surface"
				category:  "latin_enhancer"
				capabilities: ["latin.enhancer", "repro.anatomy"]
				text_template: "Latin enhancer: {variant}."
				tags: {
					modifier_family:  "latin_enhancer"
					modality_support: "both"
					temporal:         "neutral"
					domain: ["reproductive", "anatomy", "creature_generic"]
				}
				variants: [
					// ── technical — receptive ──────────────────────────────────────
					{
						key:  "rima_generatrix"
						text: "rima generatrix"
						tags: {
							register:        "technical"
							organ_class:     "receptive"
							descriptor_type: "morphology"
							latin_form:      "noun_phrase"
						}
					},
					{
						key:  "meatus_receptivus"
						text: "meatus receptivus"
						tags: {
							register:        "technical"
							organ_class:     "receptive"
							descriptor_type: "morphology"
							latin_form:      "noun_phrase"
						}
					},
					{
						key:  "ostium_copulae"
						text: "ostium copulae"
						tags: {
							register:        "technical"
							organ_class:     "receptive"
							descriptor_type: "function"
							latin_form:      "noun_phrase"
						}
					},
					{
						key:  "cavum_natale"
						text: "cavum natale"
						tags: {
							register:        "technical"
							organ_class:     "receptive"
							descriptor_type: "morphology"
							latin_form:      "noun_phrase"
						}
					},
					{
						key:  "fovea_genitalis"
						text: "fovea genitalis"
						tags: {
							register:        "technical"
							organ_class:     "receptive"
							descriptor_type: "morphology"
							latin_form:      "noun_phrase"
						}
					},
					// ── technical — insertive ──────────────────────────────────────
					{
						key:  "processus_copulans"
						text: "processus copulans"
						tags: {
							register:        "technical"
							organ_class:     "insertive"
							descriptor_type: "morphology"
							latin_form:      "noun_phrase"
						}
					},
					{
						key:  "virga_generationis"
						text: "virga generationis"
						tags: {
							register:        "technical"
							organ_class:     "insertive"
							descriptor_type: "function"
							latin_form:      "noun_phrase"
						}
					},
					{
						key:  "apex_genitalis"
						text: "apex genitalis"
						tags: {
							register:        "technical"
							organ_class:     "insertive"
							descriptor_type: "morphology"
							latin_form:      "noun_phrase"
						}
					},
					// ── technical — neutral / bilateral ───────────────────────────
					{
						key:  "membra_genitalia"
						text: "membra genitalia"
						tags: {
							register:        "technical"
							organ_class:     "neutral"
							descriptor_type: "morphology"
							latin_form:      "noun_phrase"
						}
					},
					{
						key:  "natura_genitalis"
						text: "natura genitalis"
						tags: {
							register:        "technical"
							organ_class:     "neutral"
							descriptor_type: "function"
							latin_form:      "noun_phrase"
						}
					},
					{
						key:  "partes_generationis"
						text: "partes generationis"
						tags: {
							register:        "technical"
							organ_class:     "neutral"
							descriptor_type: "morphology"
							latin_form:      "noun_phrase"
						}
					},
					// ── poetic — receptive ─────────────────────────────────────────
					{
						key:  "porta_vitae"
						text: "porta vitae"
						tags: {
							register:        "poetic"
							organ_class:     "receptive"
							descriptor_type: "function"
							latin_form:      "noun_phrase"
						}
					},
					{
						key:  "arcanum_natale"
						text: "arcanum natale"
						tags: {
							register:        "poetic"
							organ_class:     "receptive"
							descriptor_type: "morphology"
							latin_form:      "noun_phrase"
						}
					},
					{
						key:  "thalamus_vitae"
						text: "thalamus vitae"
						tags: {
							register:        "poetic"
							organ_class:     "receptive"
							descriptor_type: "function"
							latin_form:      "noun_phrase"
						}
					},
					{
						key:  "fons_originis"
						text: "fons originis"
						tags: {
							register:        "poetic"
							organ_class:     "receptive"
							descriptor_type: "function"
							latin_form:      "noun_phrase"
						}
					},
					// ── poetic — insertive ─────────────────────────────────────────
					{
						key:  "hasta_seminis"
						text: "hasta seminis"
						tags: {
							register:        "poetic"
							organ_class:     "insertive"
							descriptor_type: "function"
							latin_form:      "noun_phrase"
						}
					},
					{
						key:  "fomes_generationis"
						text: "fomes generationis"
						tags: {
							register:        "poetic"
							organ_class:     "insertive"
							descriptor_type: "function"
							latin_form:      "noun_phrase"
						}
					},
					{
						key:  "nervus_propagationis"
						text: "nervus propagationis"
						tags: {
							register:        "poetic"
							organ_class:     "insertive"
							descriptor_type: "function"
							latin_form:      "noun_phrase"
						}
					},
					// ── poetic — neutral / bilateral ───────────────────────────────
					{
						key:  "semina_vitae"
						text: "semina vitae"
						tags: {
							register:        "poetic"
							organ_class:     "neutral"
							descriptor_type: "function"
							latin_form:      "noun_phrase"
						}
					},
					{
						key:  "copula_naturae"
						text: "copula naturae"
						tags: {
							register:        "poetic"
							organ_class:     "neutral"
							descriptor_type: "function"
							latin_form:      "noun_phrase"
						}
					},
					{
						key:  "nexus_vitae"
						text: "nexus vitae"
						tags: {
							register:        "poetic"
							organ_class:     "neutral"
							descriptor_type: "function"
							latin_form:      "noun_phrase"
						}
					},
				]
			}
		},
	]
}

manifest: #PromptPackManifestV1 & {
	id:          "latin-repro-organ"
	title:       "Latin Reproductive Organ"
	description: "Creature-agnostic Latin phrase enhancers for reproductive anatomy. Covers receptive, insertive, and neutral organ classes in both technical (meatus, rima, processus) and poetic (Lucretian semina vitae, porta vitae) registers."
	matrix_presets: [
		{
			label: "Organ Class by Register"
			query: {
				row_key:       "tag:organ_class"
				col_key:       "tag:register"
				package_name:  "latin_repro_organ"
				include_empty: true
			}
		},
		{
			label: "Descriptor Type by Organ Class"
			query: {
				row_key:       "tag:descriptor_type"
				col_key:       "tag:organ_class"
				package_name:  "latin_repro_organ"
				include_empty: true
			}
		},
	]
}

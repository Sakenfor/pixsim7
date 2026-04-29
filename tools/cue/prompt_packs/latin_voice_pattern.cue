package promptpacks

// latin_voice_pattern — Latin phrase enhancers for vocalization patterns.
//
// Companion to latin_breath_pattern: where that pack covers the mechanics
// of air moving, this one covers the sound produced — moans, sighs, gasps,
// suppressed and involuntary sounds.  Breath and voice share the same
// physical mechanism so both packs compose naturally on the same variable.
//
// Reuses pattern_type (interrupted / consecutive / held / suppressed /
// involuntary / released / synchronize) and rhythm_quality from
// latin_breath_pattern, and intensity from latin_touch_dynamics.
//
// New axis: voice_type (moan / sigh / gasp / murmur / cry) identifies the
// quality of the sound rather than its temporal pattern.

pack: #PromptBlockPackV1 & {
	version:      "1.0.0"
	package_name: "latin_voice_pattern"
	defaults: {
		is_public: true
		source:    "system"
	}
	blocks: [
		{
			id: "pattern"
			block_schema: {
				id_prefix: "latin.voice.pattern"
				mode:      "surface"
				category:  "latin_enhancer"
				capabilities: ["latin.enhancer", "voice.pattern"]
				text_template: "Latin enhancer: {variant}."
				tags: {
					modifier_family:  "latin_enhancer"
					modality_support: "both"
					temporal:         "dynamic"
					domain: ["voice", "sound", "pattern"]
				}
				variants: [
					// ── technical — interrupted / broken ───────────────────────────
					{
						key:  "gemitus_interruptus"
						text: "gemitus interruptus"
						tags: {
							register:        "technical"
							pattern_type:    "interrupted"
							rhythm_quality:  "irregular"
							voice_type:      "moan"
							intensity:       "moderate"
							latin_form:      "noun_phrase"
						}
					},
					{
						key:  "vox_fracta"
						text: "vox fracta"
						tags: {
							register:        "technical"
							pattern_type:    "interrupted"
							rhythm_quality:  "irregular"
							voice_type:      "cry"
							intensity:       "firm"
							latin_form:      "noun_phrase"
						}
					},
					{
						key:  "singultus_vocis"
						text: "singultus vocis"
						tags: {
							register:        "technical"
							pattern_type:    "interrupted"
							rhythm_quality:  "irregular"
							voice_type:      "gasp"
							intensity:       "moderate"
							latin_form:      "noun_phrase"
						}
					},
					// ── technical — suppressed / held ──────────────────────────────
					{
						key:  "gemitus_suppressus"
						text: "gemitus suppressus"
						tags: {
							register:        "technical"
							pattern_type:    "suppressed"
							rhythm_quality:  "suspended"
							voice_type:      "moan"
							intensity:       "firm"
							latin_form:      "noun_phrase"
						}
					},
					{
						key:  "vox_suspensa_ante_emissionem"
						text: "vox suspensa ante emissionem"
						tags: {
							register:        "technical"
							pattern_type:    "held"
							rhythm_quality:  "suspended"
							voice_type:      "cry"
							intensity:       "absolute"
							latin_form:      "noun_phrase"
						}
					},
					{
						key:  "suspirium_incompletum"
						text: "suspirium incompletum"
						tags: {
							register:        "technical"
							pattern_type:    "held"
							rhythm_quality:  "suspended"
							voice_type:      "sigh"
							intensity:       "subtle"
							latin_form:      "noun_phrase"
						}
					},
					// ── technical — consecutive / involuntary ──────────────────────
					{
						key:  "gemitus_geminatus_iteratusque"
						text: "gemitus geminatus iteratusque"
						tags: {
							register:        "technical"
							pattern_type:    "consecutive"
							rhythm_quality:  "rapid"
							voice_type:      "moan"
							intensity:       "firm"
							latin_form:      "noun_phrase"
						}
					},
					{
						key:  "vox_invita_emittitur"
						text: "vox invita emittitur"
						tags: {
							register:        "technical"
							pattern_type:    "involuntary"
							rhythm_quality:  "irregular"
							voice_type:      "cry"
							intensity:       "moderate"
							latin_form:      "predication"
						}
					},
					{
						key:  "fremitus_continuus"
						text: "fremitus continuus"
						tags: {
							register:        "technical"
							pattern_type:    "consecutive"
							rhythm_quality:  "rhythmic"
							voice_type:      "murmur"
							intensity:       "subtle"
							latin_form:      "noun_phrase"
						}
					},
					{
						key:  "vox_semel_bis_ter_erumpere_tentat"
						text: "vox semel, bis, ter erumpere tentat"
						tags: {
							register:        "technical"
							pattern_type:    "consecutive"
							rhythm_quality:  "irregular"
							voice_type:      "cry"
							intensity:       "absolute"
							latin_form:      "predication"
						}
					},
					// ── poetic — involuntary / betrayal ────────────────────────────
					{
						key:  "gemitus_qui_verba_non_habet"
						text: "gemitus qui verba non habet"
						tags: {
							register:        "poetic"
							pattern_type:    "involuntary"
							rhythm_quality:  "irregular"
							voice_type:      "moan"
							intensity:       "moderate"
							latin_form:      "predication"
						}
					},
					{
						key:  "vox_corporis_non_mentis"
						text: "vox corporis non mentis"
						tags: {
							register:        "poetic"
							pattern_type:    "involuntary"
							rhythm_quality:  "irregular"
							voice_type:      "moan"
							intensity:       "firm"
							latin_form:      "noun_phrase"
						}
					},
					{
						key:  "gemitus_gaudium_prodit"
						text: "gemitus gaudium prodit"
						tags: {
							register:        "poetic"
							pattern_type:    "involuntary"
							rhythm_quality:  "irregular"
							voice_type:      "moan"
							intensity:       "moderate"
							latin_form:      "predication"
						}
					},
					{
						key:  "silentium_victum_est"
						text: "silentium victum est"
						tags: {
							register:        "poetic"
							pattern_type:    "released"
							rhythm_quality:  "irregular"
							voice_type:      "cry"
							intensity:       "absolute"
							latin_form:      "predication"
						}
					},
					// ── poetic — suppressed / released ─────────────────────────────
					{
						key:  "vox_retenta_tandem_cedit"
						text: "vox retenta tandem cedit"
						tags: {
							register:        "poetic"
							pattern_type:    "released"
							rhythm_quality:  "suspended"
							voice_type:      "cry"
							intensity:       "absolute"
							latin_form:      "predication"
						}
					},
					{
						key:  "murmur_quod_audiri_non_debet"
						text: "murmur quod audiri non debet"
						tags: {
							register:        "poetic"
							pattern_type:    "suppressed"
							rhythm_quality:  "suspended"
							voice_type:      "murmur"
							intensity:       "subtle"
							latin_form:      "predication"
						}
					},
					{
						key:  "sonus_qui_ex_intimis_erumpit"
						text: "sonus qui ex intimis erumpit"
						tags: {
							register:        "poetic"
							pattern_type:    "released"
							rhythm_quality:  "irregular"
							voice_type:      "cry"
							intensity:       "firm"
							latin_form:      "predication"
						}
					},
					{
						key:  "sonitus_antiquior_pudore"
						text: "sonitus antiquior pudore"
						tags: {
							register:        "poetic"
							pattern_type:    "involuntary"
							rhythm_quality:  "irregular"
							voice_type:      "moan"
							intensity:       "absolute"
							latin_form:      "noun_phrase"
						}
					},
					// ── poetic — synchronisation ───────────────────────────────────
					{
						key:  "duae_voces_in_unam_confluunt"
						text: "duae voces in unam confluunt"
						tags: {
							register:        "poetic"
							pattern_type:    "synchronize"
							rhythm_quality:  "rhythmic"
							voice_type:      "moan"
							intensity:       "moderate"
							latin_form:      "predication"
						}
					},
					{
						key:  "vox_sine_voluntate"
						text: "vox sine voluntate"
						tags: {
							register:        "poetic"
							pattern_type:    "involuntary"
							rhythm_quality:  "irregular"
							voice_type:      "cry"
							intensity:       "firm"
							latin_form:      "noun_phrase"
						}
					},
				]
			}
		},
	]
}

manifest: #PromptPackManifestV1 & {
	id:          "latin-voice-pattern"
	title:       "Latin Voice Pattern"
	description: "Latin phrase enhancers for vocalization patterns: interrupted, suppressed, held, consecutive, involuntary, released, synchronised. Companion to latin_breath_pattern — reuses pattern_type, rhythm_quality, and intensity axes. New voice_type axis (moan/sigh/gasp/murmur/cry)."
	matrix_presets: [
		{
			label: "Pattern Type by Voice Type"
			query: {
				row_key:       "tag:pattern_type"
				col_key:       "tag:voice_type"
				package_name:  "latin_voice_pattern"
				include_empty: true
			}
		},
		{
			label: "Intensity by Register"
			query: {
				row_key:       "tag:intensity"
				col_key:       "tag:register"
				package_name:  "latin_voice_pattern"
				include_empty: true
			}
		},
	]
}

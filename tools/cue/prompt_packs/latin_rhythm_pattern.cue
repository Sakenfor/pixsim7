package promptpacks

// latin_rhythm_pattern — Latin phrase enhancers for rhythmic / temporal
// motion structure (as opposed to a single body-part's mechanics).
//
// Where latin_hip_motion / latin_breath_pattern / latin_voice_pattern
// describe one rhythm in one domain, this pack covers the *structure* of
// rhythm itself: a single carrier, two competing rhythms (counter), a
// fast pulse nested inside a slower carrier (nested), or two cooperating
// rhythms (layered). Composes naturally with the per-domain packs — e.g.
// "duo motus inter se pugnant" pairs with hip / breath / voice variants
// that supply the body referent.
//
// Reuses pattern_type, rhythm_quality, intensity, register, latin_form
// from the existing latin packs. Introduces ONE new axis:
//
//   rhythm_layering: single | counter | nested | layered
//     - single   : one rhythm; no other rhythm present
//     - counter  : two rhythms in opposition / friction
//     - nested   : a sub-rhythm inside a wider carrier rhythm
//     - layered  : two rhythms cooperating / running together
//
// ── Local enum values (this pack's contribution to the central tag
// registry; codegen unions allowed_values across packs that declare the
// same key with matching label/description). ───────────────────────────
#RhythmLayeringValues: ["single", "counter", "nested", "layered"]
#RhythmQualityValues:  ["continuous", "irregular", "rapid", "rhythmic"]
#PatternTypeValues:    ["consecutive", "embedded", "interrupted", "layered"]

pack: #PromptBlockPackV1 & {
	version:      "1.0.0"
	package_name: "latin_rhythm_pattern"
	defaults: {
		is_public: true
		source:    "system"
	}
	blocks: [
		{
			id: "pattern"
			block_schema: {
				id_prefix: "latin.rhythm.pattern"
				mode:      "surface"
				category:  "latin_enhancer"
				capabilities: ["latin.enhancer", "rhythm.pattern"]
				text_template: "Latin enhancer: {variant}."
				tags: {
					modifier_family:  "latin_enhancer"
					modality_support: "both"
					temporal:         "dynamic"
					domain: ["rhythm", "tempo", "pattern"]
				}
				variants: [
					// ── technical — counter (two rhythms in opposition) ────────────
					{
						key:  "duo_motus_inter_se_pugnant"
						text: "duo motus inter se pugnant"
						tags: {
							register:        "technical"
							pattern_type:    "layered"
							rhythm_quality:  "irregular"
							rhythm_layering: "counter"
							intensity:       "firm"
							latin_form:      "predication"
						}
					},
					{
						key:  "motus_alter_alteri_obstat"
						text: "motus alter alteri obstat"
						tags: {
							register:        "technical"
							pattern_type:    "layered"
							rhythm_quality:  "irregular"
							rhythm_layering: "counter"
							intensity:       "moderate"
							latin_form:      "predication"
						}
					},
					{
						key:  "tempora_dispar_simul_currunt"
						text: "tempora dispar simul currunt"
						tags: {
							register:        "technical"
							pattern_type:    "layered"
							rhythm_quality:  "irregular"
							rhythm_layering: "counter"
							intensity:       "moderate"
							latin_form:      "predication"
						}
					},
					// ── technical — nested (sub-rhythm inside a wider carrier) ─────
					{
						key:  "intra_motum_latum_trepidatio_brevior_latet"
						text: "intra motum latum trepidatio brevior latet"
						tags: {
							register:        "technical"
							pattern_type:    "embedded"
							rhythm_quality:  "rapid"
							rhythm_layering: "nested"
							intensity:       "moderate"
							latin_form:      "predication"
						}
					},
					{
						key:  "rhythmus_inferior_superiorem_interrumpit"
						text: "rhythmus inferior superiorem interrumpit"
						tags: {
							register:        "technical"
							pattern_type:    "interrupted"
							rhythm_quality:  "irregular"
							rhythm_layering: "nested"
							intensity:       "firm"
							latin_form:      "predication"
						}
					},
					{
						key:  "infra_rhythmum_maiorem_pulsus_minor_pulsat"
						text: "infra rhythmum maiorem pulsus minor pulsat"
						tags: {
							register:        "technical"
							pattern_type:    "embedded"
							rhythm_quality:  "rapid"
							rhythm_layering: "nested"
							intensity:       "subtle"
							latin_form:      "predication"
						}
					},
					// ── technical — layered (two rhythms cooperating) ──────────────
					{
						key:  "duo_pulsus_simul_currunt"
						text: "duo pulsus simul currunt"
						tags: {
							register:        "technical"
							pattern_type:    "layered"
							rhythm_quality:  "rhythmic"
							rhythm_layering: "layered"
							intensity:       "moderate"
							latin_form:      "predication"
						}
					},
					{
						key:  "rhythmus_duplex_se_invicem_complectitur"
						text: "rhythmus duplex se invicem complectitur"
						tags: {
							register:        "technical"
							pattern_type:    "layered"
							rhythm_quality:  "rhythmic"
							rhythm_layering: "layered"
							intensity:       "moderate"
							latin_form:      "predication"
						}
					},
					// ── technical — single carrier (one dominant rhythm) ───────────
					{
						key:  "motus_latus_et_placidus_continuus_manet"
						text: "motus latus et placidus continuus manet"
						tags: {
							register:        "technical"
							pattern_type:    "consecutive"
							rhythm_quality:  "continuous"
							rhythm_layering: "single"
							intensity:       "moderate"
							latin_form:      "predication"
						}
					},
					{
						key:  "motus_brevis_et_turbidus_alternat"
						text: "motus brevis et turbidus alternat"
						tags: {
							register:        "technical"
							pattern_type:    "consecutive"
							rhythm_quality:  "rapid"
							rhythm_layering: "single"
							intensity:       "firm"
							latin_form:      "predication"
						}
					},
					{
						key:  "tempus_constans_motum_ducit"
						text: "tempus constans motum ducit"
						tags: {
							register:        "technical"
							pattern_type:    "consecutive"
							rhythm_quality:  "rhythmic"
							rhythm_layering: "single"
							intensity:       "moderate"
							latin_form:      "predication"
						}
					},
					{
						key:  "cadentia_iterum_iterumque_redit"
						text: "cadentia iterum iterumque redit"
						tags: {
							register:        "technical"
							pattern_type:    "consecutive"
							rhythm_quality:  "rhythmic"
							rhythm_layering: "single"
							intensity:       "moderate"
							latin_form:      "predication"
						}
					},
					// ── poetic — counter / opposition ──────────────────────────────
					{
						key:  "alter_latus_et_placidus_alter_brevis_et_turbidus"
						text: "alter latus et placidus, alter brevis et turbidus"
						tags: {
							register:        "poetic"
							pattern_type:    "layered"
							rhythm_quality:  "irregular"
							rhythm_layering: "counter"
							intensity:       "moderate"
							latin_form:      "predication"
						}
					},
					{
						key:  "duo_tempora_in_eodem_corpore_pugnant"
						text: "duo tempora in eodem corpore pugnant"
						tags: {
							register:        "poetic"
							pattern_type:    "layered"
							rhythm_quality:  "irregular"
							rhythm_layering: "counter"
							intensity:       "firm"
							latin_form:      "predication"
						}
					},
					// ── poetic — nested / hidden sub-pulse ─────────────────────────
					{
						key:  "trepidatio_brevior_et_crebra_latet"
						text: "trepidatio brevior et crebra latet"
						tags: {
							register:        "poetic"
							pattern_type:    "embedded"
							rhythm_quality:  "rapid"
							rhythm_layering: "nested"
							intensity:       "subtle"
							latin_form:      "predication"
						}
					},
					{
						key:  "pulsus_subtus_rhythmum_dominantem_fluit"
						text: "pulsus subtus rhythmum dominantem fluit"
						tags: {
							register:        "poetic"
							pattern_type:    "embedded"
							rhythm_quality:  "continuous"
							rhythm_layering: "nested"
							intensity:       "subtle"
							latin_form:      "predication"
						}
					},
					// ── poetic — single carrier / pendulum-like ────────────────────
					{
						key:  "velut_libra_quae_tardis_motibus_movetur"
						text: "velut libra quae tardis motibus movetur"
						tags: {
							register:        "poetic"
							pattern_type:    "consecutive"
							rhythm_quality:  "continuous"
							rhythm_layering: "single"
							intensity:       "subtle"
							latin_form:      "predication"
						}
					},
					{
						key:  "pondus_more_librae_oscillat"
						text: "pondus more librae oscillat"
						tags: {
							register:        "poetic"
							pattern_type:    "consecutive"
							rhythm_quality:  "continuous"
							rhythm_layering: "single"
							intensity:       "moderate"
							latin_form:      "predication"
						}
					},
				]
			}
		},
	]
}

// Register every tag this pack uses in matrix_presets, with this pack's
// own value sets. Codegen unions allowed_values across packs that share
// the key with matching label/description (see how motion_type is
// declared independently in latin_chest_torso / latin_touch_dynamics /
// latin_gaze_breath / latin_lips_mouth and ends up as a single union in
// the central registry).
tag_registry: #TagRegistryV1 & {
	rhythm_layering: {
		label:          "Rhythm Layering"
		description:    "How a phrase's rhythm relates to other rhythms: a single stream, two streams in opposition (counter), a sub-rhythm inside a carrier (nested), or two cooperating streams (layered)."
		allowed_values: #RhythmLayeringValues
		applies_to: [{role: "modifier", category: "latin_enhancer"}]
		status: "active"
	}
	rhythm_quality: {
		label:          "Rhythm Quality"
		description:    "Temporal character of a rhythm: continuous, irregular, rapid, rhythmic, etc. Other packs (latin_breath_pattern, latin_voice_pattern, latin_hip_motion) contribute their own values via codegen union."
		allowed_values: #RhythmQualityValues
		applies_to: [{role: "modifier", category: "latin_enhancer"}]
		status: "active"
	}
	pattern_type: {
		label:          "Pattern Type"
		description:    "Discrete pattern shape of a rhythm or sequence: consecutive, embedded, interrupted, layered, etc. Other packs contribute their own values via codegen union."
		allowed_values: #PatternTypeValues
		applies_to: [{role: "modifier", category: "latin_enhancer"}]
		status: "active"
	}
}

manifest: #PromptPackManifestV1 & {
	id:          "latin-rhythm-pattern"
	title:       "Latin Rhythm Pattern"
	description: "Latin phrase enhancers for rhythmic / temporal motion structure: single carrier, counter (opposing rhythms), nested (sub-pulse inside a carrier), or layered (cooperating rhythms). Composes with per-domain packs (hip / breath / voice) that supply the body referent. Introduces the rhythm_layering axis."
	category:    "latin"
	matrix_presets: [
		{
			label: "Layering by Rhythm Quality"
			query: {
				row_key:       "tag:rhythm_layering"
				col_key:       "tag:rhythm_quality"
				package_name:  "latin_rhythm_pattern"
				include_empty: true
			}
		},
		{
			label: "Layering by Register"
			query: {
				row_key:       "tag:rhythm_layering"
				col_key:       "tag:register"
				package_name:  "latin_rhythm_pattern"
				include_empty: true
			}
		},
	]
}

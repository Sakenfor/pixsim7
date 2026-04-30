package promptpacks

// latin_hip_motion — Latin phrase enhancers for hip and pelvic mechanics.
//
// Not dance-move names — biomechanical descriptions of how the pelvis and
// coxae move: sway, undulation, rotation, drop, figure-eight, accent.
// Designed to pair with technique variables describing step patterns or
// motion sequences (e.g. asymmetric weight-shift patterns like 2-2-3).
//
// rhythm_quality tag (continuous / accented / asymmetric / circular) helps
// match phrases to the temporal character of the motion being described.

pack: #PromptBlockPackV1 & {
	version:      "1.0.0"
	package_name: "latin_hip_motion"
	defaults: {
		is_public: true
		source:    "system"
	}
	blocks: [
		{
			id: "mechanics"
			block_schema: {
				id_prefix: "latin.hip.mechanics"
				mode:      "surface"
				category:  "latin_enhancer"
				capabilities: ["latin.enhancer", "hip.motion"]
				text_template: "Latin enhancer: {variant}."
				tags: {
					modifier_family:  "latin_enhancer"
					modality_support: "both"
					temporal:         "continuous"
					domain: ["hip", "pelvis", "motion_mechanics"]
				}
				variants: [
					// ── technical — lateral / sway ─────────────────────────────────
					{
						key:  "pelvis_lateraliter_flectitur"
						text: "pelvis lateraliter flectitur"
						tags: {
							register:        "technical"
							motion_type:     "sway"
							rhythm_quality:  "continuous"
							latin_form:      "predication"
						}
					},
					{
						key:  "pondus_inter_coxas_transit"
						text: "pondus inter coxas transit"
						tags: {
							register:        "technical"
							motion_type:     "sway"
							rhythm_quality:  "accented"
							latin_form:      "predication"
						}
					},
					{
						key:  "coxae_alternae_descendunt"
						text: "coxae alternae descendunt"
						tags: {
							register:        "technical"
							motion_type:     "drop"
							rhythm_quality:  "asymmetric"
							latin_form:      "predication"
						}
					},
					{
						key:  "motus_coxarum_asymmetricus"
						text: "motus coxarum asymmetricus"
						tags: {
							register:        "technical"
							motion_type:     "sway"
							rhythm_quality:  "asymmetric"
							latin_form:      "noun_phrase"
						}
					},
					// ── technical — rotation / circle ──────────────────────────────
					{
						key:  "pelvis_in_circulum_volvitur"
						text: "pelvis in circulum volvitur"
						tags: {
							register:        "technical"
							motion_type:     "rotate"
							rhythm_quality:  "circular"
							latin_form:      "predication"
						}
					},
					{
						key:  "articulatio_coxae_gyrat"
						text: "articulatio coxae gyrat"
						tags: {
							register:        "technical"
							motion_type:     "rotate"
							rhythm_quality:  "circular"
							latin_form:      "predication"
						}
					},
					{
						key:  "oscillatio_coxarum_libera"
						text: "oscillatio coxarum libera"
						tags: {
							register:        "technical"
							motion_type:     "sway"
							rhythm_quality:  "continuous"
							latin_form:      "noun_phrase"
						}
					},
					// ── technical — undulation / tilt ──────────────────────────────
					{
						key:  "pelvis_undulat_sine_pausa"
						text: "pelvis undulat sine pausa"
						tags: {
							register:        "technical"
							motion_type:     "undulate"
							rhythm_quality:  "continuous"
							latin_form:      "predication"
						}
					},
					{
						key:  "pelvis_ante_et_retro_inclinatur"
						text: "pelvis ante et retro inclinatur"
						tags: {
							register:        "technical"
							motion_type:     "tilt"
							rhythm_quality:  "accented"
							latin_form:      "predication"
						}
					},
					{
						key:  "femora_impellunt_coxas"
						text: "femora impellunt coxas"
						tags: {
							register:        "technical"
							motion_type:     "drive"
							rhythm_quality:  "accented"
							latin_form:      "predication"
						}
					},
					// ── poetic — wave / flow ───────────────────────────────────────
					{
						key:  "coxae_ut_fluctus_maris"
						text: "coxae ut fluctus maris moventur"
						tags: {
							register:        "poetic"
							motion_type:     "undulate"
							rhythm_quality:  "continuous"
							latin_form:      "predication"
						}
					},
					{
						key:  "undulatio_sine_initio_sine_fine"
						text: "undulatio sine initio sine fine"
						tags: {
							register:        "poetic"
							motion_type:     "undulate"
							rhythm_quality:  "continuous"
							latin_form:      "noun_phrase"
						}
					},
					{
						key:  "corpus_in_rhythmum_cedit"
						text: "corpus in rhythmum cedit"
						tags: {
							register:        "poetic"
							motion_type:     "sway"
							rhythm_quality:  "accented"
							latin_form:      "predication"
						}
					},
					{
						key:  "motus_serpentinus_carnis"
						text: "motus serpentinus carnis"
						tags: {
							register:        "poetic"
							motion_type:     "undulate"
							rhythm_quality:  "continuous"
							latin_form:      "noun_phrase"
						}
					},
					// ── poetic — orbital / celestial ───────────────────────────────
					{
						key:  "gyrus_lunaris_in_corpore"
						text: "gyrus lunaris in corpore"
						tags: {
							register:        "poetic"
							motion_type:     "rotate"
							rhythm_quality:  "circular"
							latin_form:      "noun_phrase"
						}
					},
					{
						key:  "coxae_orbem_imitantur"
						text: "coxae orbem imitantur"
						tags: {
							register:        "poetic"
							motion_type:     "rotate"
							rhythm_quality:  "circular"
							latin_form:      "predication"
						}
					},
					{
						key:  "pelvis_terrae_nutum_sequitur"
						text: "pelvis terrae nutum sequitur"
						tags: {
							register:        "poetic"
							motion_type:     "drop"
							rhythm_quality:  "accented"
							latin_form:      "predication"
						}
					},
					// ── poetic — accent / expression ───────────────────────────────
					{
						key:  "coxae_libere_regnant"
						text: "coxae libere regnant"
						tags: {
							register:        "poetic"
							motion_type:     "accent"
							rhythm_quality:  "accented"
							latin_form:      "predication"
						}
					},
					{
						key:  "pelvis_loquitur_quod_vox_non_potest"
						text: "pelvis loquitur quod vox non potest"
						tags: {
							register:        "poetic"
							motion_type:     "accent"
							rhythm_quality:  "asymmetric"
							latin_form:      "predication"
						}
					},
					{
						key:  "motus_antiquior_verbis"
						text: "motus antiquior verbis"
						tags: {
							register:        "poetic"
							motion_type:     "sway"
							rhythm_quality:  "continuous"
							latin_form:      "noun_phrase"
						}
					},
				]
			}
		},
	]
}

manifest: #PromptPackManifestV1 & {
	id:          "latin-hip-motion"
	title:       "Latin Hip Motion"
	description: "Latin phrase enhancers for hip and pelvic mechanics: sway, undulation, rotation, drop, figure-eight, accent. Pairs with technique variables for step patterns. rhythm_quality tag (continuous/accented/asymmetric/circular) matches phrases to temporal motion character."
	matrix_presets: [
		{
			label: "Motion Type by Register"
			query: {
				row_key:       "tag:motion_type"
				col_key:       "tag:register"
				package_name:  "latin_hip_motion"
				include_empty: true
			}
		},
		{
			label: "Rhythm Quality by Motion Type"
			query: {
				row_key:       "tag:rhythm_quality"
				col_key:       "tag:motion_type"
				package_name:  "latin_hip_motion"
				include_empty: true
			}
		},
	]
}

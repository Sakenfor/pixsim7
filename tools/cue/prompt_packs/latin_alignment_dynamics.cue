package promptpacks

// latin_alignment_dynamics — Latin phrase enhancers for body positioning and
// pre-contact alignment.
//
// Covers the preparatory phase: closing distance, orienting bodies relative to
// one another, finding the fitting position before coupling begins.
//
// Technical variants describe the mechanics (axis adjustment, angular approach,
// weight transfer).  Poetic variants draw on the classical tradition of
// mutual seeking, convergence, and the charged stillness before action.

pack: #PromptBlockPackV1 & {
	version:      "1.0.0"
	package_name: "latin_alignment_dynamics"
	defaults: {
		is_public: true
		source:    "system"
	}
	blocks: [
		{
			id: "pre_contact"
			block_schema: {
				id_prefix: "latin.align.pre_contact"
				mode:      "surface"
				category:  "latin_enhancer"
				capabilities: ["latin.enhancer", "alignment.dynamics"]
				text_template: "Latin enhancer: {variant}."
				tags: {
					modifier_family:  "latin_enhancer"
					modality_support: "both"
					temporal:         "anticipatory"
					domain: ["alignment", "positioning", "pre_contact"]
				}
				variants: [
					// ── technical register — mechanics / spatial ───────────────────
					{
						key:  "corpora_in_ordinem_disponuntur"
						text: "corpora in ordinem disponuntur"
						tags: {
							register:    "technical"
							intensity:   "subtle"
							motion_type: "align"
							applies_to:  "full_body"
							latin_form:  "predication"
						}
					},
					{
						key:  "pelvis_pelvi_accommodatur"
						text: "pelvis pelvi accommodatur"
						tags: {
							register:    "technical"
							intensity:   "moderate"
							motion_type: "align"
							applies_to:  "torso"
							latin_form:  "predication"
						}
					},
					{
						key:  "axis_corporis_dirigitur"
						text: "axis corporis dirigitur"
						tags: {
							register:    "technical"
							intensity:   "subtle"
							motion_type: "orient"
							applies_to:  "full_body"
							latin_form:  "predication"
						}
					},
					{
						key:  "angulus_inter_corpora_minuitur"
						text: "angulus inter corpora minuitur"
						tags: {
							register:    "technical"
							intensity:   "moderate"
							motion_type: "approach"
							applies_to:  "full_body"
							latin_form:  "predication"
						}
					},
					{
						key:  "femora_iuxta_femora_ponuntur"
						text: "femora iuxta femora ponuntur"
						tags: {
							register:    "technical"
							intensity:   "moderate"
							motion_type: "position"
							applies_to:  "limbs"
							latin_form:  "predication"
						}
					},
					{
						key:  "membra_in_situm_debitum_locantur"
						text: "membra in situm debitum locantur"
						tags: {
							register:    "technical"
							intensity:   "subtle"
							motion_type: "position"
							applies_to:  "full_body"
							latin_form:  "predication"
						}
					},
					{
						key:  "distantia_ultima_clauditur"
						text: "distantia ultima clauditur"
						tags: {
							register:    "technical"
							intensity:   "firm"
							motion_type: "close"
							applies_to:  "full_body"
							latin_form:  "predication"
						}
					},
					{
						key:  "positio_ante_copulam_paratur"
						text: "positio ante copulam paratur"
						tags: {
							register:    "technical"
							intensity:   "subtle"
							motion_type: "position"
							applies_to:  "full_body"
							latin_form:  "predication"
						}
					},
					{
						key:  "centrum_gravitatis_transfertur"
						text: "centrum gravitatis inter corpora transfertur"
						tags: {
							register:    "technical"
							intensity:   "moderate"
							motion_type: "align"
							applies_to:  "full_body"
							latin_form:  "predication"
						}
					},
					{
						key:  "contactus_primus_paratur"
						text: "contactus primus paratur"
						tags: {
							register:    "technical"
							intensity:   "subtle"
							motion_type: "approach"
							applies_to:  "full_body"
							latin_form:  "predication"
						}
					},
					// ── poetic register — convergence / mutual seeking ─────────────
					{
						key:  "locus_aptus_quaeritur"
						text: "locus aptus quaeritur"
						tags: {
							register:    "poetic"
							intensity:   "subtle"
							motion_type: "position"
							applies_to:  "full_body"
							latin_form:  "predication"
						}
					},
					{
						key:  "pars_suam_partem_quaerit"
						text: "pars suam partem quaerit"
						tags: {
							register:    "poetic"
							intensity:   "subtle"
							motion_type: "align"
							applies_to:  "full_body"
							latin_form:  "predication"
						}
					},
					{
						key:  "duo_in_unum_confluunt"
						text: "duo in unum paulatim confluunt"
						tags: {
							register:    "poetic"
							intensity:   "moderate"
							motion_type: "approach"
							applies_to:  "full_body"
							latin_form:  "predication"
						}
					},
					{
						key:  "ultima_intervalla_clauduntur"
						text: "ultima intervalla clauduntur"
						tags: {
							register:    "poetic"
							intensity:   "firm"
							motion_type: "close"
							applies_to:  "full_body"
							latin_form:  "predication"
						}
					},
					{
						key:  "silentium_ante_tonitrua"
						text: "silentium ante tonitrua"
						tags: {
							register:    "poetic"
							intensity:   "subtle"
							motion_type: "approach"
							applies_to:  "full_body"
							latin_form:  "noun_phrase"
						}
					},
					{
						key:  "corpora_mutuum_sibi_locum_parant"
						text: "corpora mutuum sibi locum parant"
						tags: {
							register:    "poetic"
							intensity:   "moderate"
							motion_type: "position"
							applies_to:  "full_body"
							latin_form:  "predication"
						}
					},
					{
						key:  "corpora_tractim_invicem_accedunt"
						text: "corpora tractim invicem accedunt"
						tags: {
							register:    "poetic"
							intensity:   "subtle"
							motion_type: "approach"
							applies_to:  "full_body"
							latin_form:  "predication"
						}
					},
					{
						key:  "finis_distantiae_incipit_unitas"
						text: "ubi finis distantiae, ibi incipit unitas"
						tags: {
							register:    "poetic"
							intensity:   "firm"
							motion_type: "close"
							applies_to:  "full_body"
							latin_form:  "predication"
						}
					},
					{
						key:  "corpora_sibi_cedunt"
						text: "corpora sibi ultro cedunt"
						tags: {
							register:    "poetic"
							intensity:   "moderate"
							motion_type: "align"
							applies_to:  "full_body"
							latin_form:  "predication"
						}
					},
					{
						key:  "motus_ultimus_ante_quietem"
						text: "motus ultimus ante quietem"
						tags: {
							register:    "poetic"
							intensity:   "subtle"
							motion_type: "position"
							applies_to:  "full_body"
							latin_form:  "noun_phrase"
						}
					},
				]
			}
		},
	]
}

manifest: #PromptPackManifestV1 & {
	id:          "latin-alignment-dynamics"
	title:       "Latin Alignment Dynamics"
	description: "Curated Latin phrase enhancers for body positioning and pre-contact alignment. Covers the preparatory phase before coupling: axis orientation, angular approach, closing distance, mutual seeking."
	matrix_presets: [
		{
			label: "Register by Intensity"
			query: {
				row_key:       "tag:register"
				col_key:       "tag:intensity"
				package_name:  "latin_alignment_dynamics"
				include_empty: true
			}
		},
		{
			label: "Motion Type by Register"
			query: {
				row_key:       "tag:motion_type"
				col_key:       "tag:register"
				package_name:  "latin_alignment_dynamics"
				include_empty: true
			}
		},
	]
}

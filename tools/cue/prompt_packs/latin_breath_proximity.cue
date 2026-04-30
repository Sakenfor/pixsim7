package promptpacks

// latin_breath_proximity — Latin phrase enhancers for breath near the ear.
//
// Covers the multi-sensory experience of close exhalation: thermal (warmth
// of vapor on skin), auditory (sound of breath in the ear canal), tactile
// (air pressure against the pinna and neck).
//
// `sense` tag (thermal / auditory / tactile / olfactory) identifies the
// primary channel of the phrase, allowing targeted pairing with sensory
// variables.  `proximity` tag (near / intimate / contact) describes the
// implied spatial relationship.

pack: #PromptBlockPackV1 & {
	version:      "1.0.0"
	package_name: "latin_breath_proximity"
	defaults: {
		is_public: true
		source:    "system"
	}
	blocks: [
		{
			id: "ear_breath"
			block_schema: {
				id_prefix: "latin.breath.ear"
				mode:      "surface"
				category:  "latin_enhancer"
				capabilities: ["latin.enhancer", "breath.proximity"]
				text_template: "Latin enhancer: {variant}."
				tags: {
					modifier_family:  "latin_enhancer"
					modality_support: "both"
					temporal:         "continuous"
					domain: ["breath", "proximity", "sensory"]
				}
				variants: [
					// ── technical — thermal ────────────────────────────────────────
					{
						key:  "vapor_oris_aurem_calfacit"
						text: "vapor oris aurem calfacit"
						tags: {
							register:    "technical"
							sense:       "thermal"
							proximity:   "contact"
							breath_type: "exhale"
							latin_form:  "predication"
						}
					},
					{
						key:  "calor_spiritus_cutem_tangit"
						text: "calor spiritus cutem tangit"
						tags: {
							register:    "technical"
							sense:       "thermal"
							proximity:   "intimate"
							breath_type: "exhale"
							latin_form:  "predication"
						}
					},
					{
						key:  "tepor_oris_propinqui"
						text: "tepor oris propinqui"
						tags: {
							register:    "technical"
							sense:       "thermal"
							proximity:   "near"
							breath_type: "exhale"
							latin_form:  "noun_phrase"
						}
					},
					// ── technical — auditory ───────────────────────────────────────
					{
						key:  "halitus_aurem_implet"
						text: "halitus aurem implet"
						tags: {
							register:    "technical"
							sense:       "auditory"
							proximity:   "contact"
							breath_type: "exhale"
							latin_form:  "predication"
						}
					},
					{
						key:  "pulsus_spiritus_in_aure_resonat"
						text: "pulsus spiritus in aure resonat"
						tags: {
							register:    "technical"
							sense:       "auditory"
							proximity:   "contact"
							breath_type: "continuous"
							latin_form:  "predication"
						}
					},
					{
						key:  "spiritus_in_aurem_cadit"
						text: "spiritus in aurem cadit"
						tags: {
							register:    "technical"
							sense:       "auditory"
							proximity:   "intimate"
							breath_type: "exhale"
							latin_form:  "predication"
						}
					},
					// ── technical — tactile ────────────────────────────────────────
					{
						key:  "flatus_cervicem_tangit"
						text: "flatus cervicem tangit"
						tags: {
							register:    "technical"
							sense:       "tactile"
							proximity:   "contact"
							breath_type: "exhale"
							latin_form:  "predication"
						}
					},
					{
						key:  "aer_e_naribus_in_cutem_fluit"
						text: "aer e naribus in cutem fluit"
						tags: {
							register:    "technical"
							sense:       "tactile"
							proximity:   "near"
							breath_type: "exhale"
							latin_form:  "predication"
						}
					},
					{
						key:  "pressura_halitus_in_aure"
						text: "pressura halitus in aure"
						tags: {
							register:    "technical"
							sense:       "tactile"
							proximity:   "contact"
							breath_type: "continuous"
							latin_form:  "noun_phrase"
						}
					},
					{
						key:  "os_prope_aurem_spirat"
						text: "os prope aurem spirat"
						tags: {
							register:    "technical"
							sense:       "tactile"
							proximity:   "near"
							breath_type: "continuous"
							latin_form:  "predication"
						}
					},
					// ── poetic — intimacy / soul ───────────────────────────────────
					{
						key:  "anima_in_aurem_fusa"
						text: "anima in aurem fusa"
						tags: {
							register:    "poetic"
							sense:       "auditory"
							proximity:   "intimate"
							breath_type: "exhale"
							latin_form:  "noun_phrase"
						}
					},
					{
						key:  "spiritus_tacitum_verbum"
						text: "spiritus tacitum verbum"
						tags: {
							register:    "poetic"
							sense:       "auditory"
							proximity:   "intimate"
							breath_type: "continuous"
							latin_form:  "noun_phrase"
						}
					},
					{
						key:  "auris_secretum_accipit"
						text: "auris secretum accipit"
						tags: {
							register:    "poetic"
							sense:       "auditory"
							proximity:   "intimate"
							breath_type: "exhale"
							latin_form:  "predication"
						}
					},
					{
						key:  "halitus_intimus"
						text: "halitus intimus"
						tags: {
							register:    "poetic"
							sense:       "thermal"
							proximity:   "intimate"
							breath_type: "continuous"
							latin_form:  "noun_phrase"
						}
					},
					// ── poetic — warmth / closeness ────────────────────────────────
					{
						key:  "calor_secretus_inter_duo"
						text: "calor secretus inter duo"
						tags: {
							register:    "poetic"
							sense:       "thermal"
							proximity:   "intimate"
							breath_type: "continuous"
							latin_form:  "noun_phrase"
						}
					},
					{
						key:  "spiritus_finem_distantiae_nuntiat"
						text: "spiritus finem distantiae nuntiat"
						tags: {
							register:    "poetic"
							sense:       "tactile"
							proximity:   "near"
							breath_type: "exhale"
							latin_form:  "predication"
						}
					},
					{
						key:  "tepor_qui_verba_non_eget"
						text: "tepor qui verba non eget"
						tags: {
							register:    "poetic"
							sense:       "thermal"
							proximity:   "intimate"
							breath_type: "continuous"
							latin_form:  "predication"
						}
					},
					{
						key:  "ubi_duo_spirant_unus_fit_spiritus"
						text: "ubi duo spirant, unus fit spiritus"
						tags: {
							register:    "poetic"
							sense:       "auditory"
							proximity:   "contact"
							breath_type: "continuous"
							latin_form:  "predication"
						}
					},
					{
						key:  "proximus_spiritus_animam_tangit"
						text: "proximus spiritus animam tangit"
						tags: {
							register:    "poetic"
							sense:       "tactile"
							proximity:   "contact"
							breath_type: "exhale"
							latin_form:  "predication"
						}
					},
					{
						key:  "vox_spiritus_sine_verbis"
						text: "vox spiritus sine verbis"
						tags: {
							register:    "poetic"
							sense:       "auditory"
							proximity:   "intimate"
							breath_type: "exhale"
							latin_form:  "noun_phrase"
						}
					},
				]
			}
		},
	]
}

manifest: #PromptPackManifestV1 & {
	id:          "latin-breath-proximity"
	title:       "Latin Breath Proximity"
	description: "Latin phrase enhancers for breath near the ear. Multi-sensory: thermal (vapor warming skin), auditory (breath filling the ear canal), tactile (air pressure on neck and pinna). Tagged by sense, proximity, and breath_type."
	matrix_presets: [
		{
			label: "Sense by Register"
			query: {
				row_key:       "tag:sense"
				col_key:       "tag:register"
				package_name:  "latin_breath_proximity"
				include_empty: true
			}
		},
		{
			label: "Proximity by Sense"
			query: {
				row_key:       "tag:proximity"
				col_key:       "tag:sense"
				package_name:  "latin_breath_proximity"
				include_empty: true
			}
		},
	]
}

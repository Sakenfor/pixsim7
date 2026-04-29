package promptpacks

// latin_pin_dynamics — Latin phrase enhancers for pinning and physical restraint.
//
// Covers the animal/predatory register of holding down, immobilising, and
// controlling a body against a surface.  Intended as a right-hand qualifier:
//   ACTOR1 = motion < latin.pin.dynamics.victor_premit_victum
//
// Technical variants describe mechanics (weight distribution, joint loading,
// resistance collapse).  Poetic variants draw on the classical predator-prey
// tradition — prey under the claw, earth receiving the fallen, etc.

pack: #PromptBlockPackV1 & {
	version:      "1.0.0"
	package_name: "latin_pin_dynamics"
	defaults: {
		is_public: true
		source:    "system"
	}
	blocks: [
		{
			id: "body_pin"
			block_schema: {
				id_prefix: "latin.pin.body"
				mode:      "surface"
				category:  "latin_enhancer"
				capabilities: ["latin.enhancer", "pin.dynamics"]
				text_template: "Latin enhancer: {variant}."
				tags: {
					modifier_family:  "latin_enhancer"
					modality_support: "both"
					temporal:         "neutral"
					domain: ["pin", "restraint", "animal_dynamics"]
				}
				variants: [
					// ── technical register — mechanics / physics ───────────────────
					{
						key:  "corpus_in_terram_premitur"
						text: "corpus in terram premitur"
						tags: {
							register:    "technical"
							intensity:   "firm"
							motion_type: "pin"
							applies_to:  "full_body"
							latin_form:  "predication"
						}
					},
					{
						key:  "manus_scapulas_premit"
						text: "manus scapulas premit"
						tags: {
							register:    "technical"
							intensity:   "firm"
							motion_type: "press"
							applies_to:  "upper_body"
							latin_form:  "predication"
						}
					},
					{
						key:  "pondus_victoris_victum_tenet"
						text: "pondus victoris victum tenet"
						tags: {
							register:    "technical"
							intensity:   "absolute"
							motion_type: "hold"
							applies_to:  "full_body"
							latin_form:  "predication"
						}
					},
					{
						key:  "artus_in_vincula_coguntur"
						text: "artus in vincula coguntur"
						tags: {
							register:    "technical"
							intensity:   "absolute"
							motion_type: "restrain"
							applies_to:  "limbs"
							latin_form:  "predication"
						}
					},
					{
						key:  "resistentia_sub_pondere_frangitur"
						text: "resistentia sub pondere frangitur"
						tags: {
							register:    "technical"
							intensity:   "absolute"
							motion_type: "pin"
							applies_to:  "full_body"
							latin_form:  "predication"
						}
					},
					{
						key:  "bracchia_retro_torquentur"
						text: "bracchia retro torquentur"
						tags: {
							register:    "technical"
							intensity:   "firm"
							motion_type: "restrain"
							applies_to:  "limbs"
							latin_form:  "predication"
						}
					},
					{
						key:  "collum_sub_palma_fixum"
						text: "collum sub palma fixum"
						tags: {
							register:    "technical"
							intensity:   "firm"
							motion_type: "pin"
							applies_to:  "upper_body"
							latin_form:  "noun_phrase"
						}
					},
					{
						key:  "femora_vincta_non_moventur"
						text: "femora vincta non moventur"
						tags: {
							register:    "technical"
							intensity:   "absolute"
							motion_type: "immobilize"
							applies_to:  "limbs"
							latin_form:  "predication"
						}
					},
					{
						key:  "corpus_sub_vincente_immobile_haeret"
						text: "corpus sub vincente immobile haeret"
						tags: {
							register:    "technical"
							intensity:   "absolute"
							motion_type: "hold"
							applies_to:  "full_body"
							latin_form:  "predication"
						}
					},
					{
						key:  "dorsum_terrae_donatur"
						text: "dorsum terrae donatur"
						tags: {
							register:    "technical"
							intensity:   "firm"
							motion_type: "pin"
							applies_to:  "torso"
							latin_form:  "predication"
						}
					},
					// ── poetic register — predator-prey / animal ───────────────────
					{
						key:  "praeda_sub_ungue_quiescit"
						text: "praeda sub ungue quiescit"
						tags: {
							register:    "poetic"
							intensity:   "absolute"
							motion_type: "pin"
							applies_to:  "full_body"
							latin_form:  "predication"
						}
					},
					{
						key:  "victor_premit_victum"
						text: "victor premit victum"
						tags: {
							register:    "poetic"
							intensity:   "firm"
							motion_type: "press"
							applies_to:  "full_body"
							latin_form:  "predication"
						}
					},
					{
						key:  "terra_victum_recipit"
						text: "terra victum recipit"
						tags: {
							register:    "poetic"
							intensity:   "moderate"
							motion_type: "pin"
							applies_to:  "full_body"
							latin_form:  "predication"
						}
					},
					{
						key:  "immobilitas_eloquentior_voce"
						text: "immobilitas eloquentior voce"
						tags: {
							register:    "poetic"
							intensity:   "subtle"
							motion_type: "immobilize"
							applies_to:  "full_body"
							latin_form:  "noun_phrase"
						}
					},
					{
						key:  "sub_mole_vinctoris_anima_clausa"
						text: "sub mole vinctoris anima clausa"
						tags: {
							register:    "poetic"
							intensity:   "absolute"
							motion_type: "hold"
							applies_to:  "full_body"
							latin_form:  "noun_phrase"
						}
					},
					{
						key:  "vincti_membra_terrae_mandantur"
						text: "vincti membra terrae mandantur"
						tags: {
							register:    "poetic"
							intensity:   "absolute"
							motion_type: "restrain"
							applies_to:  "limbs"
							latin_form:  "predication"
						}
					},
					{
						key:  "pondus_regnat_corpus_cedit"
						text: "pondus regnat; corpus cedit"
						tags: {
							register:    "poetic"
							intensity:   "absolute"
							motion_type: "pin"
							applies_to:  "full_body"
							latin_form:  "predication"
						}
					},
					{
						key:  "ales_pradam_pennis_stravit"
						text: "ales praedam pennis stravit"
						tags: {
							register:    "poetic"
							intensity:   "firm"
							motion_type: "pin"
							applies_to:  "full_body"
							latin_form:  "predication"
						}
					},
					{
						key:  "leo_victum_ungue_tenet"
						text: "leo victum ungue tenet"
						tags: {
							register:    "poetic"
							intensity:   "absolute"
							motion_type: "hold"
							applies_to:  "full_body"
							latin_form:  "predication"
						}
					},
					{
						key:  "immota_victrix_gravitas"
						text: "immota victrix gravitas"
						tags: {
							register:    "poetic"
							intensity:   "absolute"
							motion_type: "immobilize"
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
	id:          "latin-pin-dynamics"
	title:       "Latin Pin Dynamics"
	description: "Curated Latin phrase enhancers for pinning and physical restraint. 50/50 technical/poetic, drawing on the classical predator-prey register."
	matrix_presets: [
		{
			label: "Register by Intensity"
			query: {
				row_key:       "tag:register"
				col_key:       "tag:intensity"
				package_name:  "latin_pin_dynamics"
				include_empty: true
			}
		},
		{
			label: "Motion Type by Register"
			query: {
				row_key:       "tag:motion_type"
				col_key:       "tag:register"
				package_name:  "latin_pin_dynamics"
				include_empty: true
			}
		},
	]
}

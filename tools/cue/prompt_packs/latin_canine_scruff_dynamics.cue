package promptpacks

// latin_canine_scruff_dynamics — partial-pin canine register: held at the
// nape, throat, or jaw while the rest of the body remains free to wriggle,
// kick, paw, or play.  The "scruff hold" tradition: control through a
// single anchor point rather than full immobilisation.
//
// Sibling to latin_canine_pin_dynamics (full pin) and the dominance /
// submission siblings.  Where pin_dynamics describes the body crushed flat,
// scruff_dynamics describes the body suspended on one tether — the tease
// of mock-freedom, the captive who plays at fleeing without ever getting
// loose.
//
// Biped-safe: nape, jaw, throat, hands, knees, feet — no four-leg imagery.
// Feminine forms used where the captive figure is grammatically feminine
// (catula, captiva, praeda); masculine canine archetypes (lupus, canis,
// molossus) hold them.

pack: #PromptBlockPackV1 & {
	version:      "1.0.0"
	package_name: "latin_canine_scruff_dynamics"
	defaults: {
		is_public: true
		source:    "system"
	}
	blocks: [
		{
			id: "canine_scruff"
			block_schema: {
				id_prefix: "latin.scruff.canine"
				mode:      "surface"
				category:  "latin_enhancer"
				capabilities: ["latin.enhancer", "scruff.dynamics", "canine.dynamics", "partial_pin.dynamics"]
				text_template: "Latin enhancer: {variant}."
				tags: {
					modifier_family:  "latin_enhancer"
					modality_support: "both"
					temporal:         "neutral"
					domain: ["scruff", "partial_pin", "canine", "play_dynamics", "creature_neutral_anatomy"]
				}
				variants: [
					// ── technical register — scruff/anchor mechanics ───────────────
					{
						key:  "cervix_sola_tenetur_cetera_libera"
						text: "cervix sola tenetur, cetera libera"
						tags: {
							register:         "technical"
							intensity:        "moderate"
							modality:         "posture"
							canine_archetype: "generic"
							anchor_point:     "nape"
							captive_state:    "wriggling"
							applies_to:       "neck"
							latin_form:       "predication"
						}
					},
					{
						key:  "una_manu_nuchae_detinetur"
						text: "una manu nuchae detinetur"
						tags: {
							register:         "technical"
							intensity:        "moderate"
							modality:         "tactile"
							canine_archetype: "generic"
							anchor_point:     "nape"
							captive_state:    "still"
							applies_to:       "neck"
							latin_form:       "predication"
						}
					},
					{
						key:  "dentes_nucham_leniter_mordent"
						text: "dentes nucham leniter mordent"
						tags: {
							register:         "technical"
							intensity:        "moderate"
							modality:         "tactile"
							canine_archetype: "generic"
							anchor_point:     "nape"
							captive_state:    "wriggling"
							applies_to:       "neck"
							latin_form:       "predication"
						}
					},
					{
						key:  "caput_vinctum_manus_liberae"
						text: "caput vinctum, manus liberae"
						tags: {
							register:         "technical"
							intensity:        "firm"
							modality:         "posture"
							canine_archetype: "generic"
							anchor_point:     "head"
							captive_state:    "wriggling"
							applies_to:       "body"
							latin_form:       "noun_phrase"
						}
					},
					{
						key:  "fauces_gulam_circumdant_non_premunt"
						text: "fauces gulam circumdant non premunt"
						tags: {
							register:         "technical"
							intensity:        "subtle"
							modality:         "tactile"
							canine_archetype: "generic"
							anchor_point:     "throat"
							captive_state:    "still"
							applies_to:       "throat"
							latin_form:       "predication"
						}
					},
					{
						key:  "membra_ima_libera_sub_capite_tento"
						text: "membra ima libera sub capite tento"
						tags: {
							register:         "technical"
							intensity:        "moderate"
							modality:         "posture"
							canine_archetype: "generic"
							anchor_point:     "head"
							captive_state:    "wriggling"
							applies_to:       "body"
							latin_form:       "predication"
						}
					},
					{
						key:  "femora_se_movent_dum_cervix_immobilis"
						text: "femora se movent dum cervix immobilis"
						tags: {
							register:         "technical"
							intensity:        "moderate"
							modality:         "posture"
							canine_archetype: "generic"
							anchor_point:     "nape"
							captive_state:    "wriggling"
							applies_to:       "body"
							latin_form:       "predication"
						}
					},
					{
						key:  "pedes_pulsant_terram_dens_cervice_haeret"
						text: "pedes pulsant terram, dens cervice haeret"
						tags: {
							register:         "technical"
							intensity:        "firm"
							modality:         "posture"
							canine_archetype: "generic"
							anchor_point:     "nape"
							captive_state:    "struggling"
							applies_to:       "body"
							latin_form:       "predication"
						}
					},
					{
						key:  "presso_cervice_cetera_laxantur"
						text: "presso cervice cetera laxantur"
						tags: {
							register:         "technical"
							intensity:        "moderate"
							modality:         "tactile"
							canine_archetype: "generic"
							anchor_point:     "nape"
							captive_state:    "playing"
							applies_to:       "full_body"
							latin_form:       "predication"
						}
					},
					{
						key:  "una_mordendo_totum_tenetur"
						text: "una mordendo totum tenetur"
						tags: {
							register:         "technical"
							intensity:        "firm"
							modality:         "tactile"
							canine_archetype: "generic"
							anchor_point:     "jaw"
							captive_state:    "still"
							applies_to:       "full_body"
							latin_form:       "predication"
						}
					},
					// ── poetic register — mock-freedom, the tooth-tether ───────────
					{
						key:  "libertas_ficta_sub_dente"
						text: "libertas ficta sub dente"
						tags: {
							register:         "poetic"
							intensity:        "moderate"
							modality:         "visual"
							canine_archetype: "generic"
							anchor_point:     "jaw"
							captive_state:    "feigning"
							applies_to:       "full_body"
							latin_form:       "noun_phrase"
						}
					},
					{
						key:  "ludit_catula_quam_tenet_lupus"
						text: "ludit catula quam tenet lupus"
						tags: {
							register:         "poetic"
							intensity:        "moderate"
							modality:         "posture"
							canine_archetype: "lupus"
							anchor_point:     "jaw"
							captive_state:    "playing"
							applies_to:       "full_body"
							latin_form:       "predication"
						}
					},
					{
						key:  "praeda_salit_sed_non_fugit"
						text: "praeda salit, sed non fugit"
						tags: {
							register:         "poetic"
							intensity:        "moderate"
							modality:         "posture"
							canine_archetype: "generic"
							anchor_point:     "jaw"
							captive_state:    "playing"
							applies_to:       "full_body"
							latin_form:       "predication"
						}
					},
					{
						key:  "vinculum_invisibile_dens_visibilis"
						text: "vinculum invisibile, dens visibilis"
						tags: {
							register:         "poetic"
							intensity:        "subtle"
							modality:         "visual"
							canine_archetype: "generic"
							anchor_point:     "jaw"
							captive_state:    "feigning"
							applies_to:       "full_body"
							latin_form:       "noun_phrase"
						}
					},
					{
						key:  "captiva_quae_se_liberam_putat"
						text: "captiva quae se liberam putat"
						tags: {
							register:         "poetic"
							intensity:        "subtle"
							modality:         "visual"
							canine_archetype: "generic"
							anchor_point:     "jaw"
							captive_state:    "feigning"
							applies_to:       "full_body"
							latin_form:       "noun_phrase"
						}
					},
					{
						key:  "sub_uno_dente_mille_motus"
						text: "sub uno dente mille motus"
						tags: {
							register:         "poetic"
							intensity:        "firm"
							modality:         "posture"
							canine_archetype: "generic"
							anchor_point:     "jaw"
							captive_state:    "struggling"
							applies_to:       "full_body"
							latin_form:       "noun_phrase"
						}
					},
					{
						key:  "agitatur_quae_teneri_vix_sentit"
						text: "agitatur quae teneri vix sentit"
						tags: {
							register:         "poetic"
							intensity:        "moderate"
							modality:         "posture"
							canine_archetype: "generic"
							anchor_point:     "nape"
							captive_state:    "playing"
							applies_to:       "full_body"
							latin_form:       "predication"
						}
					},
					{
						key:  "frustra_nitens_canino_dulcis"
						text: "frustra nitens, canino dulcis"
						tags: {
							register:         "poetic"
							intensity:        "firm"
							modality:         "posture"
							canine_archetype: "canis"
							anchor_point:     "jaw"
							captive_state:    "struggling"
							applies_to:       "full_body"
							latin_form:       "noun_phrase"
						}
					},
					{
						key:  "catula_in_lupi_ore_lascivit"
						text: "catula in lupi ore lascivit"
						tags: {
							register:         "poetic"
							intensity:        "moderate"
							modality:         "posture"
							canine_archetype: "lupus"
							anchor_point:     "jaw"
							captive_state:    "playing"
							applies_to:       "full_body"
							latin_form:       "predication"
						}
					},
					{
						key:  "cervice_tenta_anima_liberior_fingit"
						text: "cervice tenta, anima liberior fingit"
						tags: {
							register:         "poetic"
							intensity:        "moderate"
							modality:         "posture"
							canine_archetype: "generic"
							anchor_point:     "nape"
							captive_state:    "feigning"
							applies_to:       "full_body"
							latin_form:       "predication"
						}
					},
				]
			}
		},
	]
}

manifest: #PromptPackManifestV1 & {
	id:          "latin-canine-scruff-dynamics"
	title:       "Latin Canine Scruff Dynamics"
	description: "Curated Latin phrase enhancers for canine partial-pin dynamics: held at the nape, throat, or jaw while the body remains free to wriggle, kick, or play. The mock-freedom tease of the scruff hold — captive on one tether, the rest of her loosed beneath. Biped-safe; pairs with latin_canine_pin_dynamics for full-restraint counterpoint."
	matrix_presets: [
		{
			label: "Register by Intensity"
			query: {
				row_key:       "tag:register"
				col_key:       "tag:intensity"
				package_name:  "latin_canine_scruff_dynamics"
				include_empty: true
			}
		},
		{
			label: "Captive State by Register"
			query: {
				row_key:       "tag:captive_state"
				col_key:       "tag:register"
				package_name:  "latin_canine_scruff_dynamics"
				include_empty: true
			}
		},
		{
			label: "Anchor Point by Captive State"
			query: {
				row_key:       "tag:anchor_point"
				col_key:       "tag:captive_state"
				package_name:  "latin_canine_scruff_dynamics"
				include_empty: true
			}
		},
	]
}

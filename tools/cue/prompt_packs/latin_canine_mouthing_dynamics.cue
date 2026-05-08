package promptpacks

// latin_canine_mouthing_dynamics — open or closed jaw cradling a limb,
// hand, hair, or shoulder without biting down.  Threat-as-touch: the
// fangs are present, the bite is withheld.
//
// Sibling to latin_canine_scruff_dynamics (single-anchor partial pin),
// latin_canine_pin_dynamics (full-body weight pin), and the dominance /
// submission siblings.  Where scruff_dynamics anchors a body on the
// nape, mouthing_dynamics cradles an extremity — wrist, forearm, hair,
// ankle — and the captive's *whole* frame remains otherwise unheld.
//
// Biped-safe.  Feminine forms used where the held figure is grammatically
// feminine (catula, praeda); masculine canine archetypes hold them.

pack: #PromptBlockPackV1 & {
	version:      "1.0.0"
	package_name: "latin_canine_mouthing_dynamics"
	defaults: {
		is_public: true
		source:    "system"
	}
	blocks: [
		{
			id: "canine_mouthing"
			block_schema: {
				id_prefix: "latin.mouthing.canine"
				mode:      "surface"
				category:  "latin_enhancer"
				capabilities: ["latin.enhancer", "mouthing.dynamics", "canine.dynamics", "partial_pin.dynamics"]
				text_template: "Latin enhancer: {variant}."
				tags: {
					modifier_family:  "latin_enhancer"
					modality_support: "both"
					temporal:         "neutral"
					domain: ["mouthing", "partial_pin", "canine", "threat_without_harm", "creature_neutral_anatomy"]
				}
				variants: [
					// ── technical register — observable mouth-on-limb mechanics ────
					{
						key:  "fauces_manum_tenent_sed_non_mordent"
						text: "fauces manum tenent sed non mordent"
						tags: {
							register:         "technical"
							intensity:        "moderate"
							modality:         "tactile"
							canine_archetype: "generic"
							mouth_target:     "hand"
							bite_state:       "closed_no_pressure"
							latin_form:       "predication"
						}
					},
					{
						key:  "dentes_carpum_circumdant_leniter"
						text: "dentes carpum circumdant leniter"
						tags: {
							register:         "technical"
							intensity:        "subtle"
							modality:         "tactile"
							canine_archetype: "generic"
							mouth_target:     "wrist"
							bite_state:       "held_lightly"
							latin_form:       "predication"
						}
					},
					{
						key:  "os_apertum_bracchio_inhaeret"
						text: "os apertum bracchio inhaeret"
						tags: {
							register:         "technical"
							intensity:        "subtle"
							modality:         "tactile"
							canine_archetype: "generic"
							mouth_target:     "forearm"
							bite_state:       "open_cradle"
							latin_form:       "predication"
						}
					},
					{
						key:  "labra_umero_quiescunt_dens_supra"
						text: "labra umero quiescunt, dens supra"
						tags: {
							register:         "technical"
							intensity:        "subtle"
							modality:         "tactile"
							canine_archetype: "generic"
							mouth_target:     "shoulder"
							bite_state:       "open_cradle"
							latin_form:       "predication"
						}
					},
					{
						key:  "fauces_digitos_comprehendunt_sine_vi"
						text: "fauces digitos comprehendunt sine vi"
						tags: {
							register:         "technical"
							intensity:        "moderate"
							modality:         "tactile"
							canine_archetype: "generic"
							mouth_target:     "finger"
							bite_state:       "held_lightly"
							latin_form:       "predication"
						}
					},
					{
						key:  "anhelitus_calidus_in_cute_manet"
						text: "anhelitus calidus in cute manet"
						tags: {
							register:         "technical"
							intensity:        "subtle"
							modality:         "breath"
							canine_archetype: "generic"
							mouth_target:     "neck"
							bite_state:       "open_cradle"
							latin_form:       "predication"
						}
					},
					{
						key:  "caput_in_collo_iacet_ore_aperto"
						text: "caput in collo iacet, ore aperto"
						tags: {
							register:         "technical"
							intensity:        "moderate"
							modality:         "tactile"
							canine_archetype: "generic"
							mouth_target:     "neck"
							bite_state:       "open_cradle"
							latin_form:       "predication"
						}
					},
					{
						key:  "dentes_capillum_mollius_prendunt"
						text: "dentes capillum mollius prendunt"
						tags: {
							register:         "technical"
							intensity:        "subtle"
							modality:         "tactile"
							canine_archetype: "generic"
							mouth_target:     "hair"
							bite_state:       "held_lightly"
							latin_form:       "predication"
						}
					},
					{
						key:  "mandibula_talum_cingit"
						text: "mandibula talum cingit"
						tags: {
							register:         "technical"
							intensity:        "moderate"
							modality:         "tactile"
							canine_archetype: "generic"
							mouth_target:     "ankle"
							bite_state:       "closed_no_pressure"
							latin_form:       "predication"
						}
					},
					{
						key:  "dentes_iugulum_tangunt_non_premunt"
						text: "dentes iugulum tangunt non premunt"
						tags: {
							register:         "technical"
							intensity:        "firm"
							modality:         "tactile"
							canine_archetype: "generic"
							mouth_target:     "collarbone"
							bite_state:       "scoring"
							latin_form:       "predication"
						}
					},
					// ── poetic register — threat-without-harm tradition ────────────
					{
						key:  "dens_minatur_sed_non_vulnerat"
						text: "dens minatur, sed non vulnerat"
						tags: {
							register:         "poetic"
							intensity:        "moderate"
							modality:         "visual"
							canine_archetype: "generic"
							mouth_target:     "neck"
							bite_state:       "warning_pressure"
							latin_form:       "predication"
						}
					},
					{
						key:  "lupus_tenet_sed_non_figit"
						text: "lupus tenet, sed non figit"
						tags: {
							register:         "poetic"
							intensity:        "moderate"
							modality:         "visual"
							canine_archetype: "lupus"
							mouth_target:     "wrist"
							bite_state:       "held_lightly"
							latin_form:       "predication"
						}
					},
					{
						key:  "fauces_apertae_voluntas_clausa"
						text: "fauces apertae, voluntas clausa"
						tags: {
							register:         "poetic"
							intensity:        "subtle"
							modality:         "visual"
							canine_archetype: "generic"
							mouth_target:     "forearm"
							bite_state:       "open_cradle"
							latin_form:       "noun_phrase"
						}
					},
					{
						key:  "minae_sine_sanguine"
						text: "minae sine sanguine"
						tags: {
							register:         "poetic"
							intensity:        "subtle"
							modality:         "visual"
							canine_archetype: "generic"
							mouth_target:     "neck"
							bite_state:       "warning_pressure"
							latin_form:       "noun_phrase"
						}
					},
					{
						key:  "catula_in_lupi_morsu_lascivit"
						text: "catula in lupi morsu lascivit"
						tags: {
							register:         "poetic"
							intensity:        "moderate"
							modality:         "tactile"
							canine_archetype: "lupus"
							mouth_target:     "wrist"
							bite_state:       "held_lightly"
							latin_form:       "predication"
						}
					},
					{
						key:  "dens_iudex_non_carnifex"
						text: "dens iudex, non carnifex"
						tags: {
							register:         "poetic"
							intensity:        "firm"
							modality:         "visual"
							canine_archetype: "generic"
							mouth_target:     "neck"
							bite_state:       "warning_pressure"
							latin_form:       "noun_phrase"
						}
					},
					{
						key:  "vinculum_molle_dentium"
						text: "vinculum molle dentium"
						tags: {
							register:         "poetic"
							intensity:        "subtle"
							modality:         "visual"
							canine_archetype: "generic"
							mouth_target:     "wrist"
							bite_state:       "closed_no_pressure"
							latin_form:       "noun_phrase"
						}
					},
					{
						key:  "morsum_sentit_quae_morsum_non_patitur"
						text: "morsum sentit quae morsum non patitur"
						tags: {
							register:         "poetic"
							intensity:        "moderate"
							modality:         "tactile"
							canine_archetype: "generic"
							mouth_target:     "neck"
							bite_state:       "scoring"
							latin_form:       "predication"
						}
					},
					{
						key:  "quietus_dens_super_venam"
						text: "quietus dens super venam"
						tags: {
							register:         "poetic"
							intensity:        "firm"
							modality:         "visual"
							canine_archetype: "generic"
							mouth_target:     "neck"
							bite_state:       "scoring"
							latin_form:       "noun_phrase"
						}
					},
					{
						key:  "mansueta_minatio_mansuetus_dolor"
						text: "mansueta minatio, mansuetus dolor"
						tags: {
							register:         "poetic"
							intensity:        "subtle"
							modality:         "tactile"
							canine_archetype: "generic"
							mouth_target:     "shoulder"
							bite_state:       "held_lightly"
							latin_form:       "noun_phrase"
						}
					},
				]
			}
		},
	]
}

manifest: #PromptPackManifestV1 & {
	id:          "latin-canine-mouthing-dynamics"
	title:       "Latin Canine Mouthing Dynamics"
	description: "Curated Latin phrase enhancers for canine mouthing: open or closed jaw cradling a wrist, forearm, hair, or shoulder without biting down. Threat-as-touch — the fangs are present, the bite withheld. Sibling to latin_canine_scruff_dynamics; pair the two for anchor + cradle scenes."
	matrix_presets: [
		{
			label: "Register by Intensity"
			query: {
				row_key:       "tag:register"
				col_key:       "tag:intensity"
				package_name:  "latin_canine_mouthing_dynamics"
				include_empty: true
			}
		},
		{
			label: "Mouth Target by Bite State"
			query: {
				row_key:       "tag:mouth_target"
				col_key:       "tag:bite_state"
				package_name:  "latin_canine_mouthing_dynamics"
				include_empty: true
			}
		},
		{
			label: "Bite State by Register"
			query: {
				row_key:       "tag:bite_state"
				col_key:       "tag:register"
				package_name:  "latin_canine_mouthing_dynamics"
				include_empty: true
			}
		},
	]
}

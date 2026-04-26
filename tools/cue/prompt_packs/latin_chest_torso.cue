package promptpacks

// latin_chest_torso — Latin phrase enhancers for chest, breast, and torso contact.
//
// Same tag schema as latin_touch_dynamics / latin_lips_mouth / latin_gaze_breath
// so the cross-pack composer can pick variants from any of them interchangeably:
//   register     — technical | poetic
//   intensity    — subtle | moderate | firm | absolute
//   motion_type  — caress | press | palm | kiss | lick | embrace | breathe | pulse
//   applies_to   — chest | breast | ribs | belly | sinus
//   latin_form   — predication | noun_phrase

// ── Shared enum values (also referenced by tag_registry below) ─────────
#LatinRegisterValues:   ["technical", "poetic"]
#LatinIntensityValues:  ["subtle", "moderate", "firm", "absolute"]
#LatinFormValues:       ["predication", "noun_phrase"]
#ChestMotionTypeValues: ["caress", "press", "palm", "kiss", "lick", "embrace", "breathe", "pulse"]
#ChestAppliesToValues:  ["chest", "breast", "ribs", "belly", "sinus"]

tag_registry: #TagRegistryV1 & {
	register: {
		label:          "Register"
		description:    "Stylistic register of a Latin enhancer phrase."
		allowed_values: #LatinRegisterValues
		applies_to: [{role: "modifier", category: "latin_enhancer"}]
		status: "active"
	}
	intensity: {
		label:          "Intensity"
		description:    "Intensity tier for Latin enhancer phrases."
		allowed_values: #LatinIntensityValues
		applies_to: [{role: "modifier", category: "latin_enhancer"}]
		status: "active"
	}
	motion_type: {
		label:          "Motion Type"
		description:    "Kind of contact/motion the phrase describes."
		allowed_values: #ChestMotionTypeValues
		applies_to: [{role: "modifier", category: "latin_enhancer"}]
		status: "active"
	}
	applies_to: {
		label:          "Applies To"
		description:    "Anatomical/contextual target the phrase applies to."
		allowed_values: #ChestAppliesToValues
		applies_to: [{role: "modifier", category: "latin_enhancer"}]
		status: "active"
	}
	latin_form: {
		label:          "Latin Form"
		description:    "Grammatical form: predication (full clause) or noun_phrase (fragment)."
		allowed_values: #LatinFormValues
		applies_to: [{role: "modifier", category: "latin_enhancer"}]
		status: "active"
	}
}

pack: #PromptBlockPackV1 & {
	version:      "1.0.0"
	package_name: "latin_chest_torso"
	defaults: {
		is_public: true
		source:    "system"
	}
	blocks: [
		{
			id: "chest_torso"
			block_schema: {
				id_prefix: "latin.chest.torso"
				mode:      "surface"
				category:  "latin_enhancer"
				capabilities: ["latin.enhancer", "chest.dynamics"]
				text_template: "Latin enhancer: {variant}."
				tags: {
					modifier_family:  "latin_enhancer"
					modality_support: "both"
					temporal:         "neutral"
					domain: ["chest", "breast", "torso", "embrace"]
				}
				variants: [
					// ── technical register — anatomical / physical ────────────────
					{
						key:  "palmae_mammas_continent"
						text: "palmae mammas continent"
						tags: {
							register:    "technical"
							intensity:   "firm"
							motion_type: "palm"
							applies_to:  "breast"
							latin_form:  "predication"
						}
					},
					{
						key:  "digiti_per_costas_decurrunt"
						text: "digiti per costas decurrunt"
						tags: {
							register:    "technical"
							intensity:   "moderate"
							motion_type: "caress"
							applies_to:  "ribs"
							latin_form:  "predication"
						}
					},
					{
						key:  "pectus_altum_se_tollit"
						text: "pectus altum se tollit"
						tags: {
							register:    "technical"
							intensity:   "subtle"
							motion_type: "breathe"
							applies_to:  "chest"
							latin_form:  "predication"
						}
					},
					{
						key:  "manus_formam_uberum_cingit"
						text: "manus formam uberum cingit"
						tags: {
							register:    "technical"
							intensity:   "moderate"
							motion_type: "palm"
							applies_to:  "breast"
							latin_form:  "predication"
						}
					},
					{
						key:  "papillae_sub_digitis_erectae"
						text: "papillae sub digitis erectae"
						tags: {
							register:    "technical"
							intensity:   "firm"
							motion_type: "palm"
							applies_to:  "breast"
							latin_form:  "noun_phrase"
						}
					},
					{
						key:  "pectus_inter_labra_premitur"
						text: "pectus inter labra premitur"
						tags: {
							register:    "technical"
							intensity:   "firm"
							motion_type: "kiss"
							applies_to:  "chest"
							latin_form:  "predication"
						}
					},
					{
						key:  "lingua_per_sinum_errat"
						text: "lingua per sinum errat"
						tags: {
							register:    "technical"
							intensity:   "moderate"
							motion_type: "lick"
							applies_to:  "sinus"
							latin_form:  "predication"
						}
					},
					{
						key:  "pulsus_cordis_sub_palma_sentitur"
						text: "pulsus cordis sub palma sentitur"
						tags: {
							register:    "technical"
							intensity:   "subtle"
							motion_type: "pulse"
							applies_to:  "chest"
							latin_form:  "predication"
						}
					},
					{
						key:  "venter_levis_sub_manu_trepidat"
						text: "venter levis sub manu trepidat"
						tags: {
							register:    "technical"
							intensity:   "subtle"
							motion_type: "caress"
							applies_to:  "belly"
							latin_form:  "predication"
						}
					},
					{
						key:  "costae_per_cutem_prominent"
						text: "costae per cutem prominent"
						tags: {
							register:    "technical"
							intensity:   "subtle"
							motion_type: "breathe"
							applies_to:  "ribs"
							latin_form:  "predication"
						}
					},
					{
						key:  "mammae_sub_digitis_cedunt"
						text: "mammae sub digitis cedunt"
						tags: {
							register:    "technical"
							intensity:   "moderate"
							motion_type: "palm"
							applies_to:  "breast"
							latin_form:  "predication"
						}
					},
					// ── poetic register — sensual / classical ──────────────────────
					{
						key:  "ubera_molli_pondere_fluunt"
						text: "ubera molli pondere fluunt"
						tags: {
							register:    "poetic"
							intensity:   "moderate"
							motion_type: "palm"
							applies_to:  "breast"
							latin_form:  "predication"
						}
					},
					{
						key:  "lingua_sinum_lambit"
						text: "lingua sinum lambit"
						tags: {
							register:    "poetic"
							intensity:   "moderate"
							motion_type: "lick"
							applies_to:  "sinus"
							latin_form:  "predication"
						}
					},
					{
						key:  "pectus_ardens_anhelat"
						text: "pectus ardens anhelat"
						tags: {
							register:    "poetic"
							intensity:   "firm"
							motion_type: "breathe"
							applies_to:  "chest"
							latin_form:  "predication"
						}
					},
					{
						key:  "labra_ad_mammam_volant"
						text: "labra ad mammam volant"
						tags: {
							register:    "poetic"
							intensity:   "firm"
							motion_type: "kiss"
							applies_to:  "breast"
							latin_form:  "predication"
						}
					},
					{
						key:  "corpus_toto_premitur_impetu"
						text: "corpus toto premitur impetu"
						tags: {
							register:    "poetic"
							intensity:   "absolute"
							motion_type: "embrace"
							applies_to:  "chest"
							latin_form:  "predication"
						}
					},
					{
						key:  "sinus_dulcis_et_tepidus"
						text: "sinus dulcis et tepidus"
						tags: {
							register:    "poetic"
							intensity:   "subtle"
							motion_type: "embrace"
							applies_to:  "sinus"
							latin_form:  "noun_phrase"
						}
					},
					{
						key:  "papilla_rosea_inter_dentes"
						text: "papilla rosea inter dentes"
						tags: {
							register:    "poetic"
							intensity:   "firm"
							motion_type: "kiss"
							applies_to:  "breast"
							latin_form:  "noun_phrase"
						}
					},
					{
						key:  "amplexus_arctus_circa_pectus"
						text: "amplexus arctus circa pectus"
						tags: {
							register:    "poetic"
							intensity:   "firm"
							motion_type: "embrace"
							applies_to:  "chest"
							latin_form:  "noun_phrase"
						}
					},
					{
						key:  "venter_palpitans_sub_osculo"
						text: "venter palpitans sub osculo"
						tags: {
							register:    "poetic"
							intensity:   "moderate"
							motion_type: "kiss"
							applies_to:  "belly"
							latin_form:  "noun_phrase"
						}
					},
					{
						key:  "flamma_per_costas_serpit"
						text: "flamma per costas serpit"
						tags: {
							register:    "poetic"
							intensity:   "firm"
							motion_type: "caress"
							applies_to:  "ribs"
							latin_form:  "predication"
						}
					},
					{
						key:  "pectus_pectori_adhaeret"
						text: "pectus pectori adhaeret"
						tags: {
							register:    "poetic"
							intensity:   "firm"
							motion_type: "embrace"
							applies_to:  "chest"
							latin_form:  "predication"
						}
					},
				]
			}
		},
	]
}

manifest: #PromptPackManifestV1 & {
	id:          "latin-chest-torso"
	title:       "Latin Chest & Torso"
	description: "Curated Latin phrase enhancers for chest / breast / torso contact. Balanced technical/poetic register, tagged by intensity, motion type, and applies_to (chest, breast, ribs, belly, sinus)."
	matrix_presets: [
		{
			label: "Register by Intensity"
			query: {
				row_key:       "tag:register"
				col_key:       "tag:intensity"
				package_name:  "latin_chest_torso"
				include_empty: true
			}
		},
		{
			label: "Motion Type by Applies To"
			query: {
				row_key:       "tag:motion_type"
				col_key:       "tag:applies_to"
				package_name:  "latin_chest_torso"
				include_empty: true
			}
		},
	]
}

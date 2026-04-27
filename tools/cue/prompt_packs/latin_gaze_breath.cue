package promptpacks

// latin_gaze_breath — Latin phrase enhancers for gaze, breath, and voice.
//
// Same tag schema as latin_touch_dynamics / latin_lips_mouth so the cross-
// pack composer can pick variants from any of them interchangeably:
//   register     — technical | poetic
//   intensity    — subtle | moderate | firm | absolute
//   motion_type  — gaze | glance | stare | exhale | inhale | sigh | whisper | murmur | pant
//   applies_to   — eyes | gaze | mouth | ear | throat | breath
//   latin_form   — predication | noun_phrase

// ── Shared enum values (also referenced by tag_registry below) ─────────
#LatinRegisterValues:  ["technical", "poetic"]
#LatinIntensityValues: ["subtle", "moderate", "firm", "absolute"]
#LatinFormValues:      ["predication", "noun_phrase"]
#GazeMotionTypeValues: ["gaze", "glance", "stare", "exhale", "inhale", "sigh", "whisper", "murmur", "pant"]
#GazeAppliesToValues:  ["eyes", "mouth", "ear", "throat", "breath"]

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
		allowed_values: #GazeMotionTypeValues
		applies_to: [{role: "modifier", category: "latin_enhancer"}]
		status: "active"
	}
	applies_to: {
		label:          "Applies To"
		description:    "Anatomical/contextual target the phrase applies to."
		allowed_values: #GazeAppliesToValues
		applies_to: [{role: "modifier", category: "latin_enhancer"}]
		status: "active"
	}
	latin_form: {
		label:          "Latin Form"
		description:    "Grammatical form: predication (full clause), noun_phrase (fragment), or connector (glue)."
		allowed_values: #LatinFormValues
		applies_to: [{role: "modifier", category: "latin_enhancer"}]
		status: "active"
	}
}

pack: #PromptBlockPackV1 & {
	version:      "1.0.0"
	package_name: "latin_gaze_breath"
	defaults: {
		is_public: true
		source:    "system"
	}
	blocks: [
		{
			id: "gaze_breath"
			block_schema: {
				id_prefix: "latin.gaze.breath"
				mode:      "surface"
				category:  "latin_enhancer"
				capabilities: ["latin.enhancer", "gaze.dynamics"]
				text_template: "Latin enhancer: {variant}."
				tags: {
					modifier_family:  "latin_enhancer"
					modality_support: "both"
					temporal:         "neutral"
					domain: ["gaze", "breath", "voice", "eyes"]
				}
				variants: [
					// ── technical register — observational / anatomical ───────────
					{
						key:  "oculi_in_oculos_defixi_sunt"
						text: "oculi in oculos defixi sunt"
						tags: {
							register:    "technical"
							intensity:   "firm"
							motion_type: "gaze"
							applies_to:  "eyes"
							latin_form:  "predication"
						}
					},
					{
						key:  "spiritus_inter_labra_fluit"
						text: "spiritus inter labra fluit"
						tags: {
							register:    "technical"
							intensity:   "subtle"
							motion_type: "exhale"
							applies_to:  "mouth"
							latin_form:  "predication"
						}
					},
					{
						key:  "visus_per_genas_labitur"
						text: "visus per genas labitur"
						tags: {
							register:    "technical"
							intensity:   "subtle"
							motion_type: "gaze"
							applies_to:  "eyes"
							latin_form:  "predication"
						}
					},
					{
						key:  "anhelitus_citus_per_nares"
						text: "anhelitus citus per nares"
						tags: {
							register:    "technical"
							intensity:   "firm"
							motion_type: "pant"
							applies_to:  "breath"
							latin_form:  "noun_phrase"
						}
					},
					{
						key:  "pupillae_dilatantur"
						text: "pupillae dilatantur"
						tags: {
							register:    "technical"
							intensity:   "moderate"
							motion_type: "gaze"
							applies_to:  "eyes"
							latin_form:  "predication"
						}
					},
					{
						key:  "vox_in_gutture_haeret"
						text: "vox in gutture haeret"
						tags: {
							register:    "technical"
							intensity:   "moderate"
							motion_type: "murmur"
							applies_to:  "throat"
							latin_form:  "predication"
						}
					},
					{
						key:  "spiritus_inter_dentes_sibilat"
						text: "spiritus inter dentes sibilat"
						tags: {
							register:    "technical"
							intensity:   "moderate"
							motion_type: "exhale"
							applies_to:  "mouth"
							latin_form:  "predication"
						}
					},
					{
						key:  "aspectus_in_os_figitur"
						text: "aspectus in os figitur"
						tags: {
							register:    "technical"
							intensity:   "moderate"
							motion_type: "gaze"
							applies_to:  "mouth"
							latin_form:  "predication"
						}
					},
					{
						key:  "anhelitus_aurem_implet"
						text: "anhelitus aurem implet"
						tags: {
							register:    "technical"
							intensity:   "firm"
							motion_type: "pant"
							applies_to:  "ear"
							latin_form:  "predication"
						}
					},
					{
						key:  "murmur_grave_in_pectore_residet"
						text: "murmur grave in pectore residet"
						tags: {
							register:    "technical"
							intensity:   "subtle"
							motion_type: "murmur"
							applies_to:  "throat"
							latin_form:  "predication"
						}
					},
					{
						key:  "nares_dilatantur"
						text: "nares dilatantur"
						tags: {
							register:    "technical"
							intensity:   "subtle"
							motion_type: "inhale"
							applies_to:  "breath"
							latin_form:  "predication"
						}
					},
					// ── poetic register — sensual / classical ──────────────────────
					{
						key:  "oculi_flagrantes_per_ora_errant"
						text: "oculi flagrantes per ora errant"
						tags: {
							register:    "poetic"
							intensity:   "moderate"
							motion_type: "gaze"
							applies_to:  "eyes"
							latin_form:  "predication"
						}
					},
					{
						key:  "susurrus_in_aurem_fugit"
						text: "susurrus in aurem fugit"
						tags: {
							register:    "poetic"
							intensity:   "subtle"
							motion_type: "whisper"
							applies_to:  "ear"
							latin_form:  "predication"
						}
					},
					{
						key:  "spiritus_tremens_labra_accendit"
						text: "spiritus tremens labra accendit"
						tags: {
							register:    "poetic"
							intensity:   "moderate"
							motion_type: "exhale"
							applies_to:  "mouth"
							latin_form:  "predication"
						}
					},
					{
						key:  "gemitus_suavis_ex_imo_pectore"
						text: "gemitus suavis ex imo pectore"
						tags: {
							register:    "poetic"
							intensity:   "subtle"
							motion_type: "sigh"
							applies_to:  "throat"
							latin_form:  "noun_phrase"
						}
					},
					{
						key:  "visus_ardens_haeret"
						text: "visus ardens haeret"
						tags: {
							register:    "poetic"
							intensity:   "firm"
							motion_type: "stare"
							applies_to:  "eyes"
							latin_form:  "predication"
						}
					},
					{
						key:  "vox_tremebunda"
						text: "vox tremebunda"
						tags: {
							register:    "poetic"
							intensity:   "subtle"
							motion_type: "murmur"
							applies_to:  "throat"
							latin_form:  "noun_phrase"
						}
					},
					{
						key:  "anhelat_ore_aperto"
						text: "anhelat ore aperto"
						tags: {
							register:    "poetic"
							intensity:   "firm"
							motion_type: "pant"
							applies_to:  "breath"
							latin_form:  "predication"
						}
					},
					{
						key:  "oculi_caligine_implentur"
						text: "oculi caligine implentur"
						tags: {
							register:    "poetic"
							intensity:   "moderate"
							motion_type: "gaze"
							applies_to:  "eyes"
							latin_form:  "predication"
						}
					},
					{
						key:  "suspirium_longum_trahit"
						text: "suspirium longum trahit"
						tags: {
							register:    "poetic"
							intensity:   "subtle"
							motion_type: "sigh"
							applies_to:  "breath"
							latin_form:  "predication"
						}
					},
					{
						key:  "oculorum_acies_in_labra_figitur"
						text: "oculorum acies in labra figitur"
						tags: {
							register:    "poetic"
							intensity:   "firm"
							motion_type: "stare"
							applies_to:  "eyes"
							latin_form:  "predication"
						}
					},
					{
						key:  "flagrans_aspectus_omnia_capit"
						text: "flagrans aspectus omnia capit"
						tags: {
							register:    "poetic"
							intensity:   "absolute"
							motion_type: "stare"
							applies_to:  "eyes"
							latin_form:  "predication"
						}
					},
				]
			}
		},
	]
}

manifest: #PromptPackManifestV1 & {
	id:          "latin-gaze-breath"
	title:       "Latin Gaze & Breath"
	description: "Curated Latin phrase enhancers for gaze / breath / voice cues. Balanced technical/poetic register, tagged by intensity, motion type, and applies_to (eyes, gaze, mouth, ear, throat, breath)."
	matrix_presets: [
		{
			label: "Register by Intensity"
			query: {
				row_key:       "tag:register"
				col_key:       "tag:intensity"
				package_name:  "latin_gaze_breath"
				include_empty: true
			}
		},
		{
			label: "Motion Type by Applies To"
			query: {
				row_key:       "tag:motion_type"
				col_key:       "tag:applies_to"
				package_name:  "latin_gaze_breath"
				include_empty: true
			}
		},
	]
}

package promptpacks

// latin_lips_mouth — Latin phrase enhancers for mouth/lip/oral contact.
//
// Mirrors latin_touch_dynamics' tag schema so the cross-pack composer can
// pick variants from both interchangeably:
//   register     — technical | poetic
//   intensity    — subtle | moderate | firm | absolute
//   motion_type  — kiss | bite | lick | suck | press | exhale | whisper
//   applies_to   — lips | mouth | neck | ear | jawline | cheek
//   latin_form   — predication | noun_phrase
//
// Each variant is a finished Latin clause or noun phrase. Authoring at the
// fragment level avoids the morphology problems that primitive-style
// composition would force (case agreement, conjugation across slots).

// ── Shared enum values (also referenced by tag_registry below) ─────────
#LatinRegisterValues:  ["technical", "poetic"]
#LatinIntensityValues: ["subtle", "moderate", "firm", "absolute"]
#LatinFormValues:      ["predication", "noun_phrase"]
#LipsMotionTypeValues: ["kiss", "bite", "lick", "suck", "press", "exhale", "whisper"]
#LipsAppliesToValues:  ["lips", "mouth", "neck", "ear", "jawline", "cheek"]

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
		allowed_values: #LipsMotionTypeValues
		applies_to: [{role: "modifier", category: "latin_enhancer"}]
		status: "active"
	}
	applies_to: {
		label:          "Applies To"
		description:    "Anatomical/contextual target the phrase applies to."
		allowed_values: #LipsAppliesToValues
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
	package_name: "latin_lips_mouth"
	defaults: {
		is_public: true
		source:    "system"
	}
	blocks: [
		{
			id: "mouth_oral"
			block_schema: {
				id_prefix: "latin.mouth.oral"
				mode:      "surface"
				category:  "latin_enhancer"
				capabilities: ["latin.enhancer", "oral.dynamics"]
				text_template: "Latin enhancer: {variant}."
				tags: {
					modifier_family:  "latin_enhancer"
					modality_support: "both"
					temporal:         "neutral"
					domain: ["oral", "mouth", "lips", "kiss"]
				}
				variants: [
					// ── technical register — anatomical / physical ─────────────────
					{
						key:  "labia_labiis_adhaerent"
						text: "labia labiis adhaerent"
						tags: {
							register:    "technical"
							intensity:   "firm"
							motion_type: "kiss"
							applies_to:  "lips"
							latin_form:  "predication"
						}
					},
					{
						key:  "dentes_labrum_mordent"
						text: "dentes labrum mordent"
						tags: {
							register:    "technical"
							intensity:   "moderate"
							motion_type: "bite"
							applies_to:  "lips"
							latin_form:  "predication"
						}
					},
					{
						key:  "lingua_per_dentes_serpit"
						text: "lingua per dentes serpit"
						tags: {
							register:    "technical"
							intensity:   "moderate"
							motion_type: "lick"
							applies_to:  "mouth"
							latin_form:  "predication"
						}
					},
					{
						key:  "spiritus_calidus_in_collum_effunditur"
						text: "spiritus calidus in collum effunditur"
						tags: {
							register:    "technical"
							intensity:   "subtle"
							motion_type: "exhale"
							applies_to:  "neck"
							latin_form:  "predication"
						}
					},
					{
						key:  "os_in_cervice_quiescit"
						text: "os in cervice quiescit"
						tags: {
							register:    "technical"
							intensity:   "subtle"
							motion_type: "kiss"
							applies_to:  "neck"
							latin_form:  "predication"
						}
					},
					{
						key:  "dentium_morsus_levis_in_aure"
						text: "dentium morsus levis in aure"
						tags: {
							register:    "technical"
							intensity:   "subtle"
							motion_type: "bite"
							applies_to:  "ear"
							latin_form:  "noun_phrase"
						}
					},
					{
						key:  "lingua_dentium_aciem_lambit"
						text: "lingua dentium aciem lambit"
						tags: {
							register:    "technical"
							intensity:   "moderate"
							motion_type: "lick"
							applies_to:  "mouth"
							latin_form:  "predication"
						}
					},
					{
						key:  "labra_ad_maxillam_premuntur"
						text: "labra ad maxillam premuntur"
						tags: {
							register:    "technical"
							intensity:   "firm"
							motion_type: "press"
							applies_to:  "jawline"
							latin_form:  "predication"
						}
					},
					{
						key:  "suctus_labiorum"
						text: "suctus labiorum"
						tags: {
							register:    "technical"
							intensity:   "moderate"
							motion_type: "suck"
							applies_to:  "lips"
							latin_form:  "noun_phrase"
						}
					},
					{
						key:  "labris_superioribus_inferiora_capiuntur"
						text: "labris superioribus inferiora capiuntur"
						tags: {
							register:    "technical"
							intensity:   "firm"
							motion_type: "kiss"
							applies_to:  "lips"
							latin_form:  "predication"
						}
					},
					{
						key:  "lingua_collum_lambit"
						text: "lingua collum lambit"
						tags: {
							register:    "technical"
							intensity:   "moderate"
							motion_type: "lick"
							applies_to:  "neck"
							latin_form:  "predication"
						}
					},
					// ── poetic register — sensual / classical ──────────────────────
					{
						key:  "osculum_molle_sub_aurem_cadit"
						text: "osculum molle sub aurem cadit"
						tags: {
							register:    "poetic"
							intensity:   "subtle"
							motion_type: "kiss"
							applies_to:  "ear"
							latin_form:  "predication"
						}
					},
					{
						key:  "basium_tremulum_labris_haeret"
						text: "basium tremulum labris haeret"
						tags: {
							register:    "poetic"
							intensity:   "moderate"
							motion_type: "kiss"
							applies_to:  "lips"
							latin_form:  "predication"
						}
					},
					{
						key:  "labella_genas_exurunt"
						text: "labella genas exurunt"
						tags: {
							register:    "poetic"
							intensity:   "firm"
							motion_type: "kiss"
							applies_to:  "cheek"
							latin_form:  "predication"
						}
					},
					{
						key:  "flagrans_os_collum_percurrit"
						text: "flagrans os collum percurrit"
						tags: {
							register:    "poetic"
							intensity:   "firm"
							motion_type: "kiss"
							applies_to:  "neck"
							latin_form:  "predication"
						}
					},
					{
						key:  "labra_ardentia_in_cervice_errant"
						text: "labra ardentia in cervice errant"
						tags: {
							register:    "poetic"
							intensity:   "moderate"
							motion_type: "kiss"
							applies_to:  "neck"
							latin_form:  "predication"
						}
					},
					{
						key:  "spiritus_suspirans_aurem_petit"
						text: "spiritus suspirans aurem petit"
						tags: {
							register:    "poetic"
							intensity:   "subtle"
							motion_type: "exhale"
							applies_to:  "ear"
							latin_form:  "predication"
						}
					},
					{
						key:  "labia_tremebunda"
						text: "labia tremebunda"
						tags: {
							register:    "poetic"
							intensity:   "subtle"
							motion_type: "kiss"
							applies_to:  "lips"
							latin_form:  "noun_phrase"
						}
					},
					{
						key:  "lingua_subito_labrum_carpit"
						text: "lingua subito labrum carpit"
						tags: {
							register:    "poetic"
							intensity:   "firm"
							motion_type: "lick"
							applies_to:  "lips"
							latin_form:  "predication"
						}
					},
					{
						key:  "murmur_calidum_in_aure_dormit"
						text: "murmur calidum in aure dormit"
						tags: {
							register:    "poetic"
							intensity:   "subtle"
							motion_type: "whisper"
							applies_to:  "ear"
							latin_form:  "predication"
						}
					},
					{
						key:  "labra_dentesque_carnem_capiunt"
						text: "labra omnia dentesque carnem capiunt"
						tags: {
							register:    "poetic"
							intensity:   "absolute"
							motion_type: "bite"
							applies_to:  "lips"
							latin_form:  "predication"
						}
					},
					{
						key:  "os_toto_impetu_in_collum_descendit"
						text: "os toto impetu in collum descendit"
						tags: {
							register:    "poetic"
							intensity:   "absolute"
							motion_type: "kiss"
							applies_to:  "neck"
							latin_form:  "predication"
						}
					},
				]
			}
		},
	]
}

manifest: #PromptPackManifestV1 & {
	id:          "latin-lips-mouth"
	title:       "Latin Lips & Mouth"
	description: "Curated Latin phrase enhancers for oral / lip / mouth contact. Balanced technical/poetic register, tagged by intensity, motion type, and applies_to (lips, mouth, neck, ear, jawline, cheek)."
	matrix_presets: [
		{
			label: "Register by Intensity"
			query: {
				row_key:       "tag:register"
				col_key:       "tag:intensity"
				package_name:  "latin_lips_mouth"
				include_empty: true
			}
		},
		{
			label: "Motion Type by Applies To"
			query: {
				row_key:       "tag:motion_type"
				col_key:       "tag:applies_to"
				package_name:  "latin_lips_mouth"
				include_empty: true
			}
		},
	]
}

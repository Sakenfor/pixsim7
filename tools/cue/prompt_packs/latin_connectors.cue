package promptpacks

// latin_connectors — generic Latin glue clauses that bridge content picks.
//
// Connectors are NOT standalone — the composer interleaves them between
// content clauses (from latin_touch_dynamics / latin_lips_mouth / latin_gaze_breath
// / latin_chest_torso) to add structural variety: simile, temporal, anaphor,
// consequence. Without connectors, multi-clause composer output reads as
// flat declarations; with them you get the dum...velut...sic... rhythm.
//
// Variants are deliberately abstract — no anatomical parts, no scene props.
// Specifics come from content packs and prompt vars; connectors are the
// rhythm and structure.
//
//   register     — technical | poetic
//   intensity    — subtle | moderate | firm | absolute
//   latin_form   — connector  (always; identifies non-standalone use)
//   connector_type — simile | temporal | consequence | anaphor
//   attaches     — leading | trailing
//                  leading  — renders before the next content clause
//                  trailing — renders after the previous content clause
//                             (composer joins with ", " instead of ". ")

#LatinRegisterValues:    ["technical", "poetic"]
#LatinIntensityValues:   ["subtle", "moderate", "firm", "absolute"]
#LatinFormValues:        ["predication", "noun_phrase", "connector"]
#ConnectorTypeValues:    ["simile", "temporal", "consequence", "anaphor"]
#ConnectorAttachesValues: ["leading", "trailing"]

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
	latin_form: {
		label:          "Latin Form"
		description:    "Grammatical form: predication (full clause), noun_phrase (fragment), or connector (glue)."
		allowed_values: #LatinFormValues
		applies_to: [{role: "modifier", category: "latin_enhancer"}]
		status: "active"
	}
	connector_type: {
		label:          "Connector Type"
		description:    "Rhetorical role of a connector clause: simile, temporal, consequence, or anaphor."
		allowed_values: #ConnectorTypeValues
		applies_to: [{role: "modifier", category: "latin_enhancer"}]
		status: "active"
	}
	attaches: {
		label:          "Attaches"
		description:    "How a connector joins surrounding clauses: leading (before next) or trailing (after previous)."
		allowed_values: #ConnectorAttachesValues
		applies_to: [{role: "modifier", category: "latin_enhancer"}]
		status: "active"
	}
}

pack: #PromptBlockPackV1 & {
	version:      "1.0.0"
	package_name: "latin_connectors"
	defaults: {
		is_public: true
		source:    "system"
	}
	blocks: [
		{
			id: "connectors"
			block_schema: {
				id_prefix: "latin.connector"
				mode:      "surface"
				category:  "latin_enhancer"
				capabilities: ["latin.enhancer", "latin.connector"]
				text_template: "Latin connector: {variant}."
				tags: {
					modifier_family:  "latin_enhancer"
					modality_support: "both"
					temporal:         "neutral"
					domain: ["connector", "rhetoric"]
				}
				variants: [
					// ── simile ── velut/ut/quasi + image. Always trailing.
					{
						key:  "velut_arcus_tentus"
						text: "velut arcus tentus"
						tags: {
							register:       "poetic"
							intensity:      "moderate"
							latin_form:     "connector"
							connector_type: "simile"
							attaches:       "trailing"
						}
					},
					{
						key:  "velut_serpens_subito"
						text: "velut serpens subito"
						tags: {
							register:       "poetic"
							intensity:      "firm"
							latin_form:     "connector"
							connector_type: "simile"
							attaches:       "trailing"
						}
					},
					{
						key:  "velut_flamma_sub_cinere"
						text: "velut flamma sub cinere"
						tags: {
							register:       "poetic"
							intensity:      "subtle"
							latin_form:     "connector"
							connector_type: "simile"
							attaches:       "trailing"
						}
					},
					{
						key:  "velut_unda_recurrens"
						text: "velut unda recurrens"
						tags: {
							register:       "poetic"
							intensity:      "moderate"
							latin_form:     "connector"
							connector_type: "simile"
							attaches:       "trailing"
						}
					},
					{
						key:  "ut_aer_ante_tempestatem"
						text: "ut aer ante tempestatem"
						tags: {
							register:       "poetic"
							intensity:      "subtle"
							latin_form:     "connector"
							connector_type: "simile"
							attaches:       "trailing"
						}
					},
					// ── temporal ── dum + clause. Always trailing.
					{
						key:  "dum_silentium_extenditur"
						text: "dum silentium extenditur"
						tags: {
							register:       "technical"
							intensity:      "subtle"
							latin_form:     "connector"
							connector_type: "temporal"
							attaches:       "trailing"
						}
					},
					{
						key:  "dum_anhelitus_brevior_fit"
						text: "dum anhelitus brevior fit"
						tags: {
							register:       "technical"
							intensity:      "moderate"
							latin_form:     "connector"
							connector_type: "temporal"
							attaches:       "trailing"
						}
					},
					{
						key:  "dum_corpus_cedit"
						text: "dum corpus cedit"
						tags: {
							register:       "technical"
							intensity:      "moderate"
							latin_form:     "connector"
							connector_type: "temporal"
							attaches:       "trailing"
						}
					},
					{
						key:  "simul_animus_vacillat"
						text: "simul animus vacillat"
						tags: {
							register:       "poetic"
							intensity:      "moderate"
							latin_form:     "connector"
							connector_type: "temporal"
							attaches:       "trailing"
						}
					},
					// ── consequence ── sic/itaque + clause. Always leading.
					{
						key:  "sic_omnia_consonant"
						text: "sic omnia consonant"
						tags: {
							register:       "poetic"
							intensity:      "moderate"
							latin_form:     "connector"
							connector_type: "consequence"
							attaches:       "leading"
						}
					},
					{
						key:  "sic_motus_perficitur"
						text: "sic motus perficitur"
						tags: {
							register:       "technical"
							intensity:      "firm"
							latin_form:     "connector"
							connector_type: "consequence"
							attaches:       "leading"
						}
					},
					{
						key:  "ita_omne_pondus_quiescit"
						text: "ita omne pondus quiescit"
						tags: {
							register:       "poetic"
							intensity:      "subtle"
							latin_form:     "connector"
							connector_type: "consequence"
							attaches:       "leading"
						}
					},
					// ── anaphor ── in hac/hoc + abstract noun. Always leading.
					{
						key:  "in_hac_tentione_invitanti"
						text: "in hac tentione invitanti"
						tags: {
							register:       "poetic"
							intensity:      "moderate"
							latin_form:     "connector"
							connector_type: "anaphor"
							attaches:       "leading"
						}
					},
					{
						key:  "in_hoc_silentio"
						text: "in hoc silentio"
						tags: {
							register:       "poetic"
							intensity:      "subtle"
							latin_form:     "connector"
							connector_type: "anaphor"
							attaches:       "leading"
						}
					},
					{
						key:  "inter_officium_et_desiderium"
						text: "inter officium et desiderium"
						tags: {
							register:       "poetic"
							intensity:      "firm"
							latin_form:     "connector"
							connector_type: "anaphor"
							attaches:       "leading"
						}
					},
				]
			}
		},
	]
}

manifest: #PromptPackManifestV1 & {
	id:          "latin-connectors"
	title:       "Latin Connectors"
	description: "Generic Latin glue clauses (simile / temporal / consequence / anaphor) used by the composer to bridge content picks. Not standalone — interleaved into multi-clause output."
	matrix_presets: [
		{
			label: "Connector Type by Attaches"
			query: {
				row_key:       "tag:connector_type"
				col_key:       "tag:attaches"
				package_name:  "latin_connectors"
				include_empty: true
			}
		},
		{
			label: "Connector Type by Register"
			query: {
				row_key:       "tag:connector_type"
				col_key:       "tag:register"
				package_name:  "latin_connectors"
				include_empty: true
			}
		},
	]
}

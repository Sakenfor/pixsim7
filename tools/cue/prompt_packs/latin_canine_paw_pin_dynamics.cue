package promptpacks

// latin_canine_paw_pin_dynamics — single-point paw placement on a body
// part: shoulder, wrist, hair, hip, ankle, garment.  The paw marks,
// anchors, or blocks rather than crushes.
//
// Sibling to but DISTINCT FROM latin_canine_pin_dynamics:
//   - pin_dynamics  → full-body crushing weight ("pondus victoris victum tenet")
//   - paw_pin_dynamics → single paw on a single point, light touch as claim
//     or denial-of-movement, captive otherwise free
//
// Closer in spirit to latin_canine_scruff_dynamics — one anchor, mock-
// freedom below — but the anchor is paw, not jaw, and may sit anywhere
// the paw can reach.  Biped-safe; "palma" / "ungues" used so a humanoid
// hand-as-paw reads naturally.

pack: #PromptBlockPackV1 & {
	version:      "1.0.0"
	package_name: "latin_canine_paw_pin_dynamics"
	defaults: {
		is_public: true
		source:    "system"
	}
	blocks: [
		{
			id: "canine_paw_pin"
			block_schema: {
				id_prefix: "latin.paw_pin.canine"
				mode:      "surface"
				category:  "latin_enhancer"
				capabilities: ["latin.enhancer", "paw_pin.dynamics", "canine.dynamics", "partial_pin.dynamics"]
				text_template: "Latin enhancer: {variant}."
				tags: {
					modifier_family:  "latin_enhancer"
					modality_support: "both"
					temporal:         "neutral"
					domain: ["paw_pin", "partial_pin", "canine", "claim_dynamics", "creature_neutral_anatomy"]
				}
				variants: [
					// ── technical register — single-paw placement mechanics ────────
					{
						key:  "una_palma_umerum_tenet"
						text: "una palma umerum tenet"
						tags: {
							register:         "technical"
							intensity:        "moderate"
							modality:         "tactile"
							canine_archetype: "generic"
							paw_target:       "shoulder"
							claim_type:       "anchor"
							latin_form:       "predication"
						}
					},
					{
						key:  "ungues_carpum_ad_terram_premunt"
						text: "ungues carpum ad terram premunt"
						tags: {
							register:         "technical"
							intensity:        "firm"
							modality:         "tactile"
							canine_archetype: "generic"
							paw_target:       "wrist"
							claim_type:       "press"
							latin_form:       "predication"
						}
					},
					{
						key:  "palma_supra_coxam_quiescit"
						text: "palma supra coxam quiescit"
						tags: {
							register:         "technical"
							intensity:        "subtle"
							modality:         "tactile"
							canine_archetype: "generic"
							paw_target:       "hip"
							claim_type:       "anchor"
							latin_form:       "predication"
						}
					},
					{
						key:  "ungula_in_capillis_figitur"
						text: "ungula in capillis figitur"
						tags: {
							register:         "technical"
							intensity:        "moderate"
							modality:         "tactile"
							canine_archetype: "generic"
							paw_target:       "hair"
							claim_type:       "anchor"
							latin_form:       "predication"
						}
					},
					{
						key:  "palma_manum_sub_se_claudit"
						text: "palma manum sub se claudit"
						tags: {
							register:         "technical"
							intensity:        "firm"
							modality:         "tactile"
							canine_archetype: "generic"
							paw_target:       "hand"
							claim_type:       "block"
							latin_form:       "predication"
						}
					},
					{
						key:  "palma_humerum_signat_non_premit"
						text: "palma humerum signat, non premit"
						tags: {
							register:         "technical"
							intensity:        "subtle"
							modality:         "tactile"
							canine_archetype: "generic"
							paw_target:       "shoulder"
							claim_type:       "mark"
							latin_form:       "predication"
						}
					},
					{
						key:  "ungues_vesti_adhaerent"
						text: "ungues vesti adhaerent"
						tags: {
							register:         "technical"
							intensity:        "subtle"
							modality:         "tactile"
							canine_archetype: "generic"
							paw_target:       "garment"
							claim_type:       "anchor"
							latin_form:       "predication"
						}
					},
					{
						key:  "palma_talum_terrae_figit"
						text: "palma talum terrae figit"
						tags: {
							register:         "technical"
							intensity:        "firm"
							modality:         "tactile"
							canine_archetype: "generic"
							paw_target:       "ankle"
							claim_type:       "press"
							latin_form:       "predication"
						}
					},
					{
						key:  "palma_bracchium_ne_attollatur_tenet"
						text: "palma bracchium ne attollatur tenet"
						tags: {
							register:         "technical"
							intensity:        "moderate"
							modality:         "tactile"
							canine_archetype: "generic"
							paw_target:       "forearm"
							claim_type:       "block"
							latin_form:       "predication"
						}
					},
					{
						key:  "una_ungula_sufficit_ad_tenendum"
						text: "una ungula sufficit ad tenendum"
						tags: {
							register:         "technical"
							intensity:        "subtle"
							modality:         "tactile"
							canine_archetype: "generic"
							paw_target:       "wrist"
							claim_type:       "anchor"
							latin_form:       "predication"
						}
					},
					// ── poetic register — paw-as-claim, paw-as-permission ──────────
					{
						key:  "ungula_iudicans_non_opprimens"
						text: "ungula iudicans, non opprimens"
						tags: {
							register:         "poetic"
							intensity:        "moderate"
							modality:         "visual"
							canine_archetype: "generic"
							paw_target:       "shoulder"
							claim_type:       "mark"
							latin_form:       "noun_phrase"
						}
					},
					{
						key:  "lupi_pes_humero_impositus"
						text: "lupi pes humero impositus"
						tags: {
							register:         "poetic"
							intensity:        "firm"
							modality:         "visual"
							canine_archetype: "lupus"
							paw_target:       "shoulder"
							claim_type:       "anchor"
							latin_form:       "noun_phrase"
						}
					},
					{
						key:  "signum_unguibus_impressum"
						text: "signum unguibus impressum"
						tags: {
							register:         "poetic"
							intensity:        "subtle"
							modality:         "visual"
							canine_archetype: "generic"
							paw_target:       "shoulder"
							claim_type:       "mark"
							latin_form:       "noun_phrase"
						}
					},
					{
						key:  "levis_palma_gravior_animus"
						text: "levis palma, gravior animus"
						tags: {
							register:         "poetic"
							intensity:        "subtle"
							modality:         "visual"
							canine_archetype: "generic"
							paw_target:       "shoulder"
							claim_type:       "anchor"
							latin_form:       "noun_phrase"
						}
					},
					{
						key:  "una_ungula_totum_vincit"
						text: "una ungula totum vincit"
						tags: {
							register:         "poetic"
							intensity:        "absolute"
							modality:         "visual"
							canine_archetype: "generic"
							paw_target:       "wrist"
							claim_type:       "press"
							latin_form:       "predication"
						}
					},
					{
						key:  "terra_sub_palma_signata"
						text: "terra sub palma signata"
						tags: {
							register:         "poetic"
							intensity:        "moderate"
							modality:         "visual"
							canine_archetype: "generic"
							paw_target:       "hand"
							claim_type:       "mark"
							latin_form:       "noun_phrase"
						}
					},
					{
						key:  "palma_quae_permittit_et_negat"
						text: "palma quae permittit et negat"
						tags: {
							register:         "poetic"
							intensity:        "moderate"
							modality:         "visual"
							canine_archetype: "generic"
							paw_target:       "wrist"
							claim_type:       "block"
							latin_form:       "noun_phrase"
						}
					},
					{
						key:  "praedam_non_tenet_sed_possidet"
						text: "praedam non tenet, sed possidet"
						tags: {
							register:         "poetic"
							intensity:        "firm"
							modality:         "visual"
							canine_archetype: "generic"
							paw_target:       "shoulder"
							claim_type:       "mark"
							latin_form:       "predication"
						}
					},
					{
						key:  "ungues_loquuntur"
						text: "ungues loquuntur"
						tags: {
							register:         "poetic"
							intensity:        "subtle"
							modality:         "visual"
							canine_archetype: "generic"
							paw_target:       "shoulder"
							claim_type:       "mark"
							latin_form:       "predication"
						}
					},
					{
						key:  "una_palma_omnes_vias_claudit"
						text: "una palma omnes vias claudit"
						tags: {
							register:         "poetic"
							intensity:        "firm"
							modality:         "visual"
							canine_archetype: "generic"
							paw_target:       "wrist"
							claim_type:       "block"
							latin_form:       "predication"
						}
					},
				]
			}
		},
	]
}

manifest: #PromptPackManifestV1 & {
	id:          "latin-canine-paw-pin-dynamics"
	title:       "Latin Canine Paw Pin Dynamics"
	description: "Curated Latin phrase enhancers for single-point canine paw placement — shoulder, wrist, hair, hip, ankle, garment. Distinct from latin_canine_pin_dynamics (full-body crush): the paw here marks, anchors, or denies movement rather than pressing the captive flat. Pairs naturally with latin_canine_scruff_dynamics and latin_canine_mouthing_dynamics for partial-pin scenes."
	matrix_presets: [
		{
			label: "Register by Intensity"
			query: {
				row_key:       "tag:register"
				col_key:       "tag:intensity"
				package_name:  "latin_canine_paw_pin_dynamics"
				include_empty: true
			}
		},
		{
			label: "Paw Target by Claim Type"
			query: {
				row_key:       "tag:paw_target"
				col_key:       "tag:claim_type"
				package_name:  "latin_canine_paw_pin_dynamics"
				include_empty: true
			}
		},
		{
			label: "Claim Type by Register"
			query: {
				row_key:       "tag:claim_type"
				col_key:       "tag:register"
				package_name:  "latin_canine_paw_pin_dynamics"
				include_empty: true
			}
		},
	]
}

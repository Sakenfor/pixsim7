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
//
// Authoring shape demonstrates two orthogonal CUE constraint axes:
//   1. Register axis (#TechnicalShape | #PoeticShape) — register and
//      modality are perfectly coupled here: technical = tactile (touch
//      mechanics), poetic = visual (image of the claim).
//   2. Claim-type axis — claim_type and paw_target are coupled:
//        press → paw_target ∈ {wrist, ankle}      (load-bearing pin)
//        block → paw_target ∈ {hand, forearm, wrist}  (limb-end stop)
//        mark  → paw_target ∈ {shoulder, hand}    (territorial sign)
//        anchor → any paw_target the data uses     (generic)

// ── Shared latin enhancer enums ────────────────────────────────────────
#LatinRegisterValues:  ["technical", "poetic"]
#LatinIntensityValues: ["subtle", "moderate", "firm", "absolute"]
#LatinFormValues:      ["predication", "noun_phrase"]

// ── Pack-specific enums ────────────────────────────────────────────────
#CanineArchetypeValues:  ["lupus", "canis", "molossus", "catulus", "catula", "generic"]
#PawPinModalityValues:   ["tactile", "visual"]
#PawTargetValues:        ["shoulder", "wrist", "hand", "hair", "hip", "ankle", "forearm", "garment"]
#ClaimTypeValues:        ["anchor", "press", "block", "mark"]

// ── Register-axis shapes ───────────────────────────────────────────────
#TechnicalShape: {
	register: "technical"
	modality: "tactile"
	...
}

#PoeticShape: {
	register: "poetic"
	modality: "visual"
	...
}

// ── Claim-type-axis shapes ─────────────────────────────────────────────
#PressShape: {
	claim_type:  "press"
	paw_target: "wrist" | "ankle"
	...
}

#BlockShape: {
	claim_type:  "block"
	paw_target: "hand" | "forearm" | "wrist"
	...
}

#MarkShape: {
	claim_type:  "mark"
	paw_target: "shoulder" | "hand"
	...
}

#AnchorShape: {
	claim_type:  "anchor"
	paw_target: "shoulder" | "hip" | "hair" | "garment" | "wrist"
	...
}

// ── Composite tag type ─────────────────────────────────────────────────
#PawPinVariantTags: {
	register:         or(#LatinRegisterValues)
	intensity:        or(#LatinIntensityValues)
	modality:         or(#PawPinModalityValues)
	canine_archetype: or(#CanineArchetypeValues)
	paw_target:       or(#PawTargetValues)
	claim_type:       or(#ClaimTypeValues)
	latin_form:       or(#LatinFormValues)
} & (#TechnicalShape | #PoeticShape) &
	(#PressShape | #BlockShape | #MarkShape | #AnchorShape)

#PawPinVariant: {
	text: string
	tags: #PawPinVariantTags
}

// ── Variant taxonomy ───────────────────────────────────────────────────

#Variants: [string]: #PawPinVariant

#Variants: {
	// ── technical register — single-paw placement mechanics ────────────
	una_palma_umerum_tenet: {
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
	}
	ungues_carpum_ad_terram_premunt: {
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
	}
	palma_supra_coxam_quiescit: {
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
	}
	ungula_in_capillis_figitur: {
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
	}
	palma_manum_sub_se_claudit: {
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
	}
	palma_humerum_signat_non_premit: {
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
	}
	ungues_vesti_adhaerent: {
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
	}
	palma_talum_terrae_figit: {
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
	}
	palma_bracchium_ne_attollatur_tenet: {
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
	}
	una_ungula_sufficit_ad_tenendum: {
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
	}
	// ── poetic register — paw-as-claim, paw-as-permission ──────────────
	ungula_iudicans_non_opprimens: {
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
	}
	lupi_pes_humero_impositus: {
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
	}
	signum_unguibus_impressum: {
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
	}
	levis_palma_gravior_animus: {
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
	}
	una_ungula_totum_vincit: {
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
	}
	terra_sub_palma_signata: {
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
	}
	palma_quae_permittit_et_negat: {
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
	}
	praedam_non_tenet_sed_possidet: {
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
	}
	ungues_loquuntur: {
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
	}
	una_palma_omnes_vias_claudit: {
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
	}
}

// ── Pack ───────────────────────────────────────────────────────────────

tag_registry: #TagRegistryV1 & {
	paw_target: {
		label:          "Paw Target"
		description:    "Anatomical/object target of the paw pin."
		allowed_values: ["ankle", "forearm", "garment", "hair", "hand", "hip", "shoulder", "wrist"]
		applies_to: [{role: "modifier", category: "latin_enhancer"}]
		status: "active"
	}
	claim_type: {
		label:          "Claim Type"
		description:    "Function of the paw placement: press (force down), block (prevent motion), anchor (rest weight), or mark (claim without restraint)."
		allowed_values: ["anchor", "block", "mark", "press"]
		applies_to: [{role: "modifier", category: "latin_enhancer"}]
		status: "active"
	}
}

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
					for slug, v in #Variants {
						key:  slug
						text: v.text
						tags: v.tags
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
	category:    "latin"
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

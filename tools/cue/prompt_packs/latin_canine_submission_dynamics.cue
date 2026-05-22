package promptpacks

// latin_canine_submission_dynamics — canine-coded submission posture, voice,
// gaze, and presence.  Biped-safe: bared neck, lowered head, knee-bend,
// closed throat, flat hackles.  Suitable for werewolves, gnolls, beastfolk,
// or any character carrying canine register over a bipedal frame.
//
// Sibling to latin_canine_dominance_dynamics.  Pair the two for full
// hierarchy scenes.
//
// Authoring shape: typed-taxonomy + comprehension with register × modality
// coupling.  Technical describes observable mechanics including breath
// physiology (light, quick respiration as submission cue).  Poetic drops
// breath — interpretive submission goes through posture/voice/gaze/touch.

// ── Shared latin enhancer enums ────────────────────────────────────────
#LatinRegisterValues:  ["technical", "poetic"]
#LatinIntensityValues: ["subtle", "moderate", "firm", "absolute"]
#LatinFormValues:      ["predication", "noun_phrase"]

// ── Pack-specific enums ────────────────────────────────────────────────
#CanineArchetypeValues:     ["lupus", "canis", "molossus", "catulus", "catula", "generic"]
#SubmissionModalityValues:  ["posture", "vocal", "gaze", "tactile", "breath"]
#SubmissionAppliesToValues: ["presence", "head", "neck", "throat", "eyes", "hands", "body"]

// ── Register-axis shapes ───────────────────────────────────────────────
#TechnicalSubmissionTags: {
	register:         "technical"
	intensity:        or(#LatinIntensityValues)
	modality:         "posture" | "vocal" | "gaze" | "tactile" | "breath"
	canine_archetype: or(#CanineArchetypeValues)
	applies_to:       or(#SubmissionAppliesToValues)
	latin_form:       or(#LatinFormValues)
}

#PoeticSubmissionTags: {
	register:         "poetic"
	intensity:        or(#LatinIntensityValues)
	modality:         "posture" | "vocal" | "gaze" | "tactile"
	canine_archetype: or(#CanineArchetypeValues)
	applies_to:       or(#SubmissionAppliesToValues)
	latin_form:       or(#LatinFormValues)
}

#SubmissionVariantTags: #TechnicalSubmissionTags | #PoeticSubmissionTags

#SubmissionVariant: {
	text: string
	tags: #SubmissionVariantTags
}

// ── Variant taxonomy ───────────────────────────────────────────────────

#Variants: [string]: #SubmissionVariant

#Variants: {
	// ── technical register — observable canine submission cues ─────────
	cervix_nudatur: {
		text: "cervix nudatur"
		tags: {
			register:         "technical"
			intensity:        "firm"
			modality:         "posture"
			canine_archetype: "generic"
			applies_to:       "neck"
			latin_form:       "predication"
		}
	}
	caput_demittitur: {
		text: "caput demittitur"
		tags: {
			register:         "technical"
			intensity:        "moderate"
			modality:         "posture"
			canine_archetype: "generic"
			applies_to:       "head"
			latin_form:       "predication"
		}
	}
	oculi_humum_quaerunt: {
		text: "oculi humum quaerunt"
		tags: {
			register:         "technical"
			intensity:        "moderate"
			modality:         "gaze"
			canine_archetype: "generic"
			applies_to:       "eyes"
			latin_form:       "predication"
		}
	}
	genu_flectitur: {
		text: "genu flectitur"
		tags: {
			register:         "technical"
			intensity:        "firm"
			modality:         "posture"
			canine_archetype: "generic"
			applies_to:       "body"
			latin_form:       "predication"
		}
	}
	vox_in_fauce_frangitur: {
		text: "vox in fauce frangitur"
		tags: {
			register:         "technical"
			intensity:        "moderate"
			modality:         "vocal"
			canine_archetype: "generic"
			applies_to:       "throat"
			latin_form:       "predication"
		}
	}
	manus_apertae_demittuntur: {
		text: "manus apertae demittuntur"
		tags: {
			register:         "technical"
			intensity:        "moderate"
			modality:         "posture"
			canine_archetype: "generic"
			applies_to:       "hands"
			latin_form:       "predication"
		}
	}
	pilus_in_dorso_iacet: {
		text: "pilus in dorso iacet"
		tags: {
			register:         "technical"
			intensity:        "subtle"
			modality:         "posture"
			canine_archetype: "generic"
			applies_to:       "body"
			latin_form:       "predication"
		}
	}
	respiratio_levis_et_celeris: {
		text: "respiratio levis et celeris"
		tags: {
			register:         "technical"
			intensity:        "subtle"
			modality:         "breath"
			canine_archetype: "generic"
			applies_to:       "presence"
			latin_form:       "noun_phrase"
		}
	}
	corpus_minus_fit: {
		text: "corpus minus fit"
		tags: {
			register:         "technical"
			intensity:        "firm"
			modality:         "posture"
			canine_archetype: "generic"
			applies_to:       "presence"
			latin_form:       "predication"
		}
	}
	caput_sub_manu_maioris_quiescit: {
		text: "caput sub manu maioris quiescit"
		tags: {
			register:         "technical"
			intensity:        "firm"
			modality:         "tactile"
			canine_archetype: "generic"
			applies_to:       "head"
			latin_form:       "predication"
		}
	}
	// ── poetic register — pup-before-wolf, suppliant-with-closed-throat ─
	cervix_nudata_maiori_offertur: {
		text: "cervix nudata maiori offertur"
		tags: {
			register:         "poetic"
			intensity:        "absolute"
			modality:         "posture"
			canine_archetype: "generic"
			applies_to:       "neck"
			latin_form:       "predication"
		}
	}
	catulus_ante_lupum_tacet: {
		text: "catulus ante lupum tacet"
		tags: {
			register:         "poetic"
			intensity:        "firm"
			modality:         "vocal"
			canine_archetype: "catulus"
			applies_to:       "presence"
			latin_form:       "predication"
		}
	}
	supplex_gutture_clauso_veniam_petit: {
		text: "supplex gutture clauso veniam petit"
		tags: {
			register:         "poetic"
			intensity:        "firm"
			modality:         "vocal"
			canine_archetype: "generic"
			applies_to:       "throat"
			latin_form:       "predication"
		}
	}
	oculi_humiles_anima_humilior: {
		text: "oculi humiles, anima humilior"
		tags: {
			register:         "poetic"
			intensity:        "moderate"
			modality:         "gaze"
			canine_archetype: "generic"
			applies_to:       "eyes"
			latin_form:       "noun_phrase"
		}
	}
	infimus_inter_maiores: {
		text: "infimus inter maiores"
		tags: {
			register:         "poetic"
			intensity:        "moderate"
			modality:         "posture"
			canine_archetype: "generic"
			applies_to:       "presence"
			latin_form:       "noun_phrase"
		}
	}
	supinatus_gulam_offert: {
		text: "supinatus gulam offert"
		tags: {
			register:         "poetic"
			intensity:        "absolute"
			modality:         "posture"
			canine_archetype: "generic"
			applies_to:       "throat"
			latin_form:       "predication"
		}
	}
	vox_cessat_ubi_maior_stat: {
		text: "vox cessat ubi maior stat"
		tags: {
			register:         "poetic"
			intensity:        "firm"
			modality:         "vocal"
			canine_archetype: "generic"
			applies_to:       "presence"
			latin_form:       "predication"
		}
	}
	ungues_sub_manu_vincentis_quiescunt: {
		text: "ungues sub manu vincentis quiescunt"
		tags: {
			register:         "poetic"
			intensity:        "firm"
			modality:         "tactile"
			canine_archetype: "generic"
			applies_to:       "hands"
			latin_form:       "predication"
		}
	}
	semet_sub_umbram_maioris_condit: {
		text: "semet sub umbram maioris condit"
		tags: {
			register:         "poetic"
			intensity:        "firm"
			modality:         "posture"
			canine_archetype: "generic"
			applies_to:       "presence"
			latin_form:       "predication"
		}
	}
	pilus_humilis_anima_mansueta: {
		text: "pilus humilis, anima mansueta"
		tags: {
			register:         "poetic"
			intensity:        "subtle"
			modality:         "posture"
			canine_archetype: "generic"
			applies_to:       "body"
			latin_form:       "noun_phrase"
		}
	}
}

// ── Pack ───────────────────────────────────────────────────────────────

tag_registry: #TagRegistryV1 & {
	modality: {
		label:          "Modality"
		description:    "Sensory/behavioral modality of the canine dynamic: breath, gaze, posture, scent, tactile, visual, vocal."
		allowed_values: ["breath", "gaze", "posture", "tactile", "vocal"]
		applies_to: [{role: "modifier", category: "latin_enhancer"}]
		status: "active"
	}
	canine_archetype: {
		label:          "Canine Archetype"
		description:    "Canine archetype the phrase casts: catulus (pup), canis (dog), lupus (wolf), molossus (mastiff), grex (pack), or generic."
		allowed_values: ["catulus", "generic"]
		applies_to: [{role: "modifier", category: "latin_enhancer"}]
		status: "active"
	}
}

pack: #PromptBlockPackV1 & {
	version:      "1.0.0"
	package_name: "latin_canine_submission_dynamics"
	defaults: {
		is_public: true
		source:    "system"
	}
	blocks: [
		{
			id: "canine_submission"
			block_schema: {
				id_prefix: "latin.submission.canine"
				mode:      "surface"
				category:  "latin_enhancer"
				capabilities: ["latin.enhancer", "submission.dynamics", "canine.dynamics"]
				text_template: "Latin enhancer: {variant}."
				tags: {
					modifier_family:  "latin_enhancer"
					modality_support: "both"
					temporal:         "neutral"
					domain: ["submission", "hierarchy", "canine", "creature_neutral_anatomy"]
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
	id:          "latin-canine-submission-dynamics"
	title:       "Latin Canine Submission Dynamics"
	description: "Curated Latin phrase enhancers for canine-coded submission: bared neck, lowered head, knee-bend, closed throat, flat hackles. Biped-safe vocabulary; pairs with latin_canine_dominance_dynamics for full hierarchy scenes."
	category:    "latin"
	matrix_presets: [
		{
			label: "Register by Intensity"
			query: {
				row_key:       "tag:register"
				col_key:       "tag:intensity"
				package_name:  "latin_canine_submission_dynamics"
				include_empty: true
			}
		},
		{
			label: "Modality by Register"
			query: {
				row_key:       "tag:modality"
				col_key:       "tag:register"
				package_name:  "latin_canine_submission_dynamics"
				include_empty: true
			}
		},
		{
			label: "Canine Archetype by Modality"
			query: {
				row_key:       "tag:canine_archetype"
				col_key:       "tag:modality"
				package_name:  "latin_canine_submission_dynamics"
				include_empty: true
			}
		},
	]
}

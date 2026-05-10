package promptpacks

// latin_canine_dominance_dynamics — canine-coded dominance posture, voice,
// presence, and gaze.  Biped-safe: uses jaws, fangs, hackles, throat-growl,
// scent, and shadow without four-leg imagery.  Suitable for werewolves,
// gnolls, beastfolk, lupine knights, or any character carrying canine
// register over a bipedal frame.
//
// Sibling to latin_canine_submission_dynamics.  Pair the two for full
// hierarchy scenes.
//
// Authoring shape: typed-taxonomy + comprehension with register × modality
// coupling.  Technical describes observable mechanics (tactile, breath
// included) — what a viewer can see directly.  Poetic adds scent, a
// presence-level interpretive modality with no technical analogue.

// ── Shared latin enhancer enums ────────────────────────────────────────
#LatinRegisterValues:  ["technical", "poetic"]
#LatinIntensityValues: ["subtle", "moderate", "firm", "absolute"]
#LatinFormValues:      ["predication", "noun_phrase"]

// ── Pack-specific enums ────────────────────────────────────────────────
#CanineArchetypeValues:    ["lupus", "canis", "molossus", "catulus", "catula", "generic"]
#DominanceModalityValues:  ["posture", "vocal", "gaze", "tactile", "scent", "breath", "visual"]
#DominanceAppliesToValues: ["presence", "head", "neck", "throat", "eyes"]

// ── Register-axis shapes ───────────────────────────────────────────────
// Technical = observable mechanics (tactile contact, breath rhythm visible).
// Poetic = interpretive presence (scent — atmospheric, not directly visible).

#TechnicalDominanceTags: {
	register:         "technical"
	intensity:        or(#LatinIntensityValues)
	modality:         "posture" | "vocal" | "gaze" | "tactile" | "breath" | "visual"
	canine_archetype: or(#CanineArchetypeValues)
	applies_to:       or(#DominanceAppliesToValues)
	latin_form:       or(#LatinFormValues)
}

#PoeticDominanceTags: {
	register:         "poetic"
	intensity:        or(#LatinIntensityValues)
	modality:         "posture" | "vocal" | "gaze" | "scent" | "visual"
	canine_archetype: or(#CanineArchetypeValues)
	applies_to:       or(#DominanceAppliesToValues)
	latin_form:       or(#LatinFormValues)
}

#DominanceVariantTags: #TechnicalDominanceTags | #PoeticDominanceTags

#DominanceVariant: {
	text: string
	tags: #DominanceVariantTags
}

// ── Variant taxonomy ───────────────────────────────────────────────────

#Variants: [string]: #DominanceVariant

#Variants: {
	// ── technical register — observable canine dominance cues ──────────
	dentes_nudantur: {
		text: "dentes nudantur"
		tags: {
			register:         "technical"
			intensity:        "firm"
			modality:         "visual"
			canine_archetype: "generic"
			applies_to:       "head"
			latin_form:       "predication"
		}
	}
	pilus_in_cervice_surgit: {
		text: "pilus in cervice surgit"
		tags: {
			register:         "technical"
			intensity:        "moderate"
			modality:         "posture"
			canine_archetype: "generic"
			applies_to:       "neck"
			latin_form:       "predication"
		}
	}
	vox_e_gutture_rauca_venit: {
		text: "vox e gutture rauca venit"
		tags: {
			register:         "technical"
			intensity:        "firm"
			modality:         "vocal"
			canine_archetype: "generic"
			applies_to:       "throat"
			latin_form:       "predication"
		}
	}
	oculi_in_minorem_figuntur: {
		text: "oculi in minorem figuntur"
		tags: {
			register:         "technical"
			intensity:        "firm"
			modality:         "gaze"
			canine_archetype: "generic"
			applies_to:       "eyes"
			latin_form:       "predication"
		}
	}
	caput_altius_fertur: {
		text: "caput altius fertur"
		tags: {
			register:         "technical"
			intensity:        "moderate"
			modality:         "posture"
			canine_archetype: "generic"
			applies_to:       "head"
			latin_form:       "predication"
		}
	}
	corpus_ante_minorem_incumbit: {
		text: "corpus ante minorem incumbit"
		tags: {
			register:         "technical"
			intensity:        "firm"
			modality:         "posture"
			canine_archetype: "generic"
			applies_to:       "presence"
			latin_form:       "predication"
		}
	}
	manus_cervicem_alterius_premit: {
		text: "manus cervicem alterius premit"
		tags: {
			register:         "technical"
			intensity:        "firm"
			modality:         "tactile"
			canine_archetype: "generic"
			applies_to:       "neck"
			latin_form:       "predication"
		}
	}
	fauces_lente_aperiuntur: {
		text: "fauces lente aperiuntur"
		tags: {
			register:         "technical"
			intensity:        "moderate"
			modality:         "visual"
			canine_archetype: "generic"
			applies_to:       "throat"
			latin_form:       "predication"
		}
	}
	respiratio_gravis_perdurat: {
		text: "respiratio gravis perdurat"
		tags: {
			register:         "technical"
			intensity:        "subtle"
			modality:         "breath"
			canine_archetype: "generic"
			applies_to:       "presence"
			latin_form:       "predication"
		}
	}
	gradus_mensuratus_minorem_circumdat: {
		text: "gradus mensuratus minorem circumdat"
		tags: {
			register:         "technical"
			intensity:        "moderate"
			modality:         "posture"
			canine_archetype: "generic"
			applies_to:       "presence"
			latin_form:       "predication"
		}
	}
	// ── poetic register — lupine "rules without speaking" tradition ────
	lupus_vultu_regnat: {
		text: "lupus vultu regnat"
		tags: {
			register:         "poetic"
			intensity:        "absolute"
			modality:         "posture"
			canine_archetype: "lupus"
			applies_to:       "presence"
			latin_form:       "predication"
		}
	}
	gutture_fracto_minorem_compescit: {
		text: "gutture fracto minorem compescit"
		tags: {
			register:         "poetic"
			intensity:        "firm"
			modality:         "vocal"
			canine_archetype: "generic"
			applies_to:       "throat"
			latin_form:       "predication"
		}
	}
	dens_latet_sed_praesens: {
		text: "dens latet, sed praesens"
		tags: {
			register:         "poetic"
			intensity:        "subtle"
			modality:         "visual"
			canine_archetype: "generic"
			applies_to:       "head"
			latin_form:       "predication"
		}
	}
	odor_dominantis_aerem_implet: {
		text: "odor dominantis aerem implet"
		tags: {
			register:         "poetic"
			intensity:        "moderate"
			modality:         "scent"
			canine_archetype: "generic"
			applies_to:       "presence"
			latin_form:       "predication"
		}
	}
	silentium_ante_morsum: {
		text: "silentium ante morsum"
		tags: {
			register:         "poetic"
			intensity:        "subtle"
			modality:         "vocal"
			canine_archetype: "generic"
			applies_to:       "presence"
			latin_form:       "noun_phrase"
		}
	}
	minor_sub_oculis_lupi_non_fugit: {
		text: "minor sub oculis lupi non fugit"
		tags: {
			register:         "poetic"
			intensity:        "absolute"
			modality:         "gaze"
			canine_archetype: "lupus"
			applies_to:       "presence"
			latin_form:       "predication"
		}
	}
	umbra_canis_super_minorem_cadit: {
		text: "umbra canis super minorem cadit"
		tags: {
			register:         "poetic"
			intensity:        "firm"
			modality:         "posture"
			canine_archetype: "canis"
			applies_to:       "presence"
			latin_form:       "predication"
		}
	}
	dux_sine_voce_regit: {
		text: "dux sine voce regit"
		tags: {
			register:         "poetic"
			intensity:        "absolute"
			modality:         "posture"
			canine_archetype: "generic"
			applies_to:       "presence"
			latin_form:       "predication"
		}
	}
	molossus_stat_mundus_tacet: {
		text: "molossus stat, mundus tacet"
		tags: {
			register:         "poetic"
			intensity:        "absolute"
			modality:         "posture"
			canine_archetype: "molossus"
			applies_to:       "presence"
			latin_form:       "predication"
		}
	}
	caput_altius_animus_altior: {
		text: "caput altius, animus altior"
		tags: {
			register:         "poetic"
			intensity:        "firm"
			modality:         "posture"
			canine_archetype: "generic"
			applies_to:       "head"
			latin_form:       "noun_phrase"
		}
	}
}

// ── Pack ───────────────────────────────────────────────────────────────

pack: #PromptBlockPackV1 & {
	version:      "1.0.0"
	package_name: "latin_canine_dominance_dynamics"
	defaults: {
		is_public: true
		source:    "system"
	}
	blocks: [
		{
			id: "canine_dominance"
			block_schema: {
				id_prefix: "latin.dominance.canine"
				mode:      "surface"
				category:  "latin_enhancer"
				capabilities: ["latin.enhancer", "dominance.dynamics", "canine.dynamics"]
				text_template: "Latin enhancer: {variant}."
				tags: {
					modifier_family:  "latin_enhancer"
					modality_support: "both"
					temporal:         "neutral"
					domain: ["dominance", "hierarchy", "canine", "creature_neutral_anatomy"]
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
	id:          "latin-canine-dominance-dynamics"
	title:       "Latin Canine Dominance Dynamics"
	description: "Curated Latin phrase enhancers for canine-coded dominance: bared fangs, raised hackles, throat-growl, fixed gaze, looming presence. Biped-safe vocabulary; works for werewolves, gnolls, beastfolk, or any canine-flavored character."
	category:    "latin"
	matrix_presets: [
		{
			label: "Register by Intensity"
			query: {
				row_key:       "tag:register"
				col_key:       "tag:intensity"
				package_name:  "latin_canine_dominance_dynamics"
				include_empty: true
			}
		},
		{
			label: "Modality by Register"
			query: {
				row_key:       "tag:modality"
				col_key:       "tag:register"
				package_name:  "latin_canine_dominance_dynamics"
				include_empty: true
			}
		},
		{
			label: "Canine Archetype by Modality"
			query: {
				row_key:       "tag:canine_archetype"
				col_key:       "tag:modality"
				package_name:  "latin_canine_dominance_dynamics"
				include_empty: true
			}
		},
	]
}

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
//
// Authoring shape demonstrates two orthogonal CUE constraint axes that
// must BOTH hold for every variant:
//
//   1. Register axis (#TechnicalShape | #PoeticShape) — register,
//      modality, and bite_state are coupled.  Technical describes
//      observable mechanics with tactile/breath modality and
//      non-interpretive bite states.  Poetic adds visual modality and
//      warning_pressure (an interpretive intentional-threat state).
//
//   2. Bite-state axis (#OpenCradleShape | #WarningPressureShape |
//      #ScoringShape | #ClosedNoPressureShape | #HeldLightlyShape) —
//      bite_state and mouth_target are coupled.  warning_pressure only
//      makes sense at the neck.  scoring (teeth-touching-skin) lands
//      only at collarbone or neck.  open_cradle (jaws encircling)
//      requires a part the jaws can encircle.
//
// CUE unifies both axes via `&`, so every variant must satisfy a register
// shape AND a bite-state shape.  Mistagging "register=technical +
// bite_state=warning_pressure" or "bite_state=warning_pressure +
// mouth_target=hand" both fail at codegen.

// ── Shared latin enhancer enums (mirrored across latin_* packs) ────────
#LatinRegisterValues:  ["technical", "poetic"]
#LatinIntensityValues: ["subtle", "moderate", "firm", "absolute"]
#LatinFormValues:      ["predication", "noun_phrase"]

// ── Pack-specific enums ────────────────────────────────────────────────
#CanineArchetypeValues: ["lupus", "canis", "molossus", "catulus", "catula", "generic"]
#MouthingModalityValues: ["tactile", "breath", "visual"]
#MouthTargetValues:     ["wrist", "forearm", "hand", "finger", "hair", "neck", "shoulder", "collarbone", "ankle"]
#BiteStateValues:       ["open_cradle", "closed_no_pressure", "held_lightly", "warning_pressure", "scoring"]

// ── Register-axis shapes ───────────────────────────────────────────────
// register, modality, bite_state are coupled per-register.

#TechnicalShape: {
	register:   "technical"
	modality:   "tactile" | "breath"
	bite_state: "open_cradle" | "closed_no_pressure" | "held_lightly" | "scoring"
	...
}

#PoeticShape: {
	register:   "poetic"
	modality:   "tactile" | "visual"
	bite_state: "open_cradle" | "closed_no_pressure" | "held_lightly" | "warning_pressure" | "scoring"
	...
}

// ── Bite-state-axis shapes ─────────────────────────────────────────────
// bite_state and mouth_target are coupled per-bite-state.

#OpenCradleShape: {
	bite_state:   "open_cradle"
	mouth_target: "forearm" | "shoulder" | "neck"
	...
}

#WarningPressureShape: {
	bite_state:   "warning_pressure"
	mouth_target: "neck"
	...
}

#ScoringShape: {
	bite_state:   "scoring"
	mouth_target: "collarbone" | "neck"
	...
}

#ClosedNoPressureShape: {
	bite_state:   "closed_no_pressure"
	mouth_target: "hand" | "ankle" | "wrist"
	...
}

#HeldLightlyShape: {
	bite_state:   "held_lightly"
	mouth_target: "wrist" | "finger" | "hair" | "shoulder"
	...
}

// ── Composite tag type ─────────────────────────────────────────────────
// Every variant must satisfy: base fields ∧ register-axis ∧ bite-state-axis.

#MouthingVariantTags: {
	register:         or(#LatinRegisterValues)
	intensity:        or(#LatinIntensityValues)
	modality:         or(#MouthingModalityValues)
	canine_archetype: or(#CanineArchetypeValues)
	mouth_target:     or(#MouthTargetValues)
	bite_state:       or(#BiteStateValues)
	latin_form:       or(#LatinFormValues)
} & (#TechnicalShape | #PoeticShape) &
	(#OpenCradleShape | #WarningPressureShape | #ScoringShape | #ClosedNoPressureShape | #HeldLightlyShape)

#MouthingVariant: {
	text: string
	tags: #MouthingVariantTags
}

// ── Variant taxonomy ───────────────────────────────────────────────────

#Variants: [string]: #MouthingVariant

#Variants: {
	// ── technical register — observable mouth-on-limb mechanics ────────
	fauces_manum_tenent_sed_non_mordent: {
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
	}
	dentes_carpum_circumdant_leniter: {
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
	}
	os_apertum_bracchio_inhaeret: {
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
	}
	labra_umero_quiescunt_dens_supra: {
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
	}
	fauces_digitos_comprehendunt_sine_vi: {
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
	}
	anhelitus_calidus_in_cute_manet: {
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
	}
	caput_in_collo_iacet_ore_aperto: {
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
	}
	dentes_capillum_mollius_prendunt: {
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
	}
	mandibula_talum_cingit: {
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
	}
	dentes_iugulum_tangunt_non_premunt: {
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
	}
	// ── poetic register — threat-without-harm tradition ────────────────
	dens_minatur_sed_non_vulnerat: {
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
	}
	lupus_tenet_sed_non_figit: {
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
	}
	fauces_apertae_voluntas_clausa: {
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
	}
	minae_sine_sanguine: {
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
	}
	catula_in_lupi_morsu_lascivit: {
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
	}
	dens_iudex_non_carnifex: {
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
	}
	vinculum_molle_dentium: {
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
	}
	morsum_sentit_quae_morsum_non_patitur: {
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
	}
	quietus_dens_super_venam: {
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
	}
	mansueta_minatio_mansuetus_dolor: {
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
	}
}

// ── Pack ───────────────────────────────────────────────────────────────

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
				// Variants are generated from #Variants via comprehension.
				// Adding a variant means adding one entry above.
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
	id:          "latin-canine-mouthing-dynamics"
	title:       "Latin Canine Mouthing Dynamics"
	description: "Curated Latin phrase enhancers for canine mouthing: open or closed jaw cradling a wrist, forearm, hair, or shoulder without biting down. Threat-as-touch — the fangs are present, the bite withheld. Sibling to latin_canine_scruff_dynamics; pair the two for anchor + cradle scenes."
	category:    "latin"
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

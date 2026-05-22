package promptpacks

// latin_canine_pin_dynamics — Latin phrase enhancers for canine-coded pinning,
// mounting, and restraint.
//
// Sibling to latin_pin_dynamics, but specialised to the lupine/molossus
// register: jaws, fangs, claws, weight, and pack hierarchy.  Intended as a
// right-hand qualifier:
//   ACTOR1 = motion < latin.pin.canine.lupus_non_dimittit_quod_cepit
//
// Technical variants describe canine mechanics (paw pressure, fang grip on
// nape, weight on shoulders).  Poetic variants draw on the classical
// predator-prey tradition through a canine lens — wolf and prey, mastiff
// and earth, the silence kept by the jaw.
//
// Authoring shape: typed-taxonomy + comprehension with register × intensity
// coupling.  Technical describes the physics of holding (moderate-to-
// absolute force).  Poetic spans the full range from subtle (silence in
// the throat) to absolute (the world goes still beneath the mastiff).

// ── Shared latin enhancer enums ────────────────────────────────────────
#LatinRegisterValues:  ["technical", "poetic"]
#LatinIntensityValues: ["subtle", "moderate", "firm", "absolute"]
#LatinFormValues:      ["predication", "noun_phrase"]

// ── Pack-specific enums ────────────────────────────────────────────────
#CanineArchetypeValues:  ["lupus", "canis", "molossus", "catulus", "catula", "grex", "generic"]
#PinMotionTypeValues:    ["pin", "press", "hold", "grip", "mount", "surround", "immobilize", "restrain"]
#PinAppliesToValues:     ["full_body", "upper_body", "torso", "limbs", "neck"]

// ── Register-axis shapes ───────────────────────────────────────────────
// Technical describes the physics of holding (no subtle mechanics — a
// "subtle" pin is a contradiction in mechanics).  Poetic spans the full
// range, including subtle (the silence between teeth) and absolute (the
// world goes still beneath the mastiff).

#TechnicalPinTags: {
	register:         "technical"
	intensity:        "moderate" | "firm" | "absolute"
	motion_type:      or(#PinMotionTypeValues)
	applies_to:       or(#PinAppliesToValues)
	canine_archetype: or(#CanineArchetypeValues)
	latin_form:       or(#LatinFormValues)
}

#PoeticPinTags: {
	register:         "poetic"
	intensity:        or(#LatinIntensityValues)
	motion_type:      or(#PinMotionTypeValues)
	applies_to:       or(#PinAppliesToValues)
	canine_archetype: or(#CanineArchetypeValues)
	latin_form:       or(#LatinFormValues)
}

#PinVariantTags: #TechnicalPinTags | #PoeticPinTags

#PinVariant: {
	text: string
	tags: #PinVariantTags
}

// ── Variant taxonomy ───────────────────────────────────────────────────

#Variants: [string]: #PinVariant

#Variants: {
	// ── technical register — canine mechanics ──────────────────────────
	canis_praedam_ungulis_premit: {
		text: "canis praedam ungulis premit"
		tags: {
			register:         "technical"
			intensity:        "firm"
			motion_type:      "press"
			applies_to:       "full_body"
			canine_archetype: "canis"
			latin_form:       "predication"
		}
	}
	lupus_collum_dentibus_tenet: {
		text: "lupus collum dentibus tenet"
		tags: {
			register:         "technical"
			intensity:        "absolute"
			motion_type:      "hold"
			applies_to:       "neck"
			canine_archetype: "lupus"
			latin_form:       "predication"
		}
	}
	molossus_victum_ad_terram_fixit: {
		text: "molossus victum ad terram fixit"
		tags: {
			register:         "technical"
			intensity:        "absolute"
			motion_type:      "pin"
			applies_to:       "full_body"
			canine_archetype: "molossus"
			latin_form:       "predication"
		}
	}
	fauces_cervicem_circumdant: {
		text: "fauces cervicem circumdant"
		tags: {
			register:         "technical"
			intensity:        "firm"
			motion_type:      "grip"
			applies_to:       "neck"
			canine_archetype: "generic"
			latin_form:       "predication"
		}
	}
	pondus_canis_super_humeros_incumbit: {
		text: "pondus canis super humeros incumbit"
		tags: {
			register:         "technical"
			intensity:        "firm"
			motion_type:      "press"
			applies_to:       "upper_body"
			canine_archetype: "canis"
			latin_form:       "predication"
		}
	}
	catulus_dorso_vincti_insidet: {
		text: "catulus dorso vincti insidet"
		tags: {
			register:         "technical"
			intensity:        "moderate"
			motion_type:      "mount"
			applies_to:       "torso"
			canine_archetype: "catulus"
			latin_form:       "predication"
		}
	}
	dentes_nuchae_imprimuntur: {
		text: "dentes nuchae imprimuntur"
		tags: {
			register:         "technical"
			intensity:        "firm"
			motion_type:      "grip"
			applies_to:       "neck"
			canine_archetype: "generic"
			latin_form:       "predication"
		}
	}
	ungues_lateribus_haerent: {
		text: "ungues lateribus haerent"
		tags: {
			register:         "technical"
			intensity:        "moderate"
			motion_type:      "grip"
			applies_to:       "torso"
			canine_archetype: "generic"
			latin_form:       "predication"
		}
	}
	grex_vinctum_circumdat: {
		text: "grex vinctum circumdat"
		tags: {
			register:         "technical"
			intensity:        "firm"
			motion_type:      "surround"
			applies_to:       "full_body"
			canine_archetype: "grex"
			latin_form:       "predication"
		}
	}
	crus_inter_genua_canis_premitur: {
		text: "crus inter genua canis premitur"
		tags: {
			register:         "technical"
			intensity:        "firm"
			motion_type:      "press"
			applies_to:       "limbs"
			canine_archetype: "canis"
			latin_form:       "predication"
		}
	}
	// ── poetic register — predator-prey through a canine lens ──────────
	lupus_non_dimittit_quod_cepit: {
		text: "lupus non dimittit quod cepit"
		tags: {
			register:         "poetic"
			intensity:        "absolute"
			motion_type:      "hold"
			applies_to:       "full_body"
			canine_archetype: "lupus"
			latin_form:       "predication"
		}
	}
	sub_fauce_lupina_anima_quiescit: {
		text: "sub fauce lupina anima quiescit"
		tags: {
			register:         "poetic"
			intensity:        "absolute"
			motion_type:      "immobilize"
			applies_to:       "full_body"
			canine_archetype: "lupus"
			latin_form:       "noun_phrase"
		}
	}
	canis_dominus_victus_humus: {
		text: "canis dominus, victus humus"
		tags: {
			register:         "poetic"
			intensity:        "absolute"
			motion_type:      "pin"
			applies_to:       "full_body"
			canine_archetype: "canis"
			latin_form:       "noun_phrase"
		}
	}
	praeda_sub_molosso_silet: {
		text: "praeda sub molosso silet"
		tags: {
			register:         "poetic"
			intensity:        "absolute"
			motion_type:      "pin"
			applies_to:       "full_body"
			canine_archetype: "molossus"
			latin_form:       "predication"
		}
	}
	nox_canina_super_victum_cadit: {
		text: "nox canina super victum cadit"
		tags: {
			register:         "poetic"
			intensity:        "firm"
			motion_type:      "press"
			applies_to:       "full_body"
			canine_archetype: "canis"
			latin_form:       "predication"
		}
	}
	spiritus_inter_dentes_manet: {
		text: "spiritus inter dentes manet"
		tags: {
			register:         "poetic"
			intensity:        "subtle"
			motion_type:      "hold"
			applies_to:       "neck"
			canine_archetype: "generic"
			latin_form:       "predication"
		}
	}
	corpus_canino_pondere_consecratur: {
		text: "corpus canino pondere consecratur"
		tags: {
			register:         "poetic"
			intensity:        "absolute"
			motion_type:      "press"
			applies_to:       "full_body"
			canine_archetype: "canis"
			latin_form:       "predication"
		}
	}
	pectus_terrae_dorsum_cani_datur: {
		text: "pectus terrae, dorsum cani datur"
		tags: {
			register:         "poetic"
			intensity:        "absolute"
			motion_type:      "pin"
			applies_to:       "torso"
			canine_archetype: "canis"
			latin_form:       "predication"
		}
	}
	silentium_fauce_custoditur: {
		text: "silentium fauce custoditur"
		tags: {
			register:         "poetic"
			intensity:        "moderate"
			motion_type:      "hold"
			applies_to:       "neck"
			canine_archetype: "generic"
			latin_form:       "predication"
		}
	}
	humilitas_victi_sub_cane_perfecta: {
		text: "humilitas victi sub cane perfecta"
		tags: {
			register:         "poetic"
			intensity:        "absolute"
			motion_type:      "immobilize"
			applies_to:       "full_body"
			canine_archetype: "canis"
			latin_form:       "noun_phrase"
		}
	}
	ungula_lupi_terram_cum_corpore_tenet: {
		text: "ungula lupi terram cum corpore tenet"
		tags: {
			register:         "poetic"
			intensity:        "absolute"
			motion_type:      "pin"
			applies_to:       "full_body"
			canine_archetype: "lupus"
			latin_form:       "predication"
		}
	}
	dens_fidelis_vinctum_tenax: {
		text: "dens fidelis, vinctum tenax"
		tags: {
			register:         "poetic"
			intensity:        "firm"
			motion_type:      "grip"
			applies_to:       "neck"
			canine_archetype: "generic"
			latin_form:       "noun_phrase"
		}
	}
}

// ── Pack ───────────────────────────────────────────────────────────────

tag_registry: #TagRegistryV1 & {
	canine_archetype: {
		label:          "Canine Archetype"
		description:    "Canine archetype the phrase casts: catulus (pup), canis (dog), lupus (wolf), molossus (mastiff), grex (pack), or generic."
		allowed_values: ["canis", "catulus", "generic", "grex", "lupus", "molossus"]
		applies_to: [{role: "modifier", category: "latin_enhancer"}]
		status: "active"
	}
}

pack: #PromptBlockPackV1 & {
	version:      "1.0.0"
	package_name: "latin_canine_pin_dynamics"
	defaults: {
		is_public: true
		source:    "system"
	}
	blocks: [
		{
			id: "canine_pin"
			block_schema: {
				id_prefix: "latin.pin.canine"
				mode:      "surface"
				category:  "latin_enhancer"
				capabilities: ["latin.enhancer", "pin.dynamics", "canine.dynamics"]
				text_template: "Latin enhancer: {variant}."
				tags: {
					modifier_family:  "latin_enhancer"
					modality_support: "both"
					temporal:         "neutral"
					domain: ["pin", "restraint", "canine", "animal_dynamics"]
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
	id:          "latin-canine-pin-dynamics"
	title:       "Latin Canine Pin Dynamics"
	description: "Curated Latin phrase enhancers for canine-coded pinning, mounting, and restraint. Leans poetic, drawing on the lupine/molossus register of jaws, fangs, claws, weight, and pack hierarchy."
	category:    "latin"
	matrix_presets: [
		{
			label: "Register by Intensity"
			query: {
				row_key:       "tag:register"
				col_key:       "tag:intensity"
				package_name:  "latin_canine_pin_dynamics"
				include_empty: true
			}
		},
		{
			label: "Motion Type by Register"
			query: {
				row_key:       "tag:motion_type"
				col_key:       "tag:register"
				package_name:  "latin_canine_pin_dynamics"
				include_empty: true
			}
		},
		{
			label: "Canine Archetype by Intensity"
			query: {
				row_key:       "tag:canine_archetype"
				col_key:       "tag:intensity"
				package_name:  "latin_canine_pin_dynamics"
				include_empty: true
			}
		},
	]
}

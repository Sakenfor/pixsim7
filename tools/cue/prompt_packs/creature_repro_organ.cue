package promptpacks

// creature_repro_organ — English-language reproductive-anatomy descriptors
// for image-generation prompts.  Creature-generic: covers insertive,
// receptive, and cloacal morphologies without species lock-in.  Variants
// are short composable phrases meant to be chained the same way a
// hand-written prompt chains anatomical clauses (e.g. "approximately 3 cm
// length, 1 cm girth, slightly erect, forward-presented, ...").
//
// Differs from latin_repro_organ:
//   - latin_repro_organ → Latin-language enhancer (rima generatrix,
//     meatus receptivus, semina vitae); use as overlay/refinement.
//   - creature_repro_organ → English baseline anatomy descriptors,
//     measurement-aware, surface-detailing, ready to inject directly
//     into image-generation prompts.
//
// Establishes the `creature_*` pack family for English-language creature
// anatomy descriptors (parallel to core_* for composition primitives and
// latin_* for Latin enhancers).  Future siblings could include
// creature_jaw, creature_claws, creature_tail, etc.

pack: #PromptBlockPackV1 & {
	version:      "1.0.0"
	package_name: "creature_repro_organ"
	defaults: {
		is_public: true
		source:    "system"
	}
	blocks: [
		{
			id: "organ"
			block_schema: {
				id_prefix: "creature.repro.organ"
				mode:      "surface"
				category:  "creature_anatomy"
				capabilities: ["creature.anatomy", "repro.anatomy"]
				text_template: "Creature anatomy: {variant}."
				tags: {
					modifier_family:  "creature_anatomy"
					modality_support: "both"
					temporal:         "neutral"
					domain: ["reproductive", "anatomy", "creature_generic", "english_descriptor"]
				}
				variants: [
					// ── insertive morphology ───────────────────────────────────────
					{
						key:  "dimensions_small"
						text: "approximately 3 cm length, 1 cm girth"
						tags: {
							organ_class:     "insertive"
							descriptor_type: "dimensions"
							specificity:     "high"
							anatomical_part: "shaft"
						}
					},
					{
						key:  "dimensions_medium"
						text: "approximately 8 cm length, 2 cm girth"
						tags: {
							organ_class:     "insertive"
							descriptor_type: "dimensions"
							specificity:     "high"
							anatomical_part: "shaft"
						}
					},
					{
						key:  "orientation_forward"
						text: "shaft forward-presented, slightly elevated from base"
						tags: {
							organ_class:     "insertive"
							descriptor_type: "orientation"
							specificity:     "medium"
							anatomical_part: "shaft"
						}
					},
					{
						key:  "state_slightly_erect"
						text: "slightly erect, firm but not fully engorged"
						tags: {
							organ_class:     "insertive"
							descriptor_type: "state"
							specificity:     "medium"
							anatomical_part: "shaft"
						}
					},
					{
						key:  "surface_shaft_realistic"
						text: "shaft body of consistent realistic texture, natural skin tone"
						tags: {
							organ_class:     "insertive"
							descriptor_type: "surface"
							specificity:     "medium"
							anatomical_part: "shaft"
						}
					},
					{
						key:  "foreskin_wrinkled"
						text: "wrinkled rough foreskin gathered near distal end"
						tags: {
							organ_class:     "insertive"
							descriptor_type: "morphology"
							specificity:     "medium"
							anatomical_part: "foreskin"
						}
					},
					{
						key:  "foreskin_separation"
						text: "foreskin clearly separating shaft body from glans tip"
						tags: {
							organ_class:     "insertive"
							descriptor_type: "morphology"
							specificity:     "medium"
							anatomical_part: "foreskin"
						}
					},
					{
						key:  "glans_glossy_bulbous"
						text: "glossy distinct bulbous glans, surface contrasting shaft body"
						tags: {
							organ_class:     "insertive"
							descriptor_type: "morphology"
							specificity:     "medium"
							anatomical_part: "glans"
						}
					},
					{
						key:  "urethral_opening_small"
						text: "very small visible urethral opening at glans apex"
						tags: {
							organ_class:     "insertive"
							descriptor_type: "feature"
							specificity:     "high"
							anatomical_part: "glans"
						}
					},
					{
						key:  "firm_unmistakable"
						text: "firm and anatomically unmistakable reproductive organ"
						tags: {
							organ_class:     "insertive"
							descriptor_type: "overall"
							specificity:     "low"
							anatomical_part: "overall"
						}
					},
					// ── receptive morphology ───────────────────────────────────────
					{
						key:  "vulvar_slit"
						text: "vertical slit-form vulvar opening centered between thighs"
						tags: {
							organ_class:     "receptive"
							descriptor_type: "morphology"
							specificity:     "medium"
							anatomical_part: "vulva"
						}
					},
					{
						key:  "labia_defined"
						text: "clearly defined outer and inner labial folds"
						tags: {
							organ_class:     "receptive"
							descriptor_type: "morphology"
							specificity:     "medium"
							anatomical_part: "labia"
						}
					},
					{
						key:  "swelling_receptive"
						text: "slightly swollen, receptive presentation"
						tags: {
							organ_class:     "receptive"
							descriptor_type: "state"
							specificity:     "medium"
							anatomical_part: "vulva"
						}
					},
					{
						key:  "mucosa_transition"
						text: "external skin transitioning to soft inner mucosa"
						tags: {
							organ_class:     "receptive"
							descriptor_type: "surface"
							specificity:     "medium"
							anatomical_part: "vulva"
						}
					},
					{
						key:  "opening_centered"
						text: "small visible opening centered within labial folds"
						tags: {
							organ_class:     "receptive"
							descriptor_type: "feature"
							specificity:     "medium"
							anatomical_part: "vulva"
						}
					},
					{
						key:  "clitoral_hood"
						text: "small visible clitoral hood at upper labial junction"
						tags: {
							organ_class:     "receptive"
							descriptor_type: "feature"
							specificity:     "medium"
							anatomical_part: "clitoris"
						}
					},
					// ── neutral / cloacal / surrounding ────────────────────────────
					{
						key:  "cloacal_slit"
						text: "single cloacal opening, slit-form, posterior placement"
						tags: {
							organ_class:     "neutral"
							descriptor_type: "morphology"
							specificity:     "medium"
							anatomical_part: "cloaca"
						}
					},
					{
						key:  "anatomically_grounded"
						text: "anatomically centered between legs, naturally grounded"
						tags: {
							organ_class:     "neutral"
							descriptor_type: "orientation"
							specificity:     "low"
							anatomical_part: "overall"
						}
					},
					{
						key:  "coloration_gradient"
						text: "natural flesh-tone gradient, slightly pinker at apertures"
						tags: {
							organ_class:     "neutral"
							descriptor_type: "surface"
							specificity:     "medium"
							anatomical_part: "overall"
						}
					},
					{
						key:  "surrounding_smooth"
						text: "surrounding skin smooth, fine sparse body hair"
						tags: {
							organ_class:     "neutral"
							descriptor_type: "surface"
							specificity:     "low"
							anatomical_part: "surrounding"
						}
					},
				]
			}
		},
	]
}

manifest: #PromptPackManifestV1 & {
	id:          "creature-repro-organ"
	title:       "Creature Reproductive Organ (English)"
	description: "English-language reproductive-anatomy descriptors for direct prompt injection. Creature-generic: insertive / receptive / cloacal morphologies, measurement-aware, surface-detailing. Composable atoms (dimensions, orientation, state, shaft surface, foreskin, glans, urethral opening, vulvar morphology, cloacal, surroundings) meant to be chained like hand-written anatomical clauses. Establishes the creature_* pack family — English baseline anatomy, with latin_repro_organ available as Latin-language overlay or species-narrowing pass."
	matrix_presets: [
		{
			label: "Organ Class by Descriptor Type"
			query: {
				row_key:       "tag:organ_class"
				col_key:       "tag:descriptor_type"
				package_name:  "creature_repro_organ"
				include_empty: true
			}
		},
		{
			label: "Anatomical Part by Descriptor Type"
			query: {
				row_key:       "tag:anatomical_part"
				col_key:       "tag:descriptor_type"
				package_name:  "creature_repro_organ"
				include_empty: true
			}
		},
		{
			label: "Specificity by Organ Class"
			query: {
				row_key:       "tag:specificity"
				col_key:       "tag:organ_class"
				package_name:  "creature_repro_organ"
				include_empty: true
			}
		},
	]
}

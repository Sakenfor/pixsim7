package promptpacks

// core_subject_repro_organ — universal subject reproductive-organ primitive.
//
// Op-style pack matching the core_hands / core_subject_pose pattern: enum
// params describe organ state, variants are preset combinations.
//
// Universal: humans, creatures, anthros, hybrids.  organ_class enum
// covers insertive / receptive / cloacal / neutral / none, so the same
// op describes any morphology.
//
// Sibling packs:
//   - latin_repro_organ → Latin-language enhancer overlay for free-form
//     anatomical detail (rima generatrix, meatus receptivus, etc.)

tag_registry: #TagRegistryV1 & {
	organ_class: {
		label:          "Organ Class"
		description:    "Reproductive organ morphology class: insertive, receptive, neutral, cloacal, or none."
		allowed_values: #OrganClassValues
		applies_to: [{role: "modifier", category: "character_anatomy"}]
		status: "active"
	}
	organ_state: {
		label:          "Organ State"
		description:    "Functional state: flaccid, slightly_erect, fully_erect, receptive, post_use, neutral."
		allowed_values: #OrganStateValues
		applies_to: [{role: "modifier", category: "character_anatomy"}]
		status: "active"
	}
	organ_visibility: {
		label:          "Organ Visibility"
		description:    "How visible the organ is in frame: visible, clothed, obscured, implied."
		allowed_values: #OrganVisibilityValues
		applies_to: [{role: "modifier", category: "character_anatomy"}]
		status: "active"
	}
	organ_presentation: {
		label:          "Organ Presentation"
		description:    "Spatial presentation: forward, dropped, sheathed, tucked, exposed, concealed."
		allowed_values: #OrganPresentationValues
		applies_to: [{role: "modifier", category: "character_anatomy"}]
		status: "active"
	}
	organ_size: {
		label:          "Organ Size"
		description:    "Size tier: small, medium, large, very_large, unspecified."
		allowed_values: #OrganSizeValues
		applies_to: [{role: "modifier", category: "character_anatomy"}]
		status: "active"
	}
	organ_surface: {
		label:          "Organ Surface"
		description:    "Surface texture: smooth, wrinkled, textured, ridged, glossy, matte, natural."
		allowed_values: #OrganSurfaceValues
		applies_to: [{role: "modifier", category: "character_anatomy"}]
		status: "active"
	}
}

pack: #PromptBlockPackV1 & {
	version:      "1.0.0"
	package_name: "core_subject_repro_organ"
	defaults: {
		is_public: true
		source:    "system"
	}
	blocks: [
		{
			id: "repro_organ"
			block_schema: {
				id_prefix: "core.subject.repro_organ"
				category:  "character_anatomy"
				capabilities: ["subject.repro_organ"]
				text_template: "Reproductive organ token: {variant}."
				tags: {
					modifier_family:  "repro_organ"
					modality_support: "both"
					temporal:         "neutral"
				}
				op: {
					op_id:        "subject.repro_organ.set"
					signature_id: "subject.repro_organ.v1"
					modalities: ["both"]
					refs: [
						{
							key:        "subject"
							capability: "subject"
							required:   false
						},
					]
					params: [
						{
							key:     "organ_class"
							type:    "enum"
							default: "neutral"
							enum:    #OrganClassValues
							tag_key: "organ_class"
						},
						{
							key:     "state"
							type:    "enum"
							default: "neutral"
							enum:    #OrganStateValues
							tag_key: "organ_state"
						},
						{
							key:     "visibility"
							type:    "enum"
							default: "visible"
							enum:    #OrganVisibilityValues
							tag_key: "organ_visibility"
						},
						{
							key:     "presentation"
							type:    "enum"
							default: "forward"
							enum:    #OrganPresentationValues
							tag_key: "organ_presentation"
						},
						{
							key:     "size"
							type:    "enum"
							default: "unspecified"
							enum:    #OrganSizeValues
							tag_key: "organ_size"
						},
						{
							key:     "surface"
							type:    "enum"
							default: "natural"
							enum:    #OrganSurfaceValues
							tag_key: "organ_surface"
						},
						{
							key:            "subject_ref"
							type:           "ref"
							required:       false
							ref_capability: "subject"
						},
					]
					default_args: {
						organ_class:  "neutral"
						state:        "neutral"
						visibility:   "visible"
						presentation: "forward"
						size:         "unspecified"
						surface:      "natural"
					}
				}
				variants: [
					// ── insertive presets ──────────────────────────────────────────
					{
						key: "insertive_flaccid_visible"
						op_args: {
							organ_class:  "insertive"
							state:        "flaccid"
							visibility:   "visible"
							presentation: "dropped"
							size:         "unspecified"
							surface:      "natural"
						}
					},
					{
						key: "insertive_slightly_erect_small_forward"
						op_args: {
							organ_class:  "insertive"
							state:        "slightly_erect"
							visibility:   "visible"
							presentation: "forward"
							size:         "small"
							surface:      "wrinkled"
						}
					},
					{
						key: "insertive_slightly_erect_medium_forward"
						op_args: {
							organ_class:  "insertive"
							state:        "slightly_erect"
							visibility:   "visible"
							presentation: "forward"
							size:         "medium"
							surface:      "natural"
						}
					},
					{
						key: "insertive_fully_erect_medium_forward"
						op_args: {
							organ_class:  "insertive"
							state:        "fully_erect"
							visibility:   "visible"
							presentation: "forward"
							size:         "medium"
							surface:      "smooth"
						}
					},
					{
						key: "insertive_fully_erect_large_forward"
						op_args: {
							organ_class:  "insertive"
							state:        "fully_erect"
							visibility:   "visible"
							presentation: "forward"
							size:         "large"
							surface:      "smooth"
						}
					},
					{
						key: "insertive_sheathed"
						op_args: {
							organ_class:  "insertive"
							state:        "neutral"
							visibility:   "visible"
							presentation: "sheathed"
							size:         "unspecified"
							surface:      "natural"
						}
					},
					{
						key: "insertive_clothed_implied"
						op_args: {
							organ_class:  "insertive"
							state:        "neutral"
							visibility:   "clothed"
							presentation: "concealed"
							size:         "unspecified"
							surface:      "natural"
						}
					},
					// ── receptive presets ──────────────────────────────────────────
					{
						key: "receptive_neutral_visible"
						op_args: {
							organ_class:  "receptive"
							state:        "neutral"
							visibility:   "visible"
							presentation: "exposed"
							size:         "unspecified"
							surface:      "smooth"
						}
					},
					{
						key: "receptive_aroused_visible"
						op_args: {
							organ_class:  "receptive"
							state:        "receptive"
							visibility:   "visible"
							presentation: "exposed"
							size:         "unspecified"
							surface:      "glossy"
						}
					},
					{
						key: "receptive_clothed_implied"
						op_args: {
							organ_class:  "receptive"
							state:        "neutral"
							visibility:   "clothed"
							presentation: "concealed"
							size:         "unspecified"
							surface:      "natural"
						}
					},
					// ── neutral / cloacal / none ───────────────────────────────────
					{
						key: "cloacal_visible"
						op_args: {
							organ_class:  "cloacal"
							state:        "neutral"
							visibility:   "visible"
							presentation: "exposed"
							size:         "unspecified"
							surface:      "smooth"
						}
					},
					{
						key: "neutral_concealed"
						op_args: {
							organ_class:  "neutral"
							state:        "neutral"
							visibility:   "obscured"
							presentation: "concealed"
							size:         "unspecified"
							surface:      "natural"
						}
					},
					{
						key: "none"
						op_args: {
							organ_class:  "none"
							state:        "neutral"
							visibility:   "obscured"
							presentation: "concealed"
							size:         "unspecified"
							surface:      "natural"
						}
					},
				]
			}
		},
	]
}

manifest: #PromptPackManifestV1 & {
	id:          "core-subject-repro-organ"
	title:       "Core Subject Reproductive Organ"
	description: "Universal subject reproductive-organ primitive. Op-style pack with enum params (organ_class, state, visibility, presentation, size, surface) covering human / creature / anthro / hybrid morphologies through a single op signature. Variants are preset combinations; free-form detail flows through the optional descriptor_text param at op resolution. Pairs with latin_repro_organ as Latin overlay."
	matrix_presets: [
		{
			label: "Organ Class by State"
			query: {
				row_key:       "tag:organ_class"
				col_key:       "tag:organ_state"
				package_name:  "core_subject_repro_organ"
				include_empty: true
			}
		},
		{
			label: "Visibility by Presentation"
			query: {
				row_key:       "tag:organ_visibility"
				col_key:       "tag:organ_presentation"
				package_name:  "core_subject_repro_organ"
				include_empty: true
			}
		},
		{
			label: "Size by Organ Class"
			query: {
				row_key:       "tag:organ_size"
				col_key:       "tag:organ_class"
				package_name:  "core_subject_repro_organ"
				include_empty: true
			}
		},
	]
}

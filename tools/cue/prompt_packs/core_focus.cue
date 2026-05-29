package promptpacks

pack: #PromptBlockPackV1 & {
	version:      "1.0.0"
	package_name: "core_focus"
	defaults: {
		is_public: true
		source:    "system"
	}
	blocks: [
		{
			id: "focus"
			block_schema: {
				id_prefix: "core.camera.focus"
				category:  "camera"
				capabilities: ["camera.focus"]
				text_template: "Focus token: {variant}."
				tags: {
					modifier_family:  "focus"
					modality_support: "both"
					temporal:         "neutral"
				}
				op: {
					op_id: "camera.focus.set"
					signature_id: "camera.focus.v1"
					modalities: ["both"]
					refs: [
						{
							key:        "subject"
							capability: "subject"
							required:   false
						},
						{
							key:        "target"
							capability: "target"
							required:   false
						},
					]
					params: [
						{
							key:     "focus_target"
							type:    "enum"
							default: "subject"
							enum:    #FocusTargetValues
						},
						{
							key:     "depth_of_field"
							type:    "enum"
							default: "medium"
							enum:    #DepthOfFieldValues
						},
						{
							key:     "rack"
							type:    "boolean"
							default: false
							tag_key: "rack_focus"
						},
						{
							// Lens focal length — an optics property of the same
							// camera.focus op (aperture/DoF already lives here).
							// Optional: existing focus variants inherit "normal".
							key:     "focal_length"
							type:    "enum"
							default: "normal"
							enum:    #FocalLengthValues
							tag_key: "focal_length"
						},
						{
							key:            "target_ref"
							type:           "ref"
							required:       false
							ref_capability: "target"
						},
					]
					default_args: {
						focus_target:   "subject"
						depth_of_field: "medium"
						rack:           false
						focal_length:   "normal"
					}
				}
				variants: [
					{
						key: "subject_shallow"
						op_args: {
							focus_target:   "subject"
							depth_of_field: "shallow"
							rack:           false
						}
					},
					{
						key: "subject_deep"
						op_args: {
							focus_target:   "subject"
							depth_of_field: "deep"
							rack:           false
						}
					},
					{
						key: "target_shallow"
						op_args: {
							focus_target:   "target"
							depth_of_field: "shallow"
							rack:           false
						}
					},
					{
						key: "target_deep"
						op_args: {
							focus_target:   "target"
							depth_of_field: "deep"
							rack:           false
						}
					},
					{
						key: "background_deep"
						op_args: {
							focus_target:   "background"
							depth_of_field: "deep"
							rack:           false
						}
					},
					{
						key: "rack_subject_to_target"
						op_args: {
							focus_target:   "target"
							depth_of_field: "shallow"
							rack:           true
						}
					},
					// Lens / focal-length variants (optics intent, folded into
					// the camera.focus op rather than a separate pack). Most tokens
					// are distinctive (telephoto/macro/fisheye/anamorphic). The
					// collision-prone "wide_angle" member is gated by the compound
					// primary-vs-flavor rule in primitive_projection.py: a bare
					// "wide" stays a wide SHOT (core_shot's job), while the
					// "wide angle" phrase / "wide-angle lens" credits this lens.
					{
						key: "wide_angle"
						op_args: {
							focus_target:   "subject"
							depth_of_field: "deep"
							rack:           false
							focal_length:   "wide_angle"
						}
						tags: focal_synonyms: ["wide-angle lens", "wide angle", "ultra-wide angle"]
					},
					{
						key: "telephoto"
						op_args: {
							focus_target:   "subject"
							depth_of_field: "shallow"
							rack:           false
							focal_length:   "telephoto"
						}
						tags: focal_synonyms: ["telephoto lens", "long lens", "compressed perspective", "tele lens"]
					},
					{
						key: "macro"
						op_args: {
							focus_target:   "subject"
							depth_of_field: "shallow"
							rack:           false
							focal_length:   "macro"
						}
						tags: focal_synonyms: ["macro lens", "macro photography", "extreme magnification", "tiny detail"]
					},
					{
						key: "fisheye"
						op_args: {
							focus_target:   "subject"
							depth_of_field: "deep"
							rack:           false
							focal_length:   "fisheye"
						}
						tags: focal_synonyms: ["fisheye lens", "fish-eye", "spherical distortion", "curved distortion"]
					},
					{
						key: "anamorphic"
						op_args: {
							focus_target:   "subject"
							depth_of_field: "shallow"
							rack:           false
							focal_length:   "anamorphic"
						}
						tags: focal_synonyms: ["anamorphic lens", "cinemascope", "horizontal lens flare", "oval bokeh"]
					},
				]
			}
		},
	]
}

tag_registry: #TagRegistryV1 & {
	focal_length: {
		label:          "Focal Length"
		description:    "Lens focal length / optical character: wide_angle, normal, telephoto, macro, fisheye, or anamorphic."
		allowed_values: #FocalLengthValues
		applies_to: [{role: "modifier", category: "camera"}]
		status: "active"
	}
}

manifest: #PromptPackManifestV1 & {
	id:          "core-focus"
	title:       "Core Focus"
	description: "Focus target, depth-of-field, and rack-focus primitives."
	category:    "camera"
	matrix_presets: [
		{
			label: "Focus Variants"
			query: {
				row_key:       "tag:modifier_family"
				col_key:       "tag:variant"
				package_name:  "core_focus"
				include_empty: true
			}
		},
		{
			label: "Focus Target by DoF"
			query: {
				row_key:       "tag:focus_target"
				col_key:       "tag:depth_of_field"
				package_name:  "core_focus"
				include_empty: true
			}
		},
	]
}

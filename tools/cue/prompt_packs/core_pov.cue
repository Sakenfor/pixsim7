package promptpacks

pack: #PromptBlockPackV1 & {
	version:      "1.0.0"
	package_name: "core_pov"
	defaults: {
		is_public: true
		source:    "system"
	}
	blocks: [
		{
			id: "pov"
			block_schema: {
				id_prefix: "core.camera.pov"
				category:  "camera"
				capabilities: ["camera.pov"]
				text_template: "POV token: {variant}."
				tags: {
					modifier_family:  "pov"
					modality_support: "both"
					temporal:         "neutral"
				}
				op: {
					op_id: "camera.pov.set"
					signature_id: "camera.pov.v1"
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
							key:     "perspective"
							type:    "enum"
							default: "first_person"
							enum:    #PerspectiveValues
						},
						{
							key:     "camera_height"
							type:    "enum"
							default: "eye_level"
							enum:    #CameraHeightValues
						},
						{
							key:            "target_ref"
							type:           "ref"
							required:       false
							ref_capability: "target"
						},
					]
					default_args: {
						perspective:   "first_person"
						camera_height: "eye_level"
					}
				}
				variants: [
					{
						key: "first_person_eye_level"
						tags: {
							pov_perspective: "first_person"
							pov_height:      "eye_level"
						}
						op_args: {
							perspective:   "first_person"
							camera_height: "eye_level"
						}
					},
					{
						key: "first_person_waist"
						tags: {
							pov_perspective: "first_person"
							pov_height:      "waist"
						}
						op_args: {
							perspective:   "first_person"
							camera_height: "waist"
						}
					},
					{
						key: "over_shoulder"
						tags: {
							pov_perspective: "over_shoulder"
							pov_height:      "chest"
						}
						op_args: {
							perspective:   "over_shoulder"
							camera_height: "chest"
						}
					},
					{
						key: "third_person_follow"
						tags: {
							pov_perspective: "third_person"
							pov_height:      "chest"
						}
						op_args: {
							perspective:   "third_person"
							camera_height: "chest"
						}
					},
					{
						key: "observer_top_down"
						tags: {
							pov_perspective: "top_down"
							pov_height:      "overhead"
						}
						op_args: {
							perspective:   "top_down"
							camera_height: "overhead"
						}
					},
				]
			}
		},
	]
}

manifest: #PromptPackManifestV1 & {
	id:          "core-pov"
	title:       "Core POV"
	description: "Point-of-view primitives for perspective and camera height."
	matrix_presets: [
		{
			label: "POV Variants"
			query: {
				row_key:       "tag:modifier_family"
				col_key:       "tag:variant"
				package_name:  "core_pov"
				include_empty: true
			}
		},
		{
			label: "Perspective by Height"
			query: {
				row_key:       "tag:pov_perspective"
				col_key:       "tag:pov_height"
				package_name:  "core_pov"
				include_empty: true
			}
		},
	]
}

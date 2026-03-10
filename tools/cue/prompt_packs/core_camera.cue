package promptpacks

pack: #PromptBlockPackV1 & {
	version:      "1.0.0"
	package_name: "core_camera"
	defaults: {
		is_public: true
		source:    "system"
	}
	blocks: [
		{
			id: "motion"
			block_schema: {
				id_prefix: "core.camera.motion"
				category:  "camera"
				capabilities: ["camera.motion"]
				op: {
					op_id_template: "camera.motion.{variant}"
					signature_id:   "camera.motion.v1"
					modalities: ["video"]
					refs: [
						{
							key:        "target"
							capability: "camera_target"
							required:   false
						},
					]
					params: [
						{
							key:     "speed"
							type:    "enum"
							enum:    #SpeedValues
							default: "normal"
						},
						{
							key:     "direction"
							type:    "enum"
							enum:    #DirectionValues
							default: "none"
						},
					]
					default_args: {
						speed:     "normal"
						direction: "none"
					}
				}
				text_template: "Camera motion token: {variant}."
				tags: {
					modifier_family: "camera_motion"
					temporal:        "dynamic"
				}
				variants: [
					{
						key: "zoom"
						op_modalities: ["video"]
						op_args: {
							direction: "in"
						}
						tags: {
							camera_motion:    "zoom"
							modality_support: "both"
							image_surface:    "zoomed-in framing"
							video_surface:    "camera zooms"
						}
					},
					{
						key: "pan"
						op_args: {
							direction: "left"
						}
						tags: {
							camera_motion:    "pan"
							modality_support: "video"
							image_surface:    "lateral framing emphasis"
							video_surface:    "camera pans"
						}
					},
					{
						key: "tilt"
						op_args: {
							direction: "up"
						}
						tags: {
							camera_motion:    "tilt"
							modality_support: "video"
							image_surface:    "vertical framing emphasis"
							video_surface:    "camera tilts"
						}
					},
					{
						key: "dolly"
						op_args: {
							direction: "forward"
						}
						tags: {
							camera_motion:    "dolly"
							modality_support: "video"
							image_surface:    "depth shift framing"
							video_surface:    "camera dollies"
						}
					},
					{
						key: "truck"
						op_args: {
							direction: "left"
						}
						tags: {
							camera_motion:    "truck"
							modality_support: "video"
							image_surface:    "lateral depth framing"
							video_surface:    "camera trucks"
						}
					},
					{
						key: "orbit"
						op_args: {
							direction: "around"
						}
						tags: {
							camera_motion:    "orbit"
							modality_support: "video"
							image_surface:    "circular composition emphasis"
							video_surface:    "camera orbits"
						}
					},
				]
			}
		},
	]
}

manifest: #PromptPackManifestV1 & {
	id:          "core-camera"
	title:       "Core Camera"
	description: "Canonical camera motion primitives. Direction is intentionally split into core_direction."
	matrix_presets: [
		{
			label: "Camera Motion Variants"
			query: {
				row_key:       "tag:modifier_family"
				col_key:       "tag:variant"
				package_name:  "core_camera"
				include_empty: true
			}
		},
		{
			label: "Camera Motion by Modality"
			query: {
				row_key:       "category"
				col_key:       "tag:variant"
				package_name:  "core_camera"
				tags:          "modality_support:video"
				include_empty: true
			}
		},
	]
}

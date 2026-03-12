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
							tag_key: "motion_speed"
						},
						{
							key:     "direction"
							type:    "enum"
							enum:    #DirectionValues
							default: "none"
							tag_key: "motion_direction"
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
						key: "zoom_out"
						op_modalities: ["video"]
						op_args: {
							direction: "out"
						}
						tags: {
							camera_motion:    "zoom"
							modality_support: "both"
							image_surface:    "zoomed-out framing"
							video_surface:    "camera zooms out"
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
						key: "pan_right"
						op_args: {
							direction: "right"
						}
						tags: {
							camera_motion:    "pan"
							modality_support: "video"
							image_surface:    "reverse lateral framing emphasis"
							video_surface:    "camera pans right"
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
						key: "tilt_down"
						op_args: {
							direction: "down"
						}
						tags: {
							camera_motion:    "tilt"
							modality_support: "video"
							image_surface:    "downward framing emphasis"
							video_surface:    "camera tilts down"
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
						key: "dolly_back"
						op_args: {
							direction: "backward"
						}
						tags: {
							camera_motion:    "dolly"
							modality_support: "video"
							image_surface:    "pull-back depth framing"
							video_surface:    "camera dollies backward"
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
						key: "truck_right"
						op_args: {
							direction: "right"
						}
						tags: {
							camera_motion:    "truck"
							modality_support: "video"
							image_surface:    "reverse lateral depth framing"
							video_surface:    "camera trucks right"
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
					{
						key: "orbit_left"
						op_args: {
							direction: "left"
						}
						tags: {
							camera_motion:    "orbit"
							modality_support: "video"
							image_surface:    "counterclockwise composition emphasis"
							video_surface:    "camera orbits left"
						}
					},
					{
						key: "orbit_right"
						op_args: {
							direction: "right"
						}
						tags: {
							camera_motion:    "orbit"
							modality_support: "video"
							image_surface:    "clockwise composition emphasis"
							video_surface:    "camera orbits right"
						}
					},
					{
						key: "pedestal_up"
						op_args: {
							direction: "up"
						}
						tags: {
							camera_motion:    "pedestal"
							modality_support: "video"
							image_surface:    "raised camera height framing"
							video_surface:    "camera rises vertically"
						}
					},
					{
						key: "pedestal_down"
						op_args: {
							direction: "down"
						}
						tags: {
							camera_motion:    "pedestal"
							modality_support: "video"
							image_surface:    "lowered camera height framing"
							video_surface:    "camera drops vertically"
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

package promptpacks

pack: #PromptBlockPackV1 & {
	version:      "1.0.0"
	package_name: "core_hands"
	defaults: {
		is_public: true
		source:    "system"
	}
	blocks: [
		{
			id: "hands"
			block_schema: {
				id_prefix: "core.subject.hands"
				category:  "character_pose"
				capabilities: ["subject.hands"]
				text_template: "Hands token: {variant}."
				tags: {
					modifier_family:  "hands"
					modality_support: "both"
					temporal:         "neutral"
				}
				op: {
					op_id: "subject.hands.set"
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
							key:     "visibility"
							type:    "enum"
							default: "visible"
							enum:    #VisibilityValues
							tag_key: "hands_visibility"
						},
						{
							key:     "gesture"
							type:    "enum"
							default: "neutral"
							enum:    #HandsGestureValues
							tag_key: "hands_gesture"
						},
						{
							key:            "target_ref"
							type:           "ref"
							required:       false
							ref_capability: "target"
						},
					]
					default_args: {
						visibility: "visible"
						gesture:    "neutral"
					}
				}
				variants: [
					{
						key: "hands_visible_neutral"
						op_args: {
							visibility: "visible"
							gesture:    "neutral"
						}
					},
					{
						key: "hands_hidden"
						op_args: {
							visibility: "hidden"
							gesture:    "neutral"
						}
					},
					{
						key: "hands_open"
						op_args: {
							visibility: "visible"
							gesture:    "open"
						}
					},
					{
						key: "hands_point"
						op_args: {
							visibility: "visible"
							gesture:    "point"
						}
					},
					{
						key: "hands_hold_object"
						op_args: {
							visibility: "visible"
							gesture:    "hold_object"
						}
					},
				]
			}
		},
	]
}

manifest: #PromptPackManifestV1 & {
	id:          "core-hands"
	title:       "Core Hands"
	description: "Hand visibility and gesture primitives."
	matrix_presets: [
		{
			label: "Hands Variants"
			query: {
				row_key:       "tag:modifier_family"
				col_key:       "tag:variant"
				package_name:  "core_hands"
				include_empty: true
			}
		},
		{
			label: "Gesture by Visibility"
			query: {
				row_key:       "tag:hands_gesture"
				col_key:       "tag:hands_visibility"
				package_name:  "core_hands"
				include_empty: true
			}
		},
	]
}

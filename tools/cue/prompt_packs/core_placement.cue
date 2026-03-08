package promptpacks

pack: #PromptBlockPackV1 & {
	version:      "1.0.0"
	package_name: "core_placement"
	defaults: {
		is_public: true
		source:    "system"
	}
	blocks: [
		{
			id: "anchor"
			block_schema: {
				id_prefix: "core.placement.anchor"
				category:  "location"
				capabilities: ["scene.anchor"]
				text_template: "Placement token: {variant}."
				tags: {
					modifier_family:  "placement"
					modality_support: "both"
					temporal:         "neutral"
				}
				op: {
					op_id: "scene.anchor.place"
					modalities: ["both"]
					refs: [
						{
							key:        "subject"
							capability: "subject"
							required:   false
						},
						{
							key:        "anchor"
							capability: "anchor"
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
							key:     "relation"
							type:    "enum"
							default: "near"
							enum:    #PlacementRelationValues
						},
						{
							key:     "distance"
							type:    "enum"
							default: "medium"
							enum:    #PlacementDistanceValues
						},
						{
							key:     "orientation"
							type:    "enum"
							default: "front"
							enum:    #PlacementOrientationValues
						},
						{
							key:            "anchor_ref"
							type:           "ref"
							required:       false
							ref_capability: "anchor"
						},
						{
							key:            "target_ref"
							type:           "ref"
							required:       false
							ref_capability: "target"
						},
					]
					default_args: {
						relation:    "near"
						distance:    "medium"
						orientation: "front"
					}
				}
				variants: [
					{
						key: "near"
						tags: {
							placement_relation: "near"
							placement_distance: "near"
						}
						op_args: {
							relation: "near"
							distance: "near"
						}
					},
					{
						key: "left_of"
						tags: {
							placement_relation: "left_of"
							placement_distance: "medium"
						}
						op_args: {
							relation: "left_of"
							distance: "medium"
						}
					},
					{
						key: "right_of"
						tags: {
							placement_relation: "right_of"
							placement_distance: "medium"
						}
						op_args: {
							relation: "right_of"
							distance: "medium"
						}
					},
					{
						key: "in_front_of"
						tags: {
							placement_relation: "in_front_of"
							placement_distance: "medium"
						}
						op_args: {
							relation: "in_front_of"
							distance: "medium"
						}
					},
					{
						key: "behind"
						tags: {
							placement_relation: "behind"
							placement_distance: "medium"
						}
						op_args: {
							relation: "behind"
							distance: "medium"
						}
					},
					{
						key: "above"
						tags: {
							placement_relation: "above"
							placement_distance: "far"
						}
						op_args: {
							relation: "above"
							distance: "far"
						}
					},
					{
						key: "below"
						tags: {
							placement_relation: "below"
							placement_distance: "far"
						}
						op_args: {
							relation: "below"
							distance: "far"
						}
					},
				]
			}
		},
	]
}

manifest: #PromptPackManifestV1 & {
	id:          "core-placement"
	title:       "Core Placement"
	description: "Anchor and relative placement primitives for scene layout."
	matrix_presets: [
		{
			label: "Placement Relations"
			query: {
				row_key:       "tag:modifier_family"
				col_key:       "tag:variant"
				package_name:  "core_placement"
				include_empty: true
			}
		},
		{
			label: "Placement by Relation"
			query: {
				row_key:       "tag:placement_relation"
				col_key:       "tag:placement_distance"
				package_name:  "core_placement"
				include_empty: true
			}
		},
	]
}

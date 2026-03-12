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
					placement_context_synonyms: [
						"positioned",
						"placed",
						"standing",
						"located",
						"sits",
						"sitting",
					]
				}
				op: {
					op_id: "scene.anchor.place"
					signature_id: "scene.anchor.v1"
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
							tag_key: "placement_relation"
						},
						{
							key:     "distance"
							type:    "enum"
							default: "medium"
							enum:    #PlacementDistanceValues
							tag_key: "placement_distance"
						},
						{
							key:     "orientation"
							type:    "enum"
							default: "front"
							enum:    #PlacementOrientationValues
							tag_key: "placement_orientation"
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
							placement_synonyms: [
								"nearby",
								"close",
								"close to",
								"next to",
								"beside",
							]
						}
						op_args: {
							relation: "near"
							distance: "near"
						}
					},
					{
						key: "left_of"
						tags: {
							placement_synonyms: [
								"left of",
								"to the left",
								"left side",
								"left side of frame",
							]
						}
						op_args: {
							relation: "left_of"
							distance: "medium"
						}
					},
					{
						key: "right_of"
						tags: {
							placement_synonyms: [
								"right of",
								"to the right",
								"right side",
								"right side of frame",
							]
						}
						op_args: {
							relation: "right_of"
							distance: "medium"
						}
					},
					{
						key: "in_front_of"
						tags: {
							placement_synonyms: [
								"in front of",
								"in front",
								"ahead of",
								"before",
							]
						}
						op_args: {
							relation: "in_front_of"
							distance: "medium"
						}
					},
					{
						key: "behind"
						tags: {
							placement_synonyms: [
								"behind",
								"in back of",
								"at the back",
								"rear of",
							]
						}
						op_args: {
							relation: "behind"
							distance: "medium"
						}
					},
					{
						key: "above"
						tags: {
							placement_synonyms: [
								"above",
								"over",
								"overhead",
								"higher than",
								"elevated",
							]
						}
						op_args: {
							relation: "above"
							distance: "far"
						}
					},
					{
						key: "below"
						tags: {
							placement_synonyms: [
								"below",
								"under",
								"beneath",
								"underneath",
								"lower than",
							]
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

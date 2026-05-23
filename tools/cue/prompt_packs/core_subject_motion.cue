package promptpacks

pack: #PromptBlockPackV1 & {
	version:      "1.0.0"
	package_name: "core_subject_motion"
	defaults: {
		is_public: true
		source:    "system"
	}
	blocks: [
		{
			id: "motion"
			block_schema: {
				id_prefix: "core.subject.motion"
				category:  "character_pose"
				capabilities: ["subject.move"]
				// Domain-signal gate for primitive projection (ported from
				// the former Python _SUBJECT_MOTION_SIGNAL_TOKENS set). Also
				// demotes competing direction.axis / scene.anchor primitives
				// when subject-motion language dominates — see
				// primitive_projection.py.
				projection_hints: {boost: 1.25}
				text_template: "Subject motion token: {variant}."
				tags: {
					modifier_family:  "subject_motion"
					modality_support: "video"
					temporal:         "dynamic"
					motion_context_synonyms: [
						"walk", "walking", "walked",
						"run", "runs", "running", "ran",
						"step", "steps", "stepped", "stepping",
						"turn", "turns", "turned", "turning",
						"drift", "drifts", "drifting",
						"crouch", "crouches", "crouching",
						"jog", "jogs", "jogging",
						"stride", "strides", "striding",
						"leap", "leaps", "leaping",
						"pace", "pacing",
						// Ballistic / vertical locomotion — these gate into the
						// dedicated `jump` gait + jump/vault variants below
						// rather than the walk/run gaits.
						"jump", "jumps", "jumping", "jumped",
						"hop", "hops", "hopping", "hopped",
						"vault", "vaults", "vaulting", "vaulted",
					]
				}
				op: {
					op_id: "subject.move.apply"
					signature_id: "subject.motion.v1"
					modalities: ["video"]
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
							key:     "direction"
							type:    "enum"
							default: "forward"
							enum:    #DirectionValuesNoNone
							tag_key: "motion_direction"
						},
						{
							key:     "speed"
							type:    "enum"
							default: "normal"
							enum:    #SpeedValues
							tag_key: "motion_speed"
						},
						{
							key:     "gait"
							type:    "enum"
							default: "walk"
							enum:    #GaitValues
							tag_key: "motion_gait"
						},
						{
							key:            "target_ref"
							type:           "ref"
							required:       false
							ref_capability: "target"
						},
					]
					default_args: {
						direction: "forward"
						speed:     "normal"
						gait:      "walk"
					}
				}
				// Variants comprehended from a (key, direction, speed, gait)
				// table — direction values come from the shared vocabulary's
				// enum (#DirectionValuesNoNone). Direction *synonyms* are
				// intentionally NOT projected onto motion variants: the eval
				// showed the extra cross-domain tokens (e.g. "back", "look down")
				// displace correct matches, and core_direction already carries
				// them. Ballistic locomotion uses the distinct `jump` gait.
				variants: [for _v in [
					{key: "move_forward", direction:  "forward", speed:  "normal", gait: "walk"},
					{key: "move_left", direction:     "left", speed:     "slow", gait: "step"},
					{key: "move_right", direction:    "right", speed:    "slow", gait: "step"},
					{key: "turn_around", direction:   "around", speed:   "normal", gait: "turn"},
					{key: "move_backward", direction: "backward", speed: "normal", gait: "walk"},
					{key: "move_in", direction:       "in", speed:       "slow", gait: "step"},
					{key: "move_out", direction:      "out", speed:      "slow", gait: "step"},
					{key: "run_forward", direction:   "forward", speed:  "fast", gait: "run"},
					{key: "drift_left", direction:    "left", speed:     "slow", gait: "drift"},
					{key: "drift_right", direction:   "right", speed:    "slow", gait: "drift"},
					{key: "turn_left", direction:     "left", speed:     "slow", gait: "turn"},
					{key: "turn_right", direction:    "right", speed:    "slow", gait: "turn"},
					{key: "jump", direction:          "up", speed:       "normal", gait: "jump"},
					{key: "jump_forward", direction:  "forward", speed:  "normal", gait: "jump"},
					{key: "vault", direction:         "forward", speed:  "fast", gait: "jump"},
				] {
					key: _v.key
					op_args: {
						direction: _v.direction
						speed:     _v.speed
						gait:      _v.gait
					}
				}]
			}
		},
	]
}

manifest: #PromptPackManifestV1 & {
	id:          "core-subject-motion"
	title:       "Core Subject Motion"
	description: "Subject movement and gaze-target primitives."
	category:    "subject"
	matrix_presets: [
		{
			label: "Subject Motion Variants"
			query: {
				row_key:       "tag:modifier_family"
				col_key:       "tag:variant"
				package_name:  "core_subject_motion"
				include_empty: true
			}
		},
		{
			label: "Motion by Speed"
			query: {
				row_key:       "tag:motion_direction"
				col_key:       "tag:motion_speed"
				package_name:  "core_subject_motion"
				include_empty: true
			}
		},
	]
}

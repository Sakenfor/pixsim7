package promptpacks

pack: #PromptBlockPackV1 & {
	version:      "1.0.0"
	package_name: "core_temporal"
	defaults: {
		is_public: true
		source:    "system"
	}
	blocks: [
		{
			id: "tempo"
			block_schema: {
				id_prefix: "core.camera.tempo"
				category:  "camera"
				capabilities: ["camera.tempo"]
				text_template: "Temporal token: {variant}."
				tags: {
					modifier_family:  "tempo"
					modality_support: "video"
					temporal:         "dynamic"
				}
				op: {
					op_id:        "camera.tempo.set"
					signature_id: "camera.tempo.v1"
					modalities: ["video"]
					refs: [
						{
							key:        "subject"
							capability: "subject"
							required:   false
						},
					]
					params: [
						{
							key:     "tempo"
							type:    "enum"
							default: "real_time"
							enum:    #TempoValues
							tag_key: "tempo"
						},
					]
					default_args: {
						tempo: "real_time"
					}
				}
				// Time-remap / playback-rate primitives (video only). Most tokens
				// are distinctive (time_lapse/speed_ramp/freeze_frame/bullet_time).
				// `real_time` stays the default enum value but has no variant (the
				// null effect). `slow_motion`'s generic "slow" token used to leak
				// via leaf + op-arg + keyword-rescue and out-score camera moves on
				// "slow dolly"; the compound primary-vs-flavor gate in
				// primitive_projection.py now requires the "slow motion" phrase (or
				// both leaf tokens), so a bare "slow" no longer credits it.
				variants: [
					{
						key: "slow_motion"
						op_args: tempo: "slow_motion"
						tags: tempo_synonyms: ["slow motion", "slow-mo", "slowmo"]
					},
					{
						key: "time_lapse"
						op_args: tempo: "time_lapse"
						tags: tempo_synonyms: ["timelapse", "time-lapse", "hyperlapse", "accelerated footage"]
					},
					{
						key: "speed_ramp"
						op_args: tempo: "speed_ramp"
						tags: tempo_synonyms: ["speed ramp", "ramping", "time ramp", "speed change"]
					},
					{
						key: "freeze_frame"
						op_args: tempo: "freeze_frame"
						tags: tempo_synonyms: ["freeze frame", "frozen moment", "frozen in time", "held frame"]
					},
					{
						key: "bullet_time"
						op_args: tempo: "bullet_time"
						tags: tempo_synonyms: ["bullet time", "matrix-style orbit", "frozen orbit", "time slice"]
					},
				]
			}
		},
	]
}

tag_registry: #TagRegistryV1 & {
	tempo: {
		label:          "Tempo"
		description:    "Temporal / playback-rate treatment: real_time, slow_motion, time_lapse, speed_ramp, freeze_frame, or bullet_time."
		allowed_values: #TempoValues
		applies_to: [{role: "modifier", category: "camera"}]
		status: "active"
	}
}

manifest: #PromptPackManifestV1 & {
	id:          "core-temporal"
	title:       "Core Temporal"
	description: "Time-remap / playback-rate primitives (slow motion, time-lapse, etc.)."
	category:    "camera"
	matrix_presets: [
		{
			label: "Tempo Variants"
			query: {
				row_key:       "tag:modifier_family"
				col_key:       "tag:variant"
				package_name:  "core_temporal"
				include_empty: true
			}
		},
		{
			label: "Tempo Tokens"
			query: {
				row_key:       "tag:tempo"
				col_key:       "category"
				package_name:  "core_temporal"
				include_empty: true
			}
		},
	]
}

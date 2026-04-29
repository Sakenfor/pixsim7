package promptpacks

// latin_body_pose — Latin phrase enhancers for held body positions.
//
// Distinct from latin_hip_motion (kinetic — the movement of hips).
// This pack covers static or held poses: lumbar arch, forward/backward
// lean, lateral weight shift (contrapposto), open chest, pelvic
// presentation, reclining.
//
// Composes with latin_hip_motion: hip_motion describes how the pose
// was reached; body_pose describes what is held.
//   MOTION = description < latin.hip.mechanics.pelvis_in_circulum_volvitur
//                        < latin.pose.body.arcus_corporis_invitat
//
// pose_type tag: arch / lean_forward / lean_back / lean_lateral /
//                open / present / recline / extend
// stance_quality tag: held / presented / settled / transitional

pack: #PromptBlockPackV1 & {
	version:      "1.0.0"
	package_name: "latin_body_pose"
	defaults: {
		is_public: true
		source:    "system"
	}
	blocks: [
		{
			id: "pose"
			block_schema: {
				id_prefix: "latin.pose.body"
				mode:      "surface"
				category:  "latin_enhancer"
				capabilities: ["latin.enhancer", "body.pose"]
				text_template: "Latin enhancer: {variant}."
				tags: {
					modifier_family:  "latin_enhancer"
					modality_support: "both"
					temporal:         "neutral"
					domain: ["pose", "position", "body"]
				}
				variants: [
					// ── technical — arch / lumbar ──────────────────────────────────
					{
						key:  "dorsum_arcuatur"
						text: "dorsum arcuatur"
						tags: {
							register:        "technical"
							pose_type:       "arch"
							body_region:     "back"
							stance_quality:  "held"
							latin_form:      "predication"
						}
					},
					{
						key:  "lumbus_in_curvum_flectitur"
						text: "lumbus in curvum flectitur"
						tags: {
							register:        "technical"
							pose_type:       "arch"
							body_region:     "spine"
							stance_quality:  "transitional"
							latin_form:      "predication"
						}
					},
					{
						key:  "columna_vertebralis_curvatur"
						text: "columna vertebralis curvatur"
						tags: {
							register:        "technical"
							pose_type:       "arch"
							body_region:     "spine"
							stance_quality:  "held"
							latin_form:      "predication"
						}
					},
					{
						key:  "curvatura_lumbi"
						text: "curvatura lumbi"
						tags: {
							register:        "technical"
							pose_type:       "arch"
							body_region:     "back"
							stance_quality:  "held"
							latin_form:      "noun_phrase"
						}
					},
					// ── technical — lean / tilt ────────────────────────────────────
					{
						key:  "corpus_proclinatur"
						text: "corpus proclinatur"
						tags: {
							register:        "technical"
							pose_type:       "lean_forward"
							body_region:     "full_body"
							stance_quality:  "transitional"
							latin_form:      "predication"
						}
					},
					{
						key:  "corpus_reclinatur"
						text: "corpus reclinatur"
						tags: {
							register:        "technical"
							pose_type:       "lean_back"
							body_region:     "full_body"
							stance_quality:  "transitional"
							latin_form:      "predication"
						}
					},
					{
						key:  "pondus_in_coxam_unam_transfertur"
						text: "pondus in coxam unam transfertur"
						tags: {
							register:        "technical"
							pose_type:       "lean_lateral"
							body_region:     "lateral"
							stance_quality:  "settled"
							latin_form:      "predication"
						}
					},
					{
						key:  "corpus_in_latus_inclinatur"
						text: "corpus in latus inclinatur"
						tags: {
							register:        "technical"
							pose_type:       "lean_lateral"
							body_region:     "full_body"
							stance_quality:  "transitional"
							latin_form:      "predication"
						}
					},
					// ── technical — open / present ─────────────────────────────────
					{
						key:  "pectus_aperitur"
						text: "pectus aperitur"
						tags: {
							register:        "technical"
							pose_type:       "open"
							body_region:     "chest"
							stance_quality:  "held"
							latin_form:      "predication"
						}
					},
					{
						key:  "pelvis_ante_protenditur"
						text: "pelvis ante protenditur"
						tags: {
							register:        "technical"
							pose_type:       "present"
							body_region:     "pelvis"
							stance_quality:  "held"
							latin_form:      "predication"
						}
					},
					{
						key:  "caput_retro_inclinatur"
						text: "caput retro inclinatur"
						tags: {
							register:        "technical"
							pose_type:       "lean_back"
							body_region:     "back"
							stance_quality:  "held"
							latin_form:      "predication"
						}
					},
					// ── poetic — invitation / offering ─────────────────────────────
					{
						key:  "corpus_se_offert"
						text: "corpus se offert"
						tags: {
							register:        "poetic"
							pose_type:       "present"
							body_region:     "full_body"
							stance_quality:  "presented"
							latin_form:      "predication"
						}
					},
					{
						key:  "arcus_corporis_invitat"
						text: "arcus corporis invitat"
						tags: {
							register:        "poetic"
							pose_type:       "arch"
							body_region:     "back"
							stance_quality:  "presented"
							latin_form:      "predication"
						}
					},
					{
						key:  "sinus_corporis_patet"
						text: "sinus corporis patet"
						tags: {
							register:        "poetic"
							pose_type:       "open"
							body_region:     "full_body"
							stance_quality:  "presented"
							latin_form:      "predication"
						}
					},
					{
						key:  "inclinatio_sine_verbis_loquitur"
						text: "inclinatio sine verbis loquitur"
						tags: {
							register:        "poetic"
							pose_type:       "lean_forward"
							body_region:     "full_body"
							stance_quality:  "presented"
							latin_form:      "predication"
						}
					},
					// ── poetic — form / gravity ────────────────────────────────────
					{
						key:  "corpus_in_voluptatem_flectitur"
						text: "corpus in voluptatem flectitur"
						tags: {
							register:        "poetic"
							pose_type:       "arch"
							body_region:     "full_body"
							stance_quality:  "transitional"
							latin_form:      "predication"
						}
					},
					{
						key:  "curvatura_quae_oculos_trahit"
						text: "curvatura quae oculos trahit"
						tags: {
							register:        "poetic"
							pose_type:       "arch"
							body_region:     "back"
							stance_quality:  "held"
							latin_form:      "predication"
						}
					},
					{
						key:  "corpus_gravitas_pulchra_format"
						text: "corpus gravitas pulchra format"
						tags: {
							register:        "poetic"
							pose_type:       "recline"
							body_region:     "full_body"
							stance_quality:  "settled"
							latin_form:      "predication"
						}
					},
					{
						key:  "positura_quae_verba_non_eget"
						text: "positura quae verba non eget"
						tags: {
							register:        "poetic"
							pose_type:       "present"
							body_region:     "full_body"
							stance_quality:  "presented"
							latin_form:      "predication"
						}
					},
					{
						key:  "forma_se_ipsam_docet"
						text: "forma se ipsam docet"
						tags: {
							register:        "poetic"
							pose_type:       "present"
							body_region:     "full_body"
							stance_quality:  "settled"
							latin_form:      "predication"
						}
					},
					{
						key:  "arcus_qui_non_vi_sed_arte_fit"
						text: "arcus qui non vi sed arte fit"
						tags: {
							register:        "poetic"
							pose_type:       "arch"
							body_region:     "spine"
							stance_quality:  "held"
							latin_form:      "predication"
						}
					},
				]
			}
		},
	]
}

manifest: #PromptPackManifestV1 & {
	id:          "latin-body-pose"
	title:       "Latin Body Pose"
	description: "Latin phrase enhancers for held body positions: lumbar arch, forward/back lean, lateral weight shift (contrapposto), open chest, pelvic presentation, reclining. Companion to latin_hip_motion — hip_motion describes the movement, body_pose describes the held result."
	matrix_presets: [
		{
			label: "Pose Type by Register"
			query: {
				row_key:       "tag:pose_type"
				col_key:       "tag:register"
				package_name:  "latin_body_pose"
				include_empty: true
			}
		},
		{
			label: "Stance Quality by Pose Type"
			query: {
				row_key:       "tag:stance_quality"
				col_key:       "tag:pose_type"
				package_name:  "latin_body_pose"
				include_empty: true
			}
		},
	]
}

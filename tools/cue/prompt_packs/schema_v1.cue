package promptpacks

import "list"

#Modality: "image" | "video" | "both"

#SimpleId:   =~"^[a-z][a-z0-9_]*$"
#DottedId:   =~"^[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*)+$"
#TemplateId: =~"^[a-z][a-z0-9_]*(\\.[a-z0-9_{}]+)+$" & =~".*\\{variant\\}.*"

#PackageName:  #SimpleId
#PackBlockId:  #SimpleId
#GroupId:      #SimpleId
#CapabilityId: #SimpleId | #DottedId
#IdPrefix:     #DottedId
#BlockId:      #DottedId
#OpId:         #DottedId
#OpIdTemplate: #TemplateId
#OpSignatureId: #DottedId
#BlockMode:    "surface" | "hybrid" | "op"
#TagValue:     string | [...string]

// Canonical shared enum values.
#SpeedValues: ["slow", "normal", "fast"]
// Canonical direction vocabulary — single source of truth for direction
// VALUES and their projection SYNONYMS, shared by every movement-capable
// domain (the standalone direction axis, subject motion, camera motion, …).
// Add a direction or tweak a synonym here once; every consumer inherits it.
// Consumers:
//   - core_direction: comprehends the whole list into its axis variants.
//   - core_subject_motion / core_camera: pull one entry's synonyms by value
//     via #DirectionSynonyms.<value> onto the matching variant.
#DirectionVocabularyList: [...{value: #SimpleId, synonyms: [...string]}] & [
	{value: "in", synonyms: ["inward", "inside", "into", "toward center", "closer"]},
	{value: "out", synonyms: ["outward", "outside", "away", "from center", "further"]},
	{value: "left", synonyms: ["leftward", "port", "left side", "to the left", "slide left"]},
	{value: "right", synonyms: ["rightward", "starboard", "right side", "to the right", "slide right"]},
	{value: "up", synonyms: ["upward", "rise", "ascend", "look up", "toward ceiling"]},
	{value: "down", synonyms: ["downward", "lower", "descend", "look down", "toward floor"]},
	{value: "forward", synonyms: ["ahead", "onward", "toward", "advance", "move forward"]},
	{value: "backward", synonyms: ["back", "reverse", "rearward", "retreat", "step back"]},
	{value: "around", synonyms: ["circle", "encircle", "around", "spin around", "rotate around"]},
]

// value → synonyms map, for consumers wiring one variant at a time.
#DirectionSynonyms: {
	for _e in #DirectionVocabularyList {
		"\(_e.value)": _e.synonyms
	}
}

// Ordered value lists derived from the vocabulary above.
#DirectionValuesNoNone: [for _e in #DirectionVocabularyList {_e.value}]
#DirectionValues: list.Concat([#DirectionValuesNoNone, ["none"]])
#ShotSizeValues: ["extreme_wide", "wide", "medium", "close_up", "extreme_close_up"]
#SubjectCountValues: ["single", "pair", "group"]
#FocusTargetValues: ["subject", "target", "background"]
#DepthOfFieldValues: ["shallow", "medium", "deep"]
#VerticalAngleValues: ["high", "eye", "low", "bird", "worm"]
#RollValues: ["level", "dutch_left", "dutch_right"]
#PerspectiveValues: ["first_person", "over_shoulder", "third_person", "observer", "top_down"]
#CameraHeightValues: ["ground", "waist", "chest", "eye_level", "overhead"]
#VisibilityValues: ["visible", "hidden"]
#TimeOfDayValues: ["dawn", "morning", "midday", "golden_hour", "dusk", "night", "blue_hour"]
#WeatherValues: ["sunny", "overcast", "rain", "snow", "fog", "storm", "wind"]
#CompositionValues: ["centered", "rule_of_thirds", "symmetrical", "off_center", "leading_lines", "negative_space"]
#HandsGestureValues: ["neutral", "open", "fist", "point", "reach", "hold_object"]
#LevelValues: ["low", "medium", "high"]
#PoseValues: ["standing", "seated", "kneeling", "leaning", "crouching", "lying"]
#PoseHandsValues: ["neutral", "at_sides", "behind_back", "on_hips", "in_pockets", "holding_object"]
#GazeValues: ["forward", "down", "up", "left", "right", "at_target", "away"]
#LightKeyValues: ["diffuse", "soft", "hard", "rim", "backlit"]
#LightTemperatureValues: ["warm", "neutral", "cool", "mixed"]
#PlacementRelationValues: ["near", "left_of", "right_of", "in_front_of", "behind", "above", "below"]
#PlacementDistanceValues: ["contact", "near", "medium", "far"]
#PlacementOrientationValues: ["front", "profile_left", "profile_right", "back"]
#LookFocusValues: ["eyes", "head", "away", "body"]
#ExpressionValues: ["neutral", "happy", "sad", "angry", "fearful", "surprised", "disgusted", "pained"]
#GaitValues: ["step", "walk", "run", "drift", "turn", "jump"]
#ActionVerbValues: ["reach", "grasp", "pull", "push", "lift", "lower", "strike", "embrace", "release", "gesture", "react", "turn_to"]
#TargetInvolvementValues: ["none", "indirect", "direct"]
#BodyRegionValues:   ["arms", "upper_body", "full_body", "hands", "head"]
#MannerQualityValues: ["gentle", "tender", "firm", "sharp", "fluid", "hesitant", "deliberate", "languid", "urgent", "playful", "cautious", "abrupt", "neutral"]
#MannerDelayValues:   ["none", "brief", "moderate", "long"]
#OrganClassValues:        ["insertive", "receptive", "neutral", "cloacal", "none"]
#OrganStateValues:        ["flaccid", "slightly_erect", "fully_erect", "receptive", "post_use", "neutral"]
#OrganVisibilityValues:   ["visible", "clothed", "obscured", "implied"]
#OrganPresentationValues: ["forward", "dropped", "sheathed", "tucked", "exposed", "concealed"]
#OrganSizeValues:         ["small", "medium", "large", "very_large", "unspecified"]
#OrganSurfaceValues:      ["smooth", "wrinkled", "textured", "ridged", "glossy", "matte", "natural"]

#SubjectActionParams: [
	{
		key:     "action_verb"
		type:    "enum"
		enum:    #ActionVerbValues
		default: "gesture"
		tag_key: "action_verb"
	},
	{
		key:     "target_involvement"
		type:    "enum"
		enum:    #TargetInvolvementValues
		default: "none"
		tag_key: "target_involvement"
	},
	{
		key:     "body_region"
		type:    "enum"
		enum:    #BodyRegionValues
		default: "upper_body"
		tag_key: "body_region"
	},
]

#RefSpec: {
	key:          #SimpleId
	capability:   #CapabilityId
	required?:    *false | bool
	many?:        *false | bool
	description?: string
	[string]:     _
}

#OpParamBase: {
	key:          #SimpleId
	required?:    *false | bool
	description?: string
	tag_key?:     #SimpleId
	[string]:     _
}

#StringOpParam: #OpParamBase & {
	type:     "string"
	default?: string
}

#NumberOpParam: #OpParamBase & {
	type:     "number"
	default?: number
	minimum?: number
	maximum?: number
}

#IntegerOpParam: #OpParamBase & {
	type:     "integer"
	default?: int
	minimum?: int
	maximum?: int
}

#BooleanOpParam: #OpParamBase & {
	type:     "boolean"
	default?: bool
}

#EnumOpParam: #OpParamBase & {
	type: "enum"
	enum: [string, ...string]
	default?: string
}

#RefOpParam: #OpParamBase & {
	type:           "ref"
	ref_capability: #CapabilityId
	default?:       string
}

#OpParam: #StringOpParam | #NumberOpParam | #IntegerOpParam | #BooleanOpParam | #EnumOpParam | #RefOpParam

#DescriptorOverlay: {
	[string]: _
}

#OpTemplate: {
	// Loader enforces exactly one of these.
	op_id?:          #OpId
	op_id_template?: #OpIdTemplate
	signature_id?:   #OpSignatureId
	modalities?: [...#Modality]
	refs?: [...#RefSpec]
	params?: [...#OpParam]
	default_args?: {
		[string]: _
	}
	[string]: _
}

#Variant: {
	key:       #SimpleId
	block_id?: #BlockId
	text?:     string
	tags?: {
		[string]: #TagValue
	}
	op_id?: #OpId
	op_modalities?: [...#Modality]
	op_args?: {
		[string]: _
	}
	ref_bindings?: {
		[string]: string
	}
	descriptors?: #DescriptorOverlay
	[string]: _
}

// Param-aware prose synthesis. The compiler bakes each variant's `.text`
// from `template` (a str.format string over param names + {variant}) and
// `word_tables` (per-param value→fragment maps; map a value to "" to elide
// it, e.g. default values, so prose stays natural). Single source of truth:
// the same enum space the op declares drives the prose — no second table.
#TextSynthesis: {
	template: string
	word_tables?: {
		[string]: {
			[string]: string
		}
	}
}

// Primitive-projection gate hints. The shadow-mode projection engine
// (services/prompt/parser/primitive_projection.py) derives its domain-signal
// gate from declared `*_context_synonyms` tags; `boost` is the per-domain
// score multiplier applied when a candidate's tokens overlap those synonyms.
// This is the single source of truth for the multiplier — there is no Python
// constant. `boost` only; the token list lives in the `*_context_synonyms`
// tag, never here.
#ProjectionHints: {
	boost?:   number
	[string]: _
}

#BlockSchema: {
	id_prefix: #IdPrefix
	mode?:    *"surface" | #BlockMode
	category?: #SimpleId
	role?:     #SimpleId
	capabilities?: [...#CapabilityId]
	text_template?: string
	text_synthesis?: #TextSynthesis
	descriptors?: #DescriptorOverlay
	projection_hints?: #ProjectionHints
	tags?: {
		[string]: #TagValue
	}
	op?: #OpTemplate
	variants: [...#Variant]
	[string]: _
}

#PackBlock: {
	id:     #PackBlockId
	group?: #GroupId
	defaults?: {
		[string]: _
	}
	block_schema: #BlockSchema
	[string]:     _
}

// ── Tag registry ──────────────────────────────────────────────────────────
// Packs that introduce ad-hoc tag keys (used in variant `tags:` blocks)
// declare them here so cue:gen can emit a vocabulary YAML the backend's
// vocab loader picks up. Avoids the previous footgun where a pack used
// `tag:foo` in its matrix preset but `foo` wasn't registered, 500-ing the
// manifests endpoint.
//
// Two packs declaring the SAME key with IDENTICAL metadata is allowed
// (deduped at codegen). Conflicting metadata is a hard error.

#TagApplicability: {
	role:      string
	category?: string
	[string]:  _
}

#TagRegistryEntry: {
	label:           string
	description:     string
	data_type:       *"string" | "number" | "boolean"
	allowed_values?: [...string]
	aliases?:        *[] | [...string]
	value_aliases?:  *{} | {[string]: string}
	applies_to?:     [...#TagApplicability]
	status?:         *"active" | "experimental" | "deprecated"
}

#TagRegistryV1: {
	[#SimpleId]: #TagRegistryEntry
}

#PromptBlockPackV1: {
	version:      *"1.0.0" | string
	package_name: #PackageName
	defaults?: {
		is_public?: bool
		source?:    string
		[string]:   _
	}
	groups?: [...{
		id:       #GroupId
		title?:   string
		[string]: _
	}]
	blocks: [...#PackBlock]
}

#MatrixPresetQuery: {
	row_key:  string
	col_key:  string
	[string]: _
}

#MatrixPreset: {
	label:    string
	query:    #MatrixPresetQuery
	[string]: _
}

#PromptPackManifestV1: {
	id:           string
	title?:       string
	description?: string
	// Optional pack-level grouping bucket (e.g. "camera", "color", "anatomy").
	// Surfaced via /meta/content-packs/inventory; UI groups packs by it.
	// Free-form for now; lint-checked against block categories at parse time.
	category?: string
	matrix_presets: [...#MatrixPreset]
	[string]: _
}

package promptpacks

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
#BlockMode:    "surface" | "hybrid" | "op"

// Canonical shared enum values.
#SpeedValues: ["slow", "normal", "fast"]
#DirectionValuesNoNone: ["in", "out", "left", "right", "up", "down", "forward", "backward", "around"]
#DirectionValues: ["in", "out", "left", "right", "up", "down", "forward", "backward", "around", "none"]
#ShotSizeValues: ["extreme_wide", "wide", "medium", "close_up", "extreme_close_up"]
#SubjectCountValues: ["single", "pair", "group"]
#FocusTargetValues: ["subject", "target", "background"]
#DepthOfFieldValues: ["shallow", "medium", "deep"]
#VerticalAngleValues: ["high", "eye", "low", "bird", "worm"]
#RollValues: ["level", "dutch_left", "dutch_right"]
#PerspectiveValues: ["first_person", "over_shoulder", "third_person", "observer", "top_down"]
#CameraHeightValues: ["ground", "waist", "chest", "eye_level", "overhead"]
#VisibilityValues: ["visible", "hidden"]
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
#LookFocusValues: ["eyes", "head", "body"]
#GaitValues: ["step", "walk", "run", "drift", "turn"]

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

#OpTemplate: {
	// Loader enforces exactly one of these.
	op_id?:          #OpId
	op_id_template?: #OpIdTemplate
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
		[string]: string
	}
	op_id?: #OpId
	op_modalities?: [...#Modality]
	op_args?: {
		[string]: _
	}
	ref_bindings?: {
		[string]: string
	}
	[string]: _
}

#BlockSchema: {
	id_prefix: #IdPrefix
	mode?:    *"surface" | #BlockMode
	category?: #SimpleId
	role?:     #SimpleId
	capabilities?: [...#CapabilityId]
	text_template?: string
	tags?: {
		[string]: string
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
	matrix_presets: [...#MatrixPreset]
	[string]: _
}

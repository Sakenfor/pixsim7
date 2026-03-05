package promptpacks

#Modality: "image" | "video" | "both"

#RefSpec: {
    key:        string
    capability: string
    required?: *false | bool
    many?:     *false | bool
    description?: string
    [string]: _
}

#OpParamType: "string" | "number" | "integer" | "boolean" | "enum" | "ref"

#OpParam: {
    key:         string
    type:        #OpParamType
    required?:  *false | bool
    description?: string
    default?:    _
    enum?:       [...string]
    minimum?:    number
    maximum?:    number
    ref_capability?: string
    [string]: _
}

#OpTemplate: {
    // Loader enforces exactly one of these.
    op_id?:          string
    op_id_template?: string
    modalities?:     [...#Modality]
    refs?:           [...#RefSpec]
    params?:         [...#OpParam]
    default_args?: {
        [string]: _
    }
    [string]: _
}

#Variant: {
    key:      string
    block_id?: string
    text?:     string
    tags?: {
        [string]: string
    }
    op_id?:         string
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
    id_prefix: string
    category?: string
    role?: string
    capabilities?: [...string]
    text_template?: string
    tags?: {
        [string]: string
    }
    op?: #OpTemplate
    variants: [...#Variant]
    [string]: _
}

#PromptBlockPackV1: {
    version: *"1.0.0" | string
    package_name: string
    defaults?: {
        is_public?: bool
        source?: string
        [string]: _
    }
    block_schema: #BlockSchema
}

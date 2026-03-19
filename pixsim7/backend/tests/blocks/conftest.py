TEST_SUITE = {
    "id": "block-primitives",
    "label": "Block Primitives Tests",
    "kind": "unit",
    "category": "backend/blocks",
    "subcategory": "primitives",
    "covers": [
        "pixsim7/backend/main/services/prompt/block",
        "pixsim7/backend/main/services/prompt/parser/primitive_projection.py",
        "pixsim7/backend/main/services/prompt/parser/dsl_adapter.py",
        "pixsim7/backend/main/services/prompt/block/evaluator",
        "pixsim7/backend/main/services/prompt/block/block_primitive_query.py",
        "pixsim7/backend/main/services/prompt/block/composition_role_inference.py",
        "pixsim7/backend/main/shared/ontology/vocabularies/registry.py",
    ],
    "order": 25,
}

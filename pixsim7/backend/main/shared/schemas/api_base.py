from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel as _to_camel


def to_api_alias(field_name: str) -> str:
    alias = _to_camel(field_name)
    return alias.rstrip("_")


class ApiModel(BaseModel):
    """API boundary model: snake_case in Python, camelCase in JSON."""

    model_config = ConfigDict(
        populate_by_name=True,
        serialize_by_alias=True,
        alias_generator=to_api_alias,
    )

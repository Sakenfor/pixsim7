"""
Dev Docs API

Provides indexed documentation with front-matter, AST, and link graph data.
"""
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from pixsim7.backend.main.api.dependencies import get_current_user_optional
from pixsim7.backend.main.domain.user import User
from pixsim7.backend.main.services.docs.indexer import get_docs_index, search_docs

router = APIRouter(prefix="/dev/docs", tags=["dev", "docs"])


class DocsIndexResponse(BaseModel):
    """Indexed docs metadata."""
    version: str
    generatedAt: Optional[str] = None
    entries: List[Dict[str, Any]] = Field(default_factory=list)


class DocPageResponse(BaseModel):
    """Single docs page payload."""
    path: str
    title: str
    summary: Optional[str] = None
    frontMatter: Dict[str, Any] = Field(default_factory=dict)
    visibility: Optional[str] = None
    ast: Any = Field(default_factory=dict)
    links: List[Any] = Field(default_factory=list)
    backlinks: List[Any] = Field(default_factory=list)
    markdown: Optional[str] = None


class DocsSearchResponse(BaseModel):
    """Search response for docs index."""
    query: str
    results: List[Dict[str, Any]] = Field(default_factory=list)


def can_view_doc(visibility: Optional[str], user: Optional[User]) -> bool:
    if visibility == "admin":
        return bool(user and user.is_admin())
    return True


@router.get("/index", response_model=DocsIndexResponse)
async def get_docs_index_endpoint(
    refresh: bool = Query(False),
    user: Optional[User] = Depends(get_current_user_optional),
):
    index = get_docs_index(refresh=refresh)
    entries = [
        entry
        for entry in index.get("entries", [])
        if can_view_doc(entry.get("visibility"), user)
    ]

    return {
        "version": index.get("version", "1.0.0"),
        "generatedAt": index.get("generated_at"),
        "entries": entries,
    }


@router.get("/page", response_model=DocPageResponse)
async def get_doc_page(
    path: str = Query(...),
    include_markdown: bool = Query(False),
    refresh: bool = Query(False),
    user: Optional[User] = Depends(get_current_user_optional),
):
    index = get_docs_index(refresh=refresh)
    pages = index.get("pages", {})
    page = pages.get(path)

    if not page:
        raise HTTPException(status_code=404, detail=f"Doc not found: {path}")

    if not can_view_doc(page.visibility, user):
        raise HTTPException(status_code=403, detail="Not authorized")

    payload = {
        "path": page.path,
        "title": page.title,
        "summary": page.summary,
        "frontMatter": page.front_matter,
        "visibility": page.visibility,
        "ast": page.ast,
        "links": page.links,
        "backlinks": page.backlinks,
    }

    if include_markdown:
        payload["markdown"] = page.markdown

    return payload


@router.get("/search", response_model=DocsSearchResponse)
async def search_docs_endpoint(
    q: str = Query(..., min_length=1),
    limit: int = Query(50, ge=1, le=200),
    refresh: bool = Query(False),
    user: Optional[User] = Depends(get_current_user_optional),
):
    index = get_docs_index(refresh=refresh)
    results = search_docs(index, q, limit=limit)
    results = [
        entry
        for entry in results
        if can_view_doc(entry.get("visibility"), user)
    ]

    return {
        "query": q,
        "results": results,
    }

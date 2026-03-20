"""
Documents API — generic structured content.

CRUD for documents (audits, decisions, guides, runbooks, notes).
Uses the Document base entity, separate from plans.
"""
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.dependencies import get_current_user, get_database
from pixsim7.backend.main.services.crud.primitives import DeleteResponse
from pixsim7.backend.main.domain.docs.models import Document, DocumentEvent, DocumentShare
from pixsim7.backend.main.domain.user import User
from pixsim7.backend.main.shared.datetime_utils import utcnow

router = APIRouter(prefix="/documents", tags=["documents"])


# ── Models ───────────────────────────────────────────────────────


class DocumentCreateRequest(BaseModel):
    id: Optional[str] = Field(None, max_length=120, description="Optional ID (auto-generated if omitted)")
    doc_type: str = Field("doc", description="doc | audit | decision | guide | runbook | note")
    title: str = Field(..., min_length=1, max_length=255)
    status: str = Field("draft", description="draft | active | archived")
    summary: Optional[str] = None
    markdown: Optional[str] = None
    visibility: str = Field("private", description="private | shared | public")
    namespace: Optional[str] = Field(None, max_length=255, description="Optional taxonomy namespace")
    tags: Optional[List[str]] = None
    extra: Optional[Dict[str, Any]] = None


class DocumentResponse(BaseModel):
    id: str
    doc_type: str
    title: str
    status: str
    owner: str
    summary: Optional[str] = None
    markdown: Optional[str] = None
    user_id: Optional[int] = None
    visibility: str
    namespace: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    extra: Optional[Dict[str, Any]] = None
    revision: int
    created_at: str
    updated_at: str


class DocumentListResponse(BaseModel):
    documents: List[DocumentResponse]
    total: int


class DocumentUpdateRequest(BaseModel):
    title: Optional[str] = Field(None, max_length=255)
    status: Optional[str] = None
    summary: Optional[str] = None
    markdown: Optional[str] = None
    visibility: Optional[str] = None
    namespace: Optional[str] = Field(None, max_length=255)
    tags: Optional[List[str]] = None
    extra: Optional[Dict[str, Any]] = None


# ── Helpers ──────────────────────────────────────────────────────


def _to_response(doc: Document) -> dict:
    return {
        "id": doc.id,
        "doc_type": doc.doc_type,
        "title": doc.title,
        "status": doc.status,
        "owner": doc.owner,
        "summary": doc.summary,
        "markdown": doc.markdown,
        "user_id": doc.user_id,
        "visibility": doc.visibility,
        "namespace": doc.namespace,
        "tags": doc.tags or [],
        "extra": doc.extra,
        "revision": doc.revision,
        "created_at": doc.created_at.isoformat() if doc.created_at else "",
        "updated_at": doc.updated_at.isoformat() if doc.updated_at else "",
    }


def _can_access(doc: Document, user: User, shares: list | None = None) -> bool:
    if doc.visibility == "public":
        return True
    if doc.user_id == user.id:
        return True
    if doc.visibility == "shared":
        return True
    if shares:
        return any(s.user_id == user.id for s in shares)
    return False


# ── Endpoints ────────────────────────────────────────────────────


@router.post("", response_model=DocumentResponse)
async def create_document(
    payload: DocumentCreateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_database),
):
    """Create a new document."""
    import uuid as _uuid

    doc_id = payload.id or f"{payload.doc_type}-{_uuid.uuid4().hex[:8]}"

    existing = await db.get(Document, doc_id)
    if existing:
        raise HTTPException(status_code=409, detail=f"Document already exists: {doc_id}")

    now = utcnow()
    doc = Document(
        id=doc_id,
        doc_type=payload.doc_type,
        title=payload.title,
        status=payload.status,
        owner=f"user:{user.id}",
        summary=payload.summary,
        markdown=payload.markdown,
        user_id=user.id,
        visibility=payload.visibility,
        namespace=payload.namespace,
        tags=payload.tags or [],
        extra=payload.extra,
        revision=1,
        created_at=now,
        updated_at=now,
    )
    db.add(doc)

    db.add(DocumentEvent(
        document_id=doc_id,
        event_type="created",
        actor=f"user:{user.id}",
        timestamp=now,
    ))

    await db.commit()
    return _to_response(doc)


@router.get("", response_model=DocumentListResponse)
async def list_documents(
    doc_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    namespace: Optional[str] = Query(None, description="Filter by namespace"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_database),
):
    """List documents visible to the current user."""
    stmt = select(Document).order_by(Document.updated_at.desc())

    if doc_type:
        stmt = stmt.where(Document.doc_type == doc_type)
    if status:
        stmt = stmt.where(Document.status == status)
    if namespace:
        stmt = stmt.where(Document.namespace == namespace)

    rows = (await db.execute(stmt)).scalars().all()

    # Filter by visibility
    visible = [r for r in rows if _can_access(r, user)]

    return DocumentListResponse(
        documents=[_to_response(r) for r in visible],
        total=len(visible),
    )


@router.get("/{doc_id}", response_model=DocumentResponse)
async def get_document(
    doc_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_database),
):
    """Get a document by ID."""
    doc = await db.get(Document, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail=f"Document not found: {doc_id}")
    if not _can_access(doc, user):
        raise HTTPException(status_code=403, detail="Access denied")
    return _to_response(doc)


@router.patch("/{doc_id}", response_model=DocumentResponse)
async def update_document(
    doc_id: str,
    payload: DocumentUpdateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_database),
):
    """Update a document."""
    doc = await db.get(Document, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail=f"Document not found: {doc_id}")
    if doc.user_id != user.id and doc.visibility == "private":
        raise HTTPException(status_code=403, detail="Access denied")

    now = utcnow()
    updates = {k: v for k, v in payload.dict().items() if v is not None}

    for field, value in updates.items():
        old = getattr(doc, field, None)
        if field == "markdown":
            doc.markdown = value
            db.add(DocumentEvent(
                document_id=doc_id, event_type="content_updated",
                field="markdown", actor=f"user:{user.id}", timestamp=now,
            ))
        elif str(old) != str(value):
            setattr(doc, field, value)
            db.add(DocumentEvent(
                document_id=doc_id, event_type="field_changed",
                field=field, old_value=str(old), new_value=str(value),
                actor=f"user:{user.id}", timestamp=now,
            ))

    doc.updated_at = now
    doc.revision = (doc.revision or 0) + 1
    await db.commit()

    return _to_response(doc)


@router.delete("/{doc_id}", response_model=DeleteResponse)
async def delete_document(
    doc_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_database),
):
    """Delete a document."""
    doc = await db.get(Document, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail=f"Document not found: {doc_id}")
    if doc.user_id != user.id:
        raise HTTPException(status_code=403, detail="Only the owner can delete")

    await db.delete(doc)
    await db.commit()
    return DeleteResponse(success=True, message=f"Document '{doc_id}' deleted.")

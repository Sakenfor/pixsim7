"""
Provider account grant endpoints — targeted, capped slot sharing as rules.

A share rule is ``(provider, model?, slots)`` shared with one recipient,
optionally pinned to a single account. Rules stack. This complements the
all-or-nothing ``is_private=False`` public share handled in accounts.py.

Routes (mounted under /api/v1 by routes/accounts/manifest.py):
- POST   /accounts/grants                 create/update a rule (owner only)
- GET    /accounts/grants/issued          rules the current user created
- GET    /accounts/grants/received        rules shared with the current user
- GET    /accounts/{account_id}/grants    rules touching one account (owner only)
- DELETE /accounts/grants/{grant_id}      revoke a rule (owner only)
"""
import logging
from sqlalchemy import select
from fastapi import APIRouter, HTTPException, status

from pixsim7.backend.main.api.dependencies import CurrentUser, AccountSvc, DatabaseSession
from pixsim7.backend.main.domain.user import User
from pixsim7.backend.main.domain.grants import ResourceGrant
from pixsim7.backend.main.shared.schemas.account_schemas import GrantCreate, GrantResponse
from pixsim7.backend.main.shared.errors import ResourceNotFoundError

router = APIRouter()
logger = logging.getLogger(__name__)


def _grant_to_response(
    grant: ResourceGrant,
    recipient_username: str | None = None,
) -> GrantResponse:
    """Project a provider-slots ResourceGrant into the slot-shaped response."""
    scope = grant.scope or {}
    account_id = scope.get("account_id")
    return GrantResponse(
        id=grant.id,
        owner_user_id=grant.owner_user_id,
        recipient_user_id=grant.recipient_user_id,
        recipient_username=recipient_username,
        provider_id=scope.get("provider_id", ""),
        model=scope.get("model"),
        account_id=int(account_id) if account_id is not None else None,
        slot_limit=grant.cap if grant.cap is not None else 0,
        note=grant.note,
        created_at=grant.created_at,
        updated_at=grant.updated_at,
    )


async def _usernames_for(db, user_ids: list[int]) -> dict[int, str]:
    ids = [uid for uid in set(user_ids) if uid is not None]
    if not ids:
        return {}
    result = await db.execute(
        select(User.id, User.username).where(User.id.in_(ids))
    )
    return {uid: uname for uid, uname in result.all()}


@router.post("/accounts/grants", response_model=GrantResponse, status_code=status.HTTP_201_CREATED)
async def create_grant(
    request: GrantCreate,
    user: CurrentUser,
    account_service: AccountSvc,
    db: DatabaseSession,
):
    """Create or update a share rule (owner only)."""
    recipient_id = request.recipient_user_id
    if recipient_id is None and request.recipient_username:
        result = await db.execute(
            select(User).where(User.username == request.recipient_username)
        )
        recipient = result.scalar_one_or_none()
        if recipient is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Recipient user not found")
        recipient_id = recipient.id
    if recipient_id is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "recipient_user_id or recipient_username is required",
        )

    try:
        grant = await account_service.create_or_update_grant(
            owner_user_id=user.id,
            recipient_user_id=recipient_id,
            provider_id=request.provider_id,
            model=request.model,
            account_id=request.account_id,
            slot_limit=request.slot_limit,
            note=request.note,
        )
        await db.commit()
        await db.refresh(grant)
    except ResourceNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Account not found")
    except ValueError as e:
        msg = str(e)
        if "Not your account" in msg:
            raise HTTPException(status.HTTP_403_FORBIDDEN, msg)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, msg)

    usernames = await _usernames_for(db, [grant.recipient_user_id])
    return _grant_to_response(grant, usernames.get(grant.recipient_user_id))


@router.get("/accounts/grants/issued", response_model=list[GrantResponse])
async def list_issued_grants(
    user: CurrentUser,
    account_service: AccountSvc,
    db: DatabaseSession,
):
    """List share rules the current user has created."""
    grants = await account_service.list_grants_issued(user.id)
    usernames = await _usernames_for(db, [g.recipient_user_id for g in grants])
    return [_grant_to_response(g, usernames.get(g.recipient_user_id)) for g in grants]


@router.get("/accounts/grants/received", response_model=list[GrantResponse])
async def list_received_grants(
    user: CurrentUser,
    account_service: AccountSvc,
    db: DatabaseSession,
):
    """List share rules shared with the current user."""
    grants = await account_service.list_grants_received(user.id)
    usernames = await _usernames_for(db, [g.recipient_user_id for g in grants])
    return [_grant_to_response(g, usernames.get(g.recipient_user_id)) for g in grants]


@router.get("/accounts/{account_id}/grants", response_model=list[GrantResponse])
async def list_account_grants(
    account_id: int,
    user: CurrentUser,
    account_service: AccountSvc,
    db: DatabaseSession,
):
    """List active rules touching an account (owner only)."""
    try:
        grants = await account_service.list_grants_for_account(account_id, user.id)
    except ResourceNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Account not found")
    except ValueError as e:
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(e))

    usernames = await _usernames_for(db, [g.recipient_user_id for g in grants])
    return [_grant_to_response(g, usernames.get(g.recipient_user_id)) for g in grants]


@router.delete("/accounts/grants/{grant_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_grant(
    grant_id: int,
    user: CurrentUser,
    account_service: AccountSvc,
    db: DatabaseSession,
):
    """Revoke a rule (owner only)."""
    try:
        await account_service.revoke_grant(grant_id, user.id)
        await db.commit()
    except ResourceNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Grant not found")
    except ValueError as e:
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(e))

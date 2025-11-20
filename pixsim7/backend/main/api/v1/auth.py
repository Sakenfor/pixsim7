"""
Authentication API endpoints
"""
from fastapi import APIRouter, HTTPException, Request
from pixsim7.backend.main.api.dependencies import AuthSvc, UserSvc, CurrentUser
from pixsim7.backend.main.shared.schemas.auth_schemas import (
    RegisterRequest,
    LoginRequest,
    LoginResponse,
    UserResponse,
    SessionResponse,
)
from pixsim7.backend.main.shared.errors import (
    AuthenticationError,
    ValidationError as DomainValidationError,
    ResourceNotFoundError,
)
from pixsim7.backend.main.shared.rate_limit import login_limiter, get_client_identifier


router = APIRouter()


# ===== REGISTER =====

@router.post("/auth/register", response_model=LoginResponse, status_code=201)
async def register(
    request: RegisterRequest,
    req: Request,
    auth_service: AuthSvc,
    user_service: UserSvc
):
    """
    Register new user account

    Creates a new user and automatically logs them in,
    returning a JWT token for immediate use.
    """
    try:
        # Create user
        user = await user_service.create_user(
            email=request.email,
            username=request.username,
            password=request.password,
            role="user"
        )

        # Auto-login after registration
        ip_address = req.client.host if req.client else None
        user_agent = req.headers.get("user-agent")

        user, token = await auth_service.login(
            email=request.email,
            password=request.password,
            ip_address=ip_address,
            user_agent=user_agent
        )

        return LoginResponse(
            access_token=token,
            token_type="bearer",
            user=UserResponse.model_validate(user)
        )

    except DomainValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Registration failed: {str(e)}")


# ===== LOGIN =====

@router.post("/auth/login", response_model=LoginResponse)
async def login(
    request: LoginRequest,
    req: Request,
    auth_service: AuthSvc
):
    """
    Login with email and password

    Returns JWT token that should be included in subsequent requests
    as: Authorization: Bearer <token>
    
    Rate limited: 5 requests per 60 seconds per IP/user
    """
    # Enforce login rate limit per user/IP
    
    try:
        identifier = await get_client_identifier(req)
        await login_limiter.check(identifier)
        # Get client info
        ip_address = req.client.host if req.client else None
        user_agent = req.headers.get("user-agent")

        # Authenticate
        identifier = request.email or request.username
        if not identifier:
            raise HTTPException(status_code=422, detail=[{"type":"missing_field","loc":["body","email|username"],"msg":"email or username is required","input":None}])

        user, token = await auth_service.login(
            email_or_username=identifier,
            password=request.password,
            ip_address=ip_address,
            user_agent=user_agent
        )

        return LoginResponse(
            access_token=token,
            token_type="bearer",
            user=UserResponse.model_validate(user)
        )

    except AuthenticationError as e:
        # Development-friendly message; keep generic in production
        raise HTTPException(status_code=401, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Login failed: {str(e)}")


# ===== LOGOUT =====

@router.post("/auth/logout", status_code=204)
async def logout(
    user: CurrentUser,
    auth_service: AuthSvc,
    authorization: str | None = None
):
    """
    Logout current session

    Revokes the current JWT token. The token will no longer be valid
    for subsequent requests.
    """
    try:
        # Extract token from Authorization header
        if authorization:
            parts = authorization.split()
            if len(parts) == 2 and parts[0].lower() == "bearer":
                token = parts[1]
                await auth_service.logout(token)

        return None

    except ResourceNotFoundError:
        # Session not found - already logged out
        return None
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Logout failed: {str(e)}")


# ===== LOGOUT ALL SESSIONS =====

@router.post("/auth/logout-all", status_code=200)
async def logout_all(
    user: CurrentUser,
    auth_service: AuthSvc
):
    """
    Logout all sessions for current user

    Revokes all JWT tokens for the current user across all devices.
    """
    try:
        count = await auth_service.logout_all(user.id)
        return {"message": f"Logged out from {count} sessions"}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Logout all failed: {str(e)}")


# ===== GET SESSIONS =====

@router.get("/auth/sessions", response_model=list[SessionResponse])
async def get_sessions(
    user: CurrentUser,
    auth_service: AuthSvc,
    active_only: bool = True
):
    """
    Get all sessions for current user

    Returns list of active (or all) sessions with metadata like
    IP address, user agent, and last active time.
    """
    try:
        sessions = await auth_service.get_user_sessions(
            user_id=user.id,
            active_only=active_only
        )

        return [SessionResponse.model_validate(s) for s in sessions]

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get sessions: {str(e)}")


# ===== REVOKE SESSION =====

@router.delete("/auth/sessions/{session_id}", status_code=204)
async def revoke_session(
    session_id: int,
    user: CurrentUser,
    auth_service: AuthSvc
):
    """
    Revoke a specific session

    Note: This endpoint requires authorization checks to ensure
    users can only revoke their own sessions.
    """
    try:
        # Get session to verify ownership
        sessions = await auth_service.get_user_sessions(user.id, active_only=False)
        session = next((s for s in sessions if s.id == session_id), None)

        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        if session.user_id != user.id:
            raise HTTPException(status_code=403, detail="Cannot revoke other user's session")

        await auth_service.revoke_session(session_id, reason="user_revocation")
        return None

    except ResourceNotFoundError:
        raise HTTPException(status_code=404, detail="Session not found")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to revoke session: {str(e)}")

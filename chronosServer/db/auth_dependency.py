from fastapi import Request, HTTPException, Depends, status
from db.supabase_client import get_supabase_client
from supabase import Client
from models.user import User
import logging

logger = logging.getLogger(__name__)


def _build_user(supabase_user) -> User:
    metadata = supabase_user.user_metadata or {}
    last_sign_in = supabase_user.last_sign_in_at
    return User(
        id=str(supabase_user.id),
        email=supabase_user.email,
        name=metadata.get("name") or metadata.get("full_name"),
        avatar_url=metadata.get("picture"),
        last_login_at=last_sign_in.isoformat() if last_sign_in else None
    )


async def get_current_user(
    request: Request,
    supabase: Client = Depends(get_supabase_client)
) -> User:
    """Get current user from the access token cookie. Clients must refresh when needed."""
    access_token = request.cookies.get("sb-access-token")
    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"X-Auth-Required": "true"}
        )

    try:
        supabase_user = supabase.auth.get_user(access_token).user
        return _build_user(supabase_user)
    except Exception as error:
        logger.error("Token validation failed: %s", error)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"X-Token-Expired": "true"}
        )

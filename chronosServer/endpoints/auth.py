from fastapi import APIRouter, HTTPException, Response, Request, Depends, status
from db.supabase_client import get_supabase_client
from db.auth_dependency import get_current_user
from supabase import Client
from config import settings
from models.user import User
from datetime import datetime

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post("/session")
async def create_session(request: Request, response: Response):
    """Accept session tokens and set httpOnly cookies"""
    try:
        body = await request.json()
        access_token = body.get("access_token")
        refresh_token = body.get("refresh_token")
        
        if not access_token or not refresh_token:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing tokens")
        _set_auth_cookies(response, access_token, refresh_token)
        return {"message": "Session created"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Authentication failed")

@router.post("/refresh")
async def refresh_token(request: Request, response: Response, supabase: Client = Depends(get_supabase_client)):
    refresh_token = request.cookies.get("sb-refresh-token")

    if not refresh_token:
        try:
            body = await request.json()
        except Exception:
            body = {}
        refresh_token = body.get("refresh_token")
    
    if not refresh_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No refresh token")
    
    try:
        auth_response = supabase.auth.refresh_session(refresh_token)
        session = auth_response.session
        
        if not session:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
        
        _set_auth_cookies(response, session.access_token, session.refresh_token)
        
        return {
            "message": "Token refreshed",
            "access_token": session.access_token,
            "refresh_token": session.refresh_token,
        }
    except Exception as e:
        _clear_auth_cookies(response)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token refresh failed")

@router.get("/me", response_model=User)
async def get_me(
    user: User = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    has_google_credentials = False
    try:
        result = (
            supabase.table("google_credentials")
            .select("user_id")
            .eq("user_id", str(user.id))
            .limit(1)
            .execute()
        )
        has_google_credentials = bool(result.data)
    except Exception as error:
        has_google_credentials = False
    return user.model_copy(update={"has_google_credentials": has_google_credentials})

@router.post("/logout")
async def logout(response: Response, request: Request, supabase: Client = Depends(get_supabase_client)):
    """Logout current session"""
    try:
        token = request.cookies.get("sb-access-token")
        if not token:
            auth_header = request.headers.get("authorization")
            if auth_header:
                parts = auth_header.split()
                if len(parts) == 2 and parts[0].lower() == "bearer":
                    token = parts[1].strip() or None
        if token:
            user = supabase.auth.get_user(token)
            supabase.table("users").update({
                "last_logout_at": datetime.utcnow().isoformat()
            }).eq("id", str(user.user.id)).execute()
    except Exception as e:
        pass
    
    _clear_auth_cookies(response)
    return {"message": "Logged out successfully"}


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str):
    """Set httpOnly auth cookies"""
    is_production = settings.IS_PRODUCTION
    
    response.set_cookie(
        key="sb-access-token",
        value=access_token,
        httponly=True,
        secure=is_production,
        samesite="lax",
        path="/",
        max_age=3600
    )
    
    response.set_cookie(
        key="sb-refresh-token",
        value=refresh_token,
        httponly=True,
        secure=is_production,
        samesite="lax",
        path="/",
        max_age=60 * 60 * 24 * 30  
        )

def _clear_auth_cookies(response: Response):
    """Clear auth cookies by overwriting with expired values"""
    is_production = settings.IS_PRODUCTION
    
    response.set_cookie(
        key="sb-access-token",
        value="deleted",
        httponly=True,
        secure=is_production,
        samesite="lax",
        path="/",
        max_age=0,  
        expires=0   
    )
    response.set_cookie(
        key="sb-refresh-token",
        value="deleted",
        httponly=True,
        secure=is_production,
        samesite="lax",
        path="/",
        max_age=0,
        expires=0   
    )

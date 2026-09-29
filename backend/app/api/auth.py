from fastapi import APIRouter, HTTPException, status, Depends
from typing import Dict, Any
from app.config.database import get_connection
from app.config.security import verify_password, create_access_token
from app.schemas.auth import LoginRequest, TokenResponse, UserOut, LogoutResponse
from app.api.deps import get_current_user

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest):
    """
    Authenticate user with email and password.
    Returns signed JWT access token and user metadata.
    """
    email_clean = payload.email.strip().lower()
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, name, email, password_hash, role, is_active
            FROM Users
            WHERE LOWER(email) = ?
        """, (email_clean,))
        row = cursor.fetchone()

        # Generic invalid-login message to prevent account enumeration
        if not row:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password.",
                headers={"WWW-Authenticate": "Bearer"},
            )

        # Verify password hash
        if not verify_password(payload.password, row.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password.",
                headers={"WWW-Authenticate": "Bearer"},
            )

        # Check account active status
        if not bool(row.is_active):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your account is inactive. Please contact an administrator.",
            )

        # Create JWT access token
        token_data = {
            "sub": str(row.id),
            "email": row.email,
            "role": row.role,
            "name": row.name,
        }
        access_token = create_access_token(data=token_data)

        user_out = UserOut(
            id=row.id,
            name=row.name,
            email=row.email,
            role=row.role,
            is_active=bool(row.is_active),
        )

        return TokenResponse(
            access_token=access_token,
            token_type="bearer",
            user=user_out,
        )
    finally:
        conn.close()


@router.get("/me", response_model=UserOut)
def get_me(current_user: Dict[str, Any] = Depends(get_current_user)):
    """
    Retrieve profile of currently authenticated user from verified JWT.
    """
    return UserOut(
        id=current_user["id"],
        name=current_user["name"],
        email=current_user["email"],
        role=current_user["role"],
        is_active=current_user["is_active"],
    )


@router.post("/logout", response_model=LogoutResponse)
def logout():
    """
    Client-side logout endpoint. Informs frontend to clear stored token session.
    """
    return LogoutResponse(
        status="success",
        message="Logged out successfully"
    )

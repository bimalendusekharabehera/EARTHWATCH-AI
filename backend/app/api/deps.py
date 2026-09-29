from typing import Optional, Dict, Any
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.config.database import get_connection
from app.config.security import decode_access_token

security_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme)
) -> Dict[str, Any]:
    """
    Validate JWT bearer token from Authorization header and return current user.
    Raises 401 Unauthorized if token is missing, invalid, expired, or user is inactive.
    """
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials were not provided.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    payload = decode_access_token(token)

    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Your session has expired or is invalid. Please sign in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Query SQL Server for current user state using parameterized query
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, name, email, role, is_active
            FROM Users
            WHERE id = ?
        """, (int(user_id),))
        row = cursor.fetchone()

        if not row:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User account no longer exists.",
                headers={"WWW-Authenticate": "Bearer"},
            )

        if not bool(row.is_active):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Your account is inactive. Please contact an administrator.",
                headers={"WWW-Authenticate": "Bearer"},
            )

        return {
            "id": row.id,
            "name": row.name,
            "email": row.email,
            "role": row.role,
            "is_active": bool(row.is_active),
        }
    finally:
        conn.close()


def require_admin(
    current_user: Dict[str, Any] = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Enforce ADMIN role authorization.
    Raises 403 Forbidden if authenticated user is not an administrator.
    """
    if current_user.get("role") != "ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this resource.",
        )
    return current_user

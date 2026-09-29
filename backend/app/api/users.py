from fastapi import APIRouter, HTTPException, status, Depends
from typing import Dict, Any, List
from app.config.database import get_connection
from app.config.security import hash_password
from app.schemas.user import UserCreate, UserUpdateStatus, UserResponse, UserListResponse
from app.api.deps import require_admin

router = APIRouter(prefix="/users", tags=["User Management"])


@router.get("", response_model=UserListResponse)
def list_users(admin_user: Dict[str, Any] = Depends(require_admin)):
    """
    List all registered users (ADMIN ONLY).
    """
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, name, email, role, is_active, created_at
            FROM Users
            ORDER BY id ASC
        """)
        rows = cursor.fetchall()
        users = []
        for r in rows:
            users.append(UserResponse(
                id=r.id,
                name=r.name,
                email=r.email,
                role=r.role,
                is_active=bool(r.is_active),
                created_at=str(r.created_at) if r.created_at else "",
            ))
        return UserListResponse(
            status="success",
            count=len(users),
            users=users,
        )
    finally:
        conn.close()


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreate,
    admin_user: Dict[str, Any] = Depends(require_admin)
):
    """
    Create a new user account (ADMIN ONLY).
    """
    email_clean = payload.email.strip().lower()
    name_clean = payload.name.strip()
    role_clean = payload.role.upper()

    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM Users WHERE LOWER(email) = ?", (email_clean,))
        if cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A user with this email address already exists.",
            )

        hashed_pw = hash_password(payload.password)
        cursor.execute("""
            INSERT INTO Users (name, email, password_hash, role, is_active)
            OUTPUT INSERTED.id, INSERTED.created_at
            VALUES (?, ?, ?, ?, 1)
        """, (name_clean, email_clean, hashed_pw, role_clean))
        row = cursor.fetchone()
        conn.commit()

        new_id = row[0]
        created_at_val = str(row[1])

        return UserResponse(
            id=new_id,
            name=name_clean,
            email=email_clean,
            role=role_clean, # type: ignore
            is_active=True,
            created_at=created_at_val,
        )
    finally:
        conn.close()


@router.patch("/{user_id}/status", response_model=UserResponse)
def update_user_status(
    user_id: int,
    payload: UserUpdateStatus,
    admin_user: Dict[str, Any] = Depends(require_admin)
):
    """
    Activate or deactivate a user account (ADMIN ONLY).
    """
    if admin_user["id"] == user_id and not payload.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Administrators cannot deactivate their own account.",
        )

    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, name, email, role, is_active, created_at
            FROM Users
            WHERE id = ?
        """, (user_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found.",
            )

        cursor.execute("""
            UPDATE Users
            SET is_active = ?
            WHERE id = ?
        """, (1 if payload.is_active else 0, user_id))
        conn.commit()

        return UserResponse(
            id=row.id,
            name=row.name,
            email=row.email,
            role=row.role,
            is_active=payload.is_active,
            created_at=str(row.created_at) if row.created_at else "",
        )
    finally:
        conn.close()


@router.delete("/{user_id}")
def delete_user(
    user_id: int,
    admin_user: Dict[str, Any] = Depends(require_admin)
):
    """
    Delete a user account (ADMIN ONLY).
    """
    if admin_user["id"] == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Administrators cannot delete their own account.",
        )

    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM Users WHERE id = ?", (user_id,))
        if not cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found.",
            )

        cursor.execute("DELETE FROM Users WHERE id = ?", (user_id,))
        conn.commit()

        return {"status": "success", "message": f"User {user_id} deleted successfully"}
    finally:
        conn.close()

from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr

from app.core.database import get_db
from app.core.security import verify_password, hash_password, create_access_token, get_current_user
from app.core.config import settings
from app.models.user import User

router = APIRouter()


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str = "agent"  # Kept for backward compatibility
    org_id: int | None = None
    group_id: int | None = None  # User group assignment


class UserOut(BaseModel):
    id: int
    name: str
    email: str
    role: str
    avatar_url: str | None
    org_id: int
    group_id: int | None
    is_superadmin: bool = False
    permissions: dict = {}
    # Organization settings
    advisor_name: str | None = None
    advisor_phone: str | None = None
    advisor_email: str | None = None
    agency_name: str | None = None
    agency_office_address: str | None = None
    website: str | None = None
    agency_highlights: list | None = None
    logo_url: str | None = None
    gstin: str | None = None
    bank_holder_name: str | None = None
    bank_account_number: str | None = None
    bank_name: str | None = None
    bank_ifsc: str | None = None

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserOut


def _user_with_permissions(user: User, db: Session = None) -> dict:
    """Helper to add permissions and org settings to user."""
    # Determine permissions based on group assignment
    permissions = user.group.permissions if user.group else {}

    # Fallback: grant full permissions if:
    # 1. User is admin/superadmin but has no group, OR
    # 2. User is the first/owner user in their organization (no group needed for org owners)
    is_admin_role = user.role == "admin" or user.role == "superadmin"
    is_org_owner = False

    if db and not permissions and not user.group_id:
        # Check if this is the first user (owner) of the organization
        first_user = db.query(User).filter(User.org_id == user.org_id).order_by(User.id.asc()).first()
        is_org_owner = first_user and first_user.id == user.id

    if not permissions and (is_admin_role or is_org_owner):
        permissions = {
            "leads": {"read": True, "write": True},
            "itinerary": {"read": True, "write": True},
            "vouchers": {"read": True, "write": True},
            "inventory": {"read": True, "write": True},
            "dashboard": {"read": True, "write": True},
            "settings": {"read": True, "write": True},
            "users": {"read": True, "write": True},
        }

    user_dict = {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role or "agent",
        "avatar_url": user.avatar_url,
        "org_id": user.org_id,
        "group_id": user.group_id,
        "is_superadmin": bool(user.is_superadmin),
        "permissions": permissions,
    }
    # Add organization settings
    if db:
        from app.models.organization import Organization
        org = db.query(Organization).filter(Organization.id == user.org_id).first()
        if org:
            user_dict.update({
                "advisor_name": org.advisor_name,
                "advisor_phone": org.advisor_phone,
                "advisor_email": org.advisor_email,
                "agency_name": org.agency_name,
                "agency_office_address": org.agency_office_address,
                "website": org.website,
                "agency_highlights": org.agency_highlights,
                "logo_url": org.logo_url,
                "gstin": org.gstin,
                "bank_holder_name": org.bank_holder_name,
                "bank_account_number": org.bank_account_number,
                "bank_name": org.bank_name,
                "bank_ifsc": org.bank_ifsc,
            })
    return user_dict


@router.post("/register", response_model=UserOut, status_code=201)
def register(payload: UserCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from app.api.pricing import check_plan_limit
    from app.api.user_groups import require_users_write
    from app.models.user_group import UserGroup

    # Only users with users.write permission (admins/org owners) may add team members
    require_users_write(current_user, db)

    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    org_id = payload.org_id or current_user.org_id

    allowed, error_msg, _, _ = check_plan_limit(db, org_id, "team_members")
    if not allowed:
        raise HTTPException(status_code=403, detail=error_msg)

    # Validate group if provided
    group_id = payload.group_id
    if group_id:
        group = db.query(UserGroup).filter(
            UserGroup.id == group_id,
            UserGroup.org_id == org_id
        ).first()
        if not group:
            raise HTTPException(status_code=404, detail="User group not found")

    user = User(
        name=payload.name,
        email=payload.email,
        hashed_password=hash_password(payload.password),
        role=payload.role,
        org_id=org_id,
        group_id=group_id,  # Assign to user group
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return _user_with_permissions(user, db)


@router.post("/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    token = create_access_token(
        data={"sub": str(user.id)},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return {"access_token": token, "token_type": "bearer", "user": _user_with_permissions(user, db)}


@router.get("/me", response_model=UserOut)
def get_me(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _user_with_permissions(current_user, db)


class UserUpdate(BaseModel):
    name: str | None = None
    email: EmailStr | None = None
    password: str | None = None
    # Organization settings
    advisor_name: str | None = None
    advisor_phone: str | None = None
    advisor_email: str | None = None
    agency_name: str | None = None
    agency_office_address: str | None = None
    website: str | None = None
    agency_highlights: list | None = None
    logo_url: str | None = None
    gstin: str | None = None
    bank_holder_name: str | None = None
    bank_account_number: str | None = None
    bank_name: str | None = None
    bank_ifsc: str | None = None


@router.get("/users", response_model=list[UserOut])
def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all users in the current organization."""
    users = db.query(User).filter(User.org_id == current_user.org_id).all()
    return [_user_with_permissions(u, db) for u in users]


@router.delete("/users/{user_id}", status_code=204)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("users", "write")),
):
    """Delete a user from the current organization."""
    if current_user.id == user_id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")

    target_user = db.query(User).filter(
        User.id == user_id,
        User.org_id == current_user.org_id,
    ).first()

    if not target_user:
        raise HTTPException(status_code=404, detail="User not found in your organization")

    from app.models.lead import Lead
    from app.models.followup import Followup
    db.query(Lead).filter(Lead.assigned_to == user_id).update({"assigned_to": None}, synchronize_session=False)
    db.query(Lead).filter(Lead.created_by == user_id).update({"created_by": None}, synchronize_session=False)
    db.query(Followup).filter(Followup.created_by == user_id).update({"created_by": None}, synchronize_session=False)

    db.delete(target_user)
    db.commit()
    return None


@router.put("/me", response_model=UserOut)
def update_me(
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Update user fields
    if payload.name is not None:
        current_user.name = payload.name
    if payload.email is not None:
        existing = db.query(User).filter(User.email == payload.email, User.id != current_user.id).first()
        if existing:
            raise HTTPException(status_code=400, detail="Email already registered by another user")
        current_user.email = payload.email
    if payload.password is not None:
        if len(payload.password) < 6:
            raise HTTPException(status_code=400, detail="Password must be at least 6 characters long")
        current_user.hashed_password = hash_password(payload.password)

    # Update organization settings if provided
    from app.models.organization import Organization
    org = db.query(Organization).filter(Organization.id == current_user.org_id).first()
    if org:
        if payload.advisor_name is not None:
            org.advisor_name = payload.advisor_name
        if payload.advisor_phone is not None:
            org.advisor_phone = payload.advisor_phone
        if payload.advisor_email is not None:
            org.advisor_email = payload.advisor_email
        if payload.agency_name is not None:
            org.agency_name = payload.agency_name
        if payload.agency_office_address is not None:
            org.agency_office_address = payload.agency_office_address
        if payload.website is not None:
            org.website = payload.website
        if payload.agency_highlights is not None:
            org.agency_highlights = payload.agency_highlights
        if payload.logo_url is not None:
            org.logo_url = payload.logo_url
        if payload.gstin is not None:
            org.gstin = payload.gstin
        if payload.bank_holder_name is not None:
            org.bank_holder_name = payload.bank_holder_name
        if payload.bank_account_number is not None:
            org.bank_account_number = payload.bank_account_number
        if payload.bank_name is not None:
            org.bank_name = payload.bank_name
        if payload.bank_ifsc is not None:
            org.bank_ifsc = payload.bank_ifsc

    db.commit()
    db.refresh(current_user)
    return _user_with_permissions(current_user, db)

from typing import Optional, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime

from app.core.database import get_db
from app.core.security import get_current_user, require_permission
from app.models.itinerary import Itinerary
from app.models.user import User
from app.services.activity import log_activity

router = APIRouter()


def _log_itinerary(db, itin, current_user):
    if itin.lead_id:
        log_activity(
            db, org_id=current_user.org_id, lead_id=itin.lead_id,
            actor_id=current_user.id, type="itinerary_created",
            title=f"Itinerary created: {itin.title}",
            description=itin.destination or None,
            ref_type="itinerary", ref_id=itin.id,
        )


class ItineraryCreate(BaseModel):
    title: str
    layout: str = "visual_experience"
    lead_id: Optional[int] = None
    cover_image_url: Optional[str] = None
    cover_title: Optional[str] = None
    cover_subheading: Optional[str] = None
    destination: Optional[str] = None
    num_travellers: Optional[int] = None
    num_adults: Optional[int] = None
    num_children: Optional[int] = None
    total_days: Optional[int] = None
    total_nights: Optional[int] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    cab_type: Optional[str] = None
    package_cost: Optional[str] = None
    per_person_cost: Optional[str] = None
    gst_percent: Optional[int] = 5
    payment_terms: Optional[str] = None
    inclusions: Optional[str] = None
    exclusions: Optional[str] = None
    meals_summary: Optional[Any] = None
    ferry_blocks: Optional[Any] = None
    flights: Optional[Any] = None
    stay_options: Optional[Any] = None
    days: Optional[Any] = None
    section_visibility: Optional[Any] = None


from app.services.share_service import ensure_share_token, generate_share_token


class ShareTogglePayload(BaseModel):
    enabled: bool


class ItineraryOut(BaseModel):
    id: int
    title: str
    layout: str
    lead_id: Optional[int]
    cover_image_url: Optional[str]
    cover_title: Optional[str]
    cover_subheading: Optional[str]
    destination: Optional[str]
    num_travellers: Optional[int]
    num_adults: Optional[int]
    num_children: Optional[int]
    total_days: Optional[int]
    total_nights: Optional[int]
    start_date: Optional[str]
    end_date: Optional[str]
    cab_type: Optional[str]
    package_cost: Optional[str]
    per_person_cost: Optional[str]
    gst_percent: Optional[int]
    payment_terms: Optional[str]
    inclusions: Optional[str]
    exclusions: Optional[str]
    meals_summary: Optional[Any]
    ferry_blocks: Optional[Any]
    flights: Optional[Any]
    stay_options: Optional[Any]
    days: Optional[Any]
    section_visibility: Optional[Any]
    share_url: Optional[str]
    pdf_url: Optional[str]
    share_token: Optional[str] = None
    is_public: Optional[bool] = False
    share_enabled: Optional[bool] = True
    share_expiry: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class GenerateRequest(BaseModel):
    raw_text: str
    layout: str = "visual_experience"
    lead_id: Optional[int] = None


@router.get("")
def list_itineraries(
    lead_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("itinerary", "read")),
):
    q = db.query(Itinerary).filter(Itinerary.org_id == current_user.org_id)
    if lead_id is not None:
        # Lead workspace: show all itineraries attached to this lead in the org
        q = q.filter(Itinerary.lead_id == lead_id)
    else:
        # Default list: only the current user's itineraries
        q = q.filter(Itinerary.created_by == current_user.id)
    items = q.order_by(Itinerary.created_at.desc()).all()
    for itin in items:
        ensure_share_token(db, itin)
    return items


@router.post("", response_model=ItineraryOut, status_code=201)
def create_itinerary(
    payload: ItineraryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("itinerary", "write")),
):
    from app.api.pricing import check_plan_limit

    allowed, error_msg, _, _ = check_plan_limit(db, current_user.org_id, "itineraries")
    if not allowed:
        raise HTTPException(status_code=403, detail=error_msg)

    itin = Itinerary(**payload.dict(), created_by=current_user.id, org_id=current_user.org_id)
    db.add(itin)
    db.commit()
    db.refresh(itin)
    ensure_share_token(db, itin)
    _log_itinerary(db, itin, current_user)
    return itin


@router.get("/{itin_id}/share-settings")
def get_share_settings(
    itin_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("itinerary", "read")),
):
    itin = db.query(Itinerary).filter(Itinerary.id == itin_id, Itinerary.org_id == current_user.org_id).first()
    if not itin:
        raise HTTPException(status_code=404, detail="Itinerary not found")

    token = ensure_share_token(db, itin)
    return {
        "share_token": token,
        "share_enabled": itin.share_enabled if itin.share_enabled is not None else True,
        "is_public": itin.is_public or False,
        "share_expiry": itin.share_expiry,
    }


@router.post("/{itin_id}/share-toggle")
def toggle_share(
    itin_id: int,
    payload: ShareTogglePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("itinerary", "write")),
):
    itin = db.query(Itinerary).filter(Itinerary.id == itin_id, Itinerary.org_id == current_user.org_id).first()
    if not itin:
        raise HTTPException(status_code=404, detail="Itinerary not found")

    ensure_share_token(db, itin)
    itin.share_enabled = payload.enabled
    db.commit()
    db.refresh(itin)
    return {
        "share_token": itin.share_token,
        "share_enabled": itin.share_enabled,
        "is_public": itin.is_public or False,
        "share_expiry": itin.share_expiry,
    }


@router.post("/{itin_id}/share-regenerate")
def regenerate_share_token(
    itin_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("itinerary", "write")),
):
    itin = db.query(Itinerary).filter(Itinerary.id == itin_id, Itinerary.org_id == current_user.org_id).first()
    if not itin:
        raise HTTPException(status_code=404, detail="Itinerary not found")

    token = generate_share_token(16)
    while db.query(Itinerary).filter(Itinerary.share_token == token).first():
        token = generate_share_token(16)
    itin.share_token = token
    db.commit()
    db.refresh(itin)
    return {
        "share_token": itin.share_token,
        "share_enabled": itin.share_enabled if itin.share_enabled is not None else True,
        "is_public": itin.is_public or False,
        "share_expiry": itin.share_expiry,
    }


@router.get("/{itin_id}", response_model=ItineraryOut)
def get_itinerary(itin_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_permission("itinerary", "read"))):
    itin = db.query(Itinerary).filter(Itinerary.id == itin_id, Itinerary.org_id == current_user.org_id).first()
    if not itin:
        raise HTTPException(status_code=404, detail="Itinerary not found")
    ensure_share_token(db, itin)
    return itin


@router.put("/{itin_id}", response_model=ItineraryOut)
def update_itinerary(
    itin_id: int,
    payload: ItineraryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("itinerary", "write")),
):
    itin = db.query(Itinerary).filter(Itinerary.id == itin_id, Itinerary.org_id == current_user.org_id).first()
    if not itin:
        raise HTTPException(status_code=404, detail="Itinerary not found")
    for field, value in payload.dict(exclude_unset=True).items():
        setattr(itin, field, value)
    db.commit()
    db.refresh(itin)
    ensure_share_token(db, itin)
    return itin


@router.delete("/{itin_id}", status_code=204)
def delete_itinerary(itin_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_permission("itinerary", "write"))):
    itin = db.query(Itinerary).filter(Itinerary.id == itin_id, Itinerary.org_id == current_user.org_id).first()
    if not itin:
        raise HTTPException(status_code=404, detail="Itinerary not found")
    db.delete(itin)
    db.commit()


@router.post("/generate", response_model=ItineraryOut, status_code=201)
async def generate_itinerary(
    payload: GenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("itinerary", "write")),
):
    """AI-powered itinerary generation from raw text using Gemini."""
    from app.services.ai_service import generate_itinerary as ai_generate
    from app.api.pricing import check_plan_limit

    allowed, error_msg, _, _ = check_plan_limit(db, current_user.org_id, "itineraries")
    if not allowed:
        raise HTTPException(status_code=403, detail=error_msg)

    data = await ai_generate(payload.raw_text, payload.layout)

    # ai_generate returns an empty fallback ({"days": []}) when the Gemini call
    # fails — don't persist a blank itinerary; surface a clear error instead.
    if not data.get("days"):
        err_reason = data.get("error") or "Unknown error"
        raise HTTPException(
            status_code=502,
            detail=f"AI itinerary generation failed: {err_reason}. Please check your GEMINI_API_KEY and Gemini quota.",
        )

    itin = Itinerary(
        org_id=current_user.org_id,
        title=data.get("title", "New Itinerary"),
        layout=payload.layout,
        lead_id=payload.lead_id,
        cover_image_url=data.get("cover_image_url"),
        cover_title=data.get("cover_title"),
        cover_subheading=data.get("cover_subheading"),
        destination=data.get("destination"),
        num_travellers=data.get("num_travellers"),
        total_days=data.get("total_days"),
        total_nights=data.get("total_nights"),
        package_cost=data.get("package_cost"),
        per_person_cost=data.get("per_person_cost"),
        inclusions=data.get("inclusions"),
        exclusions=data.get("exclusions"),
        meals_summary=data.get("meals_summary"),
        flights=data.get("flights"),
        stay_options=data.get("stay_options"),
        days=data.get("days"),
        created_by=current_user.id,
    )
    db.add(itin)
    db.commit()
    db.refresh(itin)
    ensure_share_token(db, itin)
    _log_itinerary(db, itin, current_user)
    return itin


class ImageSearchRequest(BaseModel):
    query: str
    exclude_url: Optional[str] = None


@router.post("/image-search")
async def search_itinerary_image(
    payload: ImageSearchRequest,
    current_user: User = Depends(require_permission("itinerary", "write")),
):
    """Look up a real photo for a free-text query (e.g. a hotel or sightseeing
    place name + city) via Google Places, for the per-image "Regenerate" button.

    Bypasses the in-memory photo cache and, when `exclude_url` (the photo
    currently shown) is given, prefers a different photo of the same place —
    otherwise "Regenerate" would just hand back the identical cached photo.
    """
    from app.services.ai_service import fetch_image_url

    query = payload.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Search query is required")

    url = await fetch_image_url(query, bypass_cache=True, exclude_url=payload.exclude_url)
    if not url:
        raise HTTPException(status_code=404, detail="No photo found for that search — try refining the name or city.")
    return {"url": url}


class ChatEditRequest(BaseModel):
    command: str


@router.post("/{itin_id}/chat-edit", response_model=ItineraryOut)
async def chat_edit_itinerary(
    itin_id: int,
    payload: ChatEditRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("itinerary", "write")),
):
    """Apply a natural language command to edit an existing itinerary via Gemini."""
    from app.services.ai_service import edit_itinerary_with_chat
    import json

    itin = db.query(Itinerary).filter(Itinerary.id == itin_id, Itinerary.org_id == current_user.org_id).first()
    if not itin:
        raise HTTPException(status_code=404, detail="Itinerary not found")

    current = {
        "title": itin.title,
        "cover_title": itin.cover_title,
        "cover_subheading": itin.cover_subheading,
        "days": itin.days or [],
        "flights": itin.flights or {},
        "stay_options": itin.stay_options or [],
        "meals_summary": itin.meals_summary or {},
        "ferry_blocks": itin.ferry_blocks or [],
        "package_cost": itin.package_cost,
        "per_person_cost": itin.per_person_cost,
        "inclusions": itin.inclusions,
        "exclusions": itin.exclusions,
    }

    updated = await edit_itinerary_with_chat(current, payload.command)

    # Apply updates back
    if "title" in updated:
        itin.title = updated["title"]
    if "cover_title" in updated:
        itin.cover_title = updated["cover_title"]
    if "cover_subheading" in updated:
        itin.cover_subheading = updated["cover_subheading"]
    if "days" in updated:
        itin.days = updated["days"]
    if "flights" in updated:
        itin.flights = updated["flights"]
    if "stay_options" in updated:
        itin.stay_options = updated["stay_options"]
    if "meals_summary" in updated:
        itin.meals_summary = updated["meals_summary"]
    if "ferry_blocks" in updated:
        itin.ferry_blocks = updated["ferry_blocks"]
    if "package_cost" in updated:
        itin.package_cost = updated["package_cost"]
    if "per_person_cost" in updated:
        itin.per_person_cost = updated["per_person_cost"]
    if "inclusions" in updated:
        itin.inclusions = updated["inclusions"]
    if "exclusions" in updated:
        itin.exclusions = updated["exclusions"]

    db.commit()
    db.refresh(itin)
    ensure_share_token(db, itin)
    return itin

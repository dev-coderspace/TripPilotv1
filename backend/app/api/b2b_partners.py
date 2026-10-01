from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from datetime import datetime

from collections import defaultdict
from app.core.database import get_db
from app.core.security import require_permission
from app.models.b2b_partner import B2BPartner, B2BCategory
from app.models.lead import Lead
from app.models.lead_partner import LeadPartner
from app.models.user import User

router = APIRouter()


class B2BPartnerCreate(BaseModel):
    company_name: str
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    gst_number: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = "India"
    countries: Optional[List[str]] = []
    category: Optional[B2BCategory] = B2BCategory.dmc
    commission_pct: Optional[float] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = True


class B2BPartnerUpdate(BaseModel):
    company_name: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    gst_number: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    countries: Optional[List[str]] = None
    category: Optional[B2BCategory] = None
    commission_pct: Optional[float] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class B2BPartnerOut(BaseModel):
    id: int
    company_name: str
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    gst_number: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    countries: Optional[List[str]] = []
    category: Optional[str] = None
    commission_pct: Optional[float] = None
    notes: Optional[str] = None
    is_active: bool = True
    leads_count: int = 0
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class PaginatedB2BPartners(BaseModel):
    items: List[B2BPartnerOut]
    total: int
    page: int
    pages: int
    per_page: int


@router.get("", response_model=PaginatedB2BPartners)
def list_b2b_partners(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=500),
    search: Optional[str] = None,
    category: Optional[B2BCategory] = None,
    country: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("leads", "read")),
):
    q = db.query(B2BPartner).filter(B2BPartner.org_id == current_user.org_id)

    if category:
        q = q.filter(B2BPartner.category == category)

    # Fetch all, then apply search + country filters in Python so that the
    # JSON `countries` array is included in the search (no DB-specific JSON ops).
    all_partners = q.order_by(B2BPartner.created_at.desc()).all()

    if search:
        needle = search.lower()
        def _matches_search(p: B2BPartner) -> bool:
            fields = [p.company_name, p.contact_person, p.phone, p.email, p.city, p.country]
            if any(f and needle in f.lower() for f in fields):
                return True
            if p.countries and any(needle in c.lower() for c in p.countries):
                return True
            return False
        all_partners = [p for p in all_partners if _matches_search(p)]

    if country:
        needle_c = country.lower()
        all_partners = [
            p for p in all_partners
            if (p.countries and any(needle_c in c.lower() for c in p.countries))
            or (p.country and needle_c in p.country.lower())
        ]

    total = len(all_partners)
    partners = all_partners[(page - 1) * per_page: page * per_page]

    # Calculate unique active leads count per partner
    partner_leads_map = defaultdict(set)

    direct_leads = (
        db.query(Lead.b2b_partner_id, Lead.id)
        .filter(
            Lead.org_id == current_user.org_id,
            Lead.is_deleted == False,
            Lead.b2b_partner_id.isnot(None)
        )
        .all()
    )
    for p_id, l_id in direct_leads:
        if p_id:
            partner_leads_map[p_id].add(l_id)

    assoc_leads = (
        db.query(LeadPartner.b2b_partner_id, LeadPartner.lead_id)
        .join(Lead, Lead.id == LeadPartner.lead_id)
        .filter(
            Lead.org_id == current_user.org_id,
            Lead.is_deleted == False
        )
        .all()
    )
    for p_id, l_id in assoc_leads:
        if p_id:
            partner_leads_map[p_id].add(l_id)

    items = []
    for p in partners:
        items.append({
            "id": p.id,
            "company_name": p.company_name,
            "contact_person": p.contact_person,
            "phone": p.phone,
            "email": p.email,
            "gst_number": p.gst_number,
            "city": p.city,
            "country": p.country,
            "countries": p.countries or [],
            "category": p.category.value if hasattr(p.category, "value") else (p.category if p.category else None),
            "commission_pct": p.commission_pct,
            "notes": p.notes,
            "is_active": p.is_active,
            "leads_count": len(partner_leads_map.get(p.id, set())),
            "created_at": p.created_at,
        })

    return PaginatedB2BPartners(
        items=items,
        total=total,
        page=page,
        pages=(total + per_page - 1) // per_page or 1,
        per_page=per_page,
    )


@router.post("", response_model=B2BPartnerOut, status_code=201)
def create_b2b_partner(
    payload: B2BPartnerCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("leads", "write")),
):
    """Create a new B2B partner."""
    partner = B2BPartner(
        org_id=current_user.org_id,
        **payload.dict(),
    )
    db.add(partner)
    db.commit()
    db.refresh(partner)
    return partner


@router.get("/{partner_id}", response_model=B2BPartnerOut)
def get_b2b_partner(
    partner_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("leads", "read")),
):
    """Get a specific B2B partner."""
    partner = db.query(B2BPartner).filter(
        B2BPartner.id == partner_id,
        B2BPartner.org_id == current_user.org_id,
    ).first()
    if not partner:
        raise HTTPException(status_code=404, detail="B2B partner not found")
    return partner


@router.put("/{partner_id}", response_model=B2BPartnerOut)
def update_b2b_partner(
    partner_id: int,
    payload: B2BPartnerUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("leads", "write")),
):
    """Update a B2B partner."""
    partner = db.query(B2BPartner).filter(
        B2BPartner.id == partner_id,
        B2BPartner.org_id == current_user.org_id,
    ).first()
    if not partner:
        raise HTTPException(status_code=404, detail="B2B partner not found")

    for field, value in payload.dict(exclude_unset=True).items():
        setattr(partner, field, value)

    db.commit()
    db.refresh(partner)
    return partner


@router.delete("/{partner_id}", status_code=204)
def delete_b2b_partner(
    partner_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("leads", "write")),
):
    """Delete a B2B partner."""
    partner = db.query(B2BPartner).filter(
        B2BPartner.id == partner_id,
        B2BPartner.org_id == current_user.org_id,
    ).first()
    if not partner:
        raise HTTPException(status_code=404, detail="B2B partner not found")

    db.delete(partner)
    db.commit()

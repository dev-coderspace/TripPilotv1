import io
import csv
from typing import Optional, List, Union
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from pydantic import BaseModel, EmailStr
from datetime import datetime, date, timedelta

from app.core.database import get_db
from app.core.security import get_current_user, require_permission
from app.models.lead import Lead, LeadSource, LeadStage
from app.models.customer import Customer
from app.models.b2b_partner import B2BPartner
from app.models.user import User
from app.models.followup import Followup, FollowupStatus
from app.services.activity import log_activity

router = APIRouter()


def _parse_stage(val: Optional[str]) -> Optional[str]:
    if not val:
        return "fresh"
    return str(val).strip().lower()


def _parse_source(val: Optional[str]) -> Optional[str]:
    if not val:
        return "manual"
    return str(val).strip().lower()


# ─── Schemas ─────────────────────────────────────────────────────────────────

class LeadCreate(BaseModel):
    customer_id: int
    source: Optional[str] = "manual"
    stage: Optional[str] = "fresh"
    destination: Optional[str] = None
    trip_type: Optional[str] = None
    travel_date: Optional[datetime] = None
    num_nights: Optional[int] = None
    num_days: Optional[int] = None
    num_adults: Optional[int] = None
    num_children: Optional[int] = None
    num_infants: Optional[int] = None
    budget: Optional[str] = None
    notes: Optional[str] = None
    assigned_to: Optional[int] = None
    b2b_partner_id: Optional[int] = None


class LeadUpdate(BaseModel):
    customer_id: Optional[int] = None
    source: Optional[str] = None
    stage: Optional[str] = None
    destination: Optional[str] = None
    trip_type: Optional[str] = None
    travel_date: Optional[datetime] = None
    num_nights: Optional[int] = None
    num_days: Optional[int] = None
    num_adults: Optional[int] = None
    num_children: Optional[int] = None
    num_infants: Optional[int] = None
    budget: Optional[str] = None
    notes: Optional[str] = None
    assigned_to: Optional[int] = None
    b2b_partner_id: Optional[int] = None


class LeadCustomerOut(BaseModel):
    id: int
    name: str
    phone: str
    email: Optional[str] = None
    whatsapp_number: Optional[str] = None

    class Config:
        from_attributes = True


class B2BPartnerBrief(BaseModel):
    id: int
    company_name: str
    category: Optional[str] = None

    class Config:
        from_attributes = True


class LeadOut(BaseModel):
    id: int
    customer_id: int
    source: str
    stage: str
    destination: Optional[str]
    trip_type: Optional[str]
    travel_date: Optional[datetime]
    num_nights: Optional[int] = None
    num_days: Optional[int] = None
    num_adults: Optional[int]
    num_children: Optional[int]
    num_infants: Optional[int]
    adults: Optional[int] = None
    kids: Optional[int] = None
    infants: Optional[int] = None
    budget: Optional[str]
    notes: Optional[str]
    assigned_to: Optional[int]
    b2b_partner_id: Optional[int] = None
    created_at: datetime
    customer: Optional[LeadCustomerOut] = None
    b2b_partner: Optional[B2BPartnerBrief] = None

    class Config:
        from_attributes = True


class AILeadInput(BaseModel):
    text: str


class PaginatedLeads(BaseModel):
    items: List[LeadOut]
    total: int
    page: int
    pages: int
    per_page: int


# ─── Routes ──────────────────────────────────────────────────────────────────

@router.get("", response_model=PaginatedLeads)
def list_leads(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    source: Optional[LeadSource] = None,
    stage: Optional[LeadStage] = None,
    assigned_to: Optional[int] = None,
    unassigned: bool = False,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    customer_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("leads", "read")),
):
    q = db.query(Lead).filter(
        Lead.org_id == current_user.org_id,
        or_(Lead.is_deleted == False, Lead.is_deleted == None)
    )

    # Scoping: admins, managers, or users with user/lead perms see all org leads.
    perms = current_user.group.permissions if current_user.group else {}
    is_admin_or_manager = current_user.is_superadmin or (getattr(current_user, "role", None) in ("admin", "manager"))
    can_read_all_org_leads = is_admin_or_manager or perms.get("users", {}).get("read", False) or perms.get("leads", {}).get("read", False)

    if not can_read_all_org_leads:
        q = q.filter(or_(
            Lead.assigned_to == current_user.id,
            Lead.created_by == current_user.id,
            Lead.assigned_to == None
        ))

    if customer_id:
        q = q.filter(Lead.customer_id == customer_id)
    if search:
        q = q.join(Customer).filter(or_(
            Customer.name.ilike(f"%{search}%"),
            Customer.phone.ilike(f"%{search}%"),
            Customer.email.ilike(f"%{search}%"),
        ))
    if source:
        q = q.filter(Lead.source == source)
    if stage:
        q = q.filter(Lead.stage == stage)
    if assigned_to:
        q = q.filter(Lead.assigned_to == assigned_to)
    if unassigned:
        q = q.filter(Lead.assigned_to == None)
    if date_from:
        q = q.filter(Lead.created_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        q = q.filter(Lead.created_at <= datetime.combine(date_to, datetime.max.time()))

    total = q.count()
    leads = q.order_by(Lead.created_at.desc()).offset((page - 1) * per_page).limit(per_page).all()

    # Add customer and b2b info to leads
    result_items = []
    for lead in leads:
        lead_dict = {
            "id": lead.id,
            "customer_id": lead.customer_id,
            "source": lead.source.value if lead.source else "",
            "stage": lead.stage.value if lead.stage else "",
            "destination": lead.destination,
            "trip_type": lead.trip_type,
            "travel_date": lead.travel_date,
            "num_adults": lead.num_adults,
            "num_children": lead.num_children,
            "num_infants": lead.num_infants,
            "budget": lead.budget,
            "notes": lead.notes,
            "assigned_to": lead.assigned_to,
            "b2b_partner_id": lead.b2b_partner_id,
            "created_at": lead.created_at,
            "customer": {
                "id": lead.customer.id,
                "name": lead.customer.name,
                "phone": lead.customer.phone,
                "email": lead.customer.email,
                "whatsapp_number": lead.customer.whatsapp_number,
            } if lead.customer else None,
            "b2b_partner": {
                "id": lead.b2b_partner.id,
                "company_name": lead.b2b_partner.company_name,
                "category": lead.b2b_partner.category.value if lead.b2b_partner.category else None,
            } if lead.b2b_partner else None,
        }
        result_items.append(lead_dict)

    return PaginatedLeads(
        items=result_items,
        total=total,
        page=page,
        pages=(total + per_page - 1) // per_page,
        per_page=per_page,
    )


@router.post("", response_model=LeadOut, status_code=201)
def create_lead(
    payload: LeadCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("leads", "write")),
):
    from app.api.pricing import check_plan_limit

    # Verify customer exists and belongs to org
    customer = db.query(Customer).filter(
        Customer.id == payload.customer_id,
        Customer.org_id == current_user.org_id
    ).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    allowed, error_msg, _, _ = check_plan_limit(db, current_user.org_id, "leads")
    if not allowed:
        raise HTTPException(status_code=403, detail=error_msg)

    lead_data = payload.dict()
    if "stage" in lead_data and lead_data["stage"]:
        lead_data["stage"] = _parse_stage(lead_data["stage"])
    if "source" in lead_data and lead_data["source"]:
        lead_data["source"] = _parse_source(lead_data["source"])
    lead = Lead(**lead_data, created_by=current_user.id, org_id=current_user.org_id)
    db.add(lead)
    db.commit()
    db.refresh(lead)

    log_activity(
        db, org_id=current_user.org_id, lead_id=lead.id, customer_id=lead.customer_id,
        actor_id=current_user.id, type="lead_created", title="Lead created",
        description=lead.destination or None, ref_type="lead", ref_id=lead.id,
    )
    return lead


@router.get("/today-reminders")
def get_today_reminders(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("leads", "read")),
):
    today = date.today()
    tomorrow = today + timedelta(days=1)

    leads_with_followups = (
        db.query(Lead)
        .filter(Lead.org_id == current_user.org_id, or_(Lead.is_deleted == False, Lead.is_deleted == None))
        .join(Followup, Lead.id == Followup.lead_id)
        .filter(Followup.created_by == current_user.id)
        .filter(Followup.status == FollowupStatus.pending)
        .filter(Followup.scheduled_date >= datetime(today.year, today.month, today.day, 0, 0, 0))
        .filter(Followup.scheduled_date < datetime(tomorrow.year, tomorrow.month, tomorrow.day, 0, 0, 0))
        .distinct(Lead.id)
        .order_by(Lead.id, Followup.scheduled_date)
        .all()
    )

    return leads_with_followups


@router.get("/{lead_id}", response_model=LeadOut)
def get_lead(lead_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    lead = db.query(Lead).filter(
        Lead.id == lead_id,
        Lead.org_id == current_user.org_id,
        or_(Lead.is_deleted == False, Lead.is_deleted == None)
    ).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    return lead


@router.get("/{lead_id}/workspace")
def get_lead_workspace(
    lead_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("leads", "read")),
):
    """Aggregate of everything attached to a lead — counts + recent items in one call."""
    from app.models.itinerary import Itinerary
    from app.models.tools import HotelVoucher, Invoice, FlightTicket
    from app.models.lead_partner import LeadPartner

    lead = db.query(Lead).filter(
        Lead.id == lead_id,
        Lead.org_id == current_user.org_id,
        or_(Lead.is_deleted == False, Lead.is_deleted == None)
    ).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    org_id = current_user.org_id

    itineraries = db.query(Itinerary).filter(
        Itinerary.org_id == org_id, Itinerary.lead_id == lead_id
    ).order_by(Itinerary.created_at.desc()).all()

    vouchers_filter = (HotelVoucher.lead_id == lead_id)
    if lead and lead.customer_id:
        vouchers_filter = or_(
            HotelVoucher.lead_id == lead_id,
            and_(HotelVoucher.customer_id == lead.customer_id, HotelVoucher.customer_id != None)
        )

    vouchers = db.query(HotelVoucher).filter(
        HotelVoucher.org_id == org_id, vouchers_filter
    ).order_by(HotelVoucher.created_at.desc()).all()

    invoices = db.query(Invoice).filter(
        Invoice.org_id == org_id, Invoice.lead_id == lead_id
    ).order_by(Invoice.created_at.desc()).all()

    flights = db.query(FlightTicket).filter(
        FlightTicket.org_id == org_id, FlightTicket.lead_id == lead_id
    ).order_by(FlightTicket.created_at.desc()).all()

    partners = db.query(LeadPartner).filter(
        LeadPartner.org_id == org_id, LeadPartner.lead_id == lead_id
    ).order_by(LeadPartner.created_at.desc()).all()

    return {
        "counts": {
            "itineraries": len(itineraries),
            "vouchers": len(vouchers),
            "invoices": len(invoices),
            "flights": len(flights),
            "partners": len(partners),
        },
        "itineraries": [
            {
                "id": i.id,
                "title": i.title,
                "destination": i.destination,
                "total_days": i.total_days,
                "total_nights": i.total_nights,
                "package_cost": i.package_cost,
                "pdf_url": i.pdf_url,
                "share_url": i.share_url,
                "created_at": i.created_at,
            }
            for i in itineraries
        ],
        "vouchers": [
            {
                "id": v.id,
                "voucher_number": f"VCH-{v.id:05d}",
                "guest_name": v.guest_name or (lead.customer.name if lead and lead.customer else None),
                "hotel_name": v.hotel_name,
                "hotel_stars": v.hotel_stars,
                "check_in": v.check_in,
                "check_out": v.check_out,
                "room_type": v.room_type,
                "status": "Confirmed",
                "pdf_url": v.pdf_url,
                "created_at": v.created_at,
            }
            for v in vouchers
        ],
        "invoices": [
            {
                "id": inv.id,
                "invoice_number": inv.invoice_number,
                "grand_total": inv.grand_total,
                "status": inv.status,
                "created_at": inv.created_at,
            }
            for inv in invoices
        ],
        "flights": [
            {
                "id": f.id,
                "airline": f.airline,
                "flight_number": f.flight_number,
                "origin": f.origin,
                "destination": f.destination,
                "depart_at": f.depart_at,
                "pnr": f.pnr,
                "created_at": f.created_at,
            }
            for f in flights
        ],
        "partners": [
            {
                "id": p.id,
                "b2b_partner_id": p.b2b_partner_id,
                "company_name": p.partner.company_name if p.partner else None,
                "category": (p.partner.category.value if p.partner and hasattr(p.partner.category, "value") else (p.partner.category if p.partner else None)),
                "role": p.role,
                "country": p.country,
                "cost": p.cost,
                "notes": p.notes,
                "countries": p.partner.countries if p.partner else [],
                "created_at": p.created_at,
            }
            for p in partners
        ],
    }


class NoteCreate(BaseModel):
    title: Optional[str] = None
    description: str


@router.get("/{lead_id}/activities")
def list_lead_activities(
    lead_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("leads", "read")),
):
    """Timeline of activities for a lead (newest first)."""
    from app.models.activity import LeadActivity

    lead = db.query(Lead).filter(
        Lead.id == lead_id, Lead.org_id == current_user.org_id, or_(Lead.is_deleted == False, Lead.is_deleted == None)
    ).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    activities = db.query(LeadActivity).filter(
        LeadActivity.org_id == current_user.org_id,
        LeadActivity.lead_id == lead_id,
    ).order_by(LeadActivity.created_at.desc()).all()

    return [
        {
            "id": a.id,
            "type": a.type,
            "title": a.title,
            "description": a.description,
            "ref_type": a.ref_type,
            "ref_id": a.ref_id,
            "meta": a.meta,
            "actor_id": a.actor_id,
            "actor_name": a.actor.name if a.actor else None,
            "created_at": a.created_at,
        }
        for a in activities
    ]


@router.post("/{lead_id}/activities", status_code=201)
def add_lead_note(
    lead_id: int,
    payload: NoteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("leads", "write")),
):
    """Add a manual note to the lead timeline."""
    lead = db.query(Lead).filter(
        Lead.id == lead_id, Lead.org_id == current_user.org_id, or_(Lead.is_deleted == False, Lead.is_deleted == None)
    ).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    activity = log_activity(
        db, org_id=current_user.org_id, lead_id=lead_id, customer_id=lead.customer_id,
        actor_id=current_user.id, type="note",
        title=payload.title or "Note", description=payload.description,
    )
    if not activity:
        raise HTTPException(status_code=500, detail="Failed to add note")
    return {
        "id": activity.id,
        "type": activity.type,
        "title": activity.title,
        "description": activity.description,
        "actor_id": activity.actor_id,
        "actor_name": current_user.name,
        "created_at": activity.created_at,
    }


@router.put("/{lead_id}", response_model=LeadOut)
def update_lead(
    lead_id: int,
    payload: LeadUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("leads", "write")),
):
    lead = db.query(Lead).filter(
        Lead.id == lead_id, Lead.org_id == current_user.org_id, or_(Lead.is_deleted == False, Lead.is_deleted == None)
    ).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    # If customer_id is being updated, verify it exists
    if payload.customer_id:
        customer = db.query(Customer).filter(
            Customer.id == payload.customer_id,
            Customer.org_id == current_user.org_id
        ).first()
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")

    old_stage = lead.stage
    updates = payload.dict(exclude_unset=True)
    if "stage" in updates and updates["stage"] is not None:
        updates["stage"] = _parse_stage(updates["stage"])
    if "source" in updates and updates["source"] is not None:
        updates["source"] = _parse_source(updates["source"])
    for field, value in updates.items():
        setattr(lead, field, value)
    db.commit()
    db.refresh(lead)

    new_stage = lead.stage
    if "stage" in updates and old_stage != new_stage:
        old_label = old_stage.value if hasattr(old_stage, "value") else str(old_stage)
        new_label = new_stage.value if hasattr(new_stage, "value") else str(new_stage)
        log_activity(
            db, org_id=current_user.org_id, lead_id=lead.id, customer_id=lead.customer_id,
            actor_id=current_user.id, type="stage_changed",
            title=f"Stage changed to {new_label.replace('_', ' ')}",
            description=f"{old_label.replace('_', ' ')} → {new_label.replace('_', ' ')}",
            ref_type="lead", ref_id=lead.id,
            meta={"from": old_label, "to": new_label},
        )
    return lead


@router.delete("/{lead_id}", status_code=204)
def delete_lead(
    lead_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("leads", "write")),
):
    lead = db.query(Lead).filter(
        Lead.id == lead_id, Lead.org_id == current_user.org_id, or_(Lead.is_deleted == False, Lead.is_deleted == None)
    ).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    lead.is_deleted = True
    db.commit()


@router.post("/ai", response_model=LeadOut, status_code=201)
async def ai_lead_entry(
    payload: AILeadInput,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("leads", "write")),
):
    """Parse free-text (WhatsApp msg / email) into a structured Lead using Gemini AI."""
    from app.services.ai_service import parse_lead_from_text
    from datetime import datetime as dt

    parsed = await parse_lead_from_text(payload.text)

    # Extract customer info
    customer_name = parsed.get("name") or "Unknown"
    customer_phone = parsed.get("phone") or "0000000000"
    customer_email = parsed.get("email")
    customer_whatsapp = parsed.get("whatsapp_number")

    # Check if customer exists by phone
    customer = db.query(Customer).filter(
        Customer.phone == customer_phone,
        Customer.org_id == current_user.org_id
    ).first()

    # If not found, create new customer
    if not customer:
        customer = Customer(
            org_id=current_user.org_id,
            name=customer_name,
            phone=customer_phone,
            email=customer_email,
            whatsapp_number=customer_whatsapp,
        )
        db.add(customer)
        db.flush()  # Flush to get the customer ID without committing

    # Safely map source string → enum
    source_raw = str(parsed.get("source", "manual")).lower()
    try:
        source = LeadSource(source_raw)
    except ValueError:
        source = LeadSource.manual

    # Parse travel_date if present
    travel_date = None
    if parsed.get("travel_date"):
        try:
            travel_date = dt.strptime(parsed["travel_date"], "%Y-%m-%d")
        except Exception:
            pass

    lead = Lead(
        org_id=current_user.org_id,
        customer_id=customer.id,
        destination=parsed.get("destination") or None,
        trip_type=parsed.get("trip_type") or None,
        num_adults=parsed.get("num_adults") or None,
        num_children=parsed.get("num_children") or None,
        num_infants=parsed.get("num_infants") or None,
        budget=parsed.get("budget") or None,
        travel_date=travel_date,
        notes=parsed.get("notes") or payload.text,
        source=source,
        stage=LeadStage.fresh,
        created_by=current_user.id,
    )
    db.add(lead)
    db.commit()
    db.refresh(lead)
    return lead


@router.get("/export/csv")
def export_leads_csv(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("leads", "read")),
):
    leads = (
        db.query(Lead)
        .filter(Lead.org_id == current_user.org_id, or_(Lead.is_deleted == False, Lead.is_deleted == None))
        .order_by(Lead.created_at.desc())
        .all()
    )
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["ID", "Customer Name", "Phone", "Email", "Source", "Stage", "Destination", "Budget", "Created At"])
    for lead in leads:
        writer.writerow([
            lead.id,
            lead.customer.name if lead.customer else "",
            lead.customer.phone if lead.customer else "",
            lead.customer.email if lead.customer else "",
            lead.source.value if lead.source else "",
            lead.stage.value if lead.stage else "",
            lead.destination or "",
            lead.budget or "",
            lead.created_at.strftime("%Y-%m-%d %H:%M") if lead.created_at else "",
        ])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=leads.csv"},
    )


@router.post("/import/csv", status_code=201)
def import_leads_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("leads", "write")),
):
    valid_sources = {s.value for s in LeadSource}
    valid_stages = {s.value for s in LeadStage}

    content = file.file.read().decode("utf-8")
    reader = csv.DictReader(io.StringIO(content))
    created = 0
    for row in reader:
        customer_name = row.get("name") or "Unknown"
        customer_phone = row.get("phone") or "0000000000"
        customer_email = row.get("email") or None
        whatsapp_number = row.get("whatsapp_number") or None

        customer = db.query(Customer).filter(
            Customer.phone == customer_phone,
            Customer.org_id == current_user.org_id
        ).first()

        if not customer:
            customer = Customer(
                org_id=current_user.org_id,
                name=customer_name,
                phone=customer_phone,
                email=customer_email or None,
                whatsapp_number=whatsapp_number,
            )
            db.add(customer)
            db.flush()

        raw_source = (row.get("source") or "").strip().lower()
        raw_stage = (row.get("stage") or "").strip().lower()

        def safe_int(val):
            try:
                return int(val) if val and str(val).strip() else None
            except (ValueError, TypeError):
                return None

        lead = Lead(
            org_id=current_user.org_id,
            customer_id=customer.id,
            source=LeadSource(raw_source) if raw_source in valid_sources else LeadSource.manual,
            stage=LeadStage(raw_stage) if raw_stage in valid_stages else LeadStage.fresh,
            destination=row.get("destination") or None,
            trip_type=row.get("trip_type") or None,
            budget=row.get("budget") or None,
            num_adults=safe_int(row.get("num_adults")),
            num_children=safe_int(row.get("num_children")),
            num_infants=safe_int(row.get("num_infants")),
            notes=row.get("notes") or None,
            created_by=current_user.id,
        )
        db.add(lead)
        created += 1
    db.commit()
    return {"created": created, "message": f"Successfully imported {created} leads"}

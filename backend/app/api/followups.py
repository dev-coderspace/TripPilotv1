from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime, date, timedelta

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.followup import Followup, FollowupStatus
from app.models.lead import Lead
from app.models.customer import Customer
from app.models.user import User
from app.services.activity import log_activity

router = APIRouter()


class FollowupCreate(BaseModel):
    scheduled_date: datetime
    notes: Optional[str] = None


class FollowupUpdate(BaseModel):
    scheduled_date: Optional[datetime] = None
    notes: Optional[str] = None
    status: Optional[FollowupStatus] = None


class FollowupOut(BaseModel):
    id: int
    lead_id: int
    scheduled_date: datetime
    notes: Optional[str]
    status: str
    created_by: Optional[int]
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# Create follow-up
@router.post("/leads/{lead_id}/followups", response_model=FollowupOut, status_code=201)
def create_followup(
    lead_id: int,
    payload: FollowupCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    lead = db.query(Lead).filter(
        Lead.id == lead_id, Lead.org_id == current_user.org_id
    ).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    org_id = lead.org_id or current_user.org_id
    if not org_id:
        raise HTTPException(status_code=400, detail="Organization ID is missing. Please ensure your user account and lead are assigned to an organization.")

    followup = Followup(
        lead_id=lead_id,
        org_id=org_id,
        scheduled_date=payload.scheduled_date,
        notes=payload.notes,
        created_by=current_user.id,
    )
    db.add(followup)
    db.commit()
    db.refresh(followup)

    log_activity(
        db, org_id=org_id, lead_id=lead_id, customer_id=lead.customer_id,
        actor_id=current_user.id, type="followup_scheduled", title="Follow-up scheduled",
        description=payload.notes or None, ref_type="followup", ref_id=followup.id,
        meta={"scheduled_date": payload.scheduled_date.isoformat() if payload.scheduled_date else None},
    )
    return followup


# Get all follow-ups for a lead
@router.get("/leads/{lead_id}/followups", response_model=List[FollowupOut])
def get_lead_followups(
    lead_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    followups = db.query(Followup).filter(Followup.lead_id == lead_id).order_by(Followup.scheduled_date.desc()).all()
    return followups


# Get all pending follow-ups for current user
@router.get("/followups/pending", response_model=List[FollowupOut])
def get_pending_followups(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    followups = (
        db.query(Followup)
        .filter(Followup.created_by == current_user.id)
        .filter(Followup.status == FollowupStatus.pending)
        .order_by(Followup.scheduled_date)
        .all()
    )
    return followups


# Get follow-ups scheduled for today
from datetime import date, timedelta
@router.get("/followups/today", response_model=List[FollowupOut])
def get_today_followups(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    today = date.today()
    tomorrow = today + timedelta(days=1)

    followups = (
        db.query(Followup)
        .filter(Followup.created_by == current_user.id)
        .filter(Followup.status == FollowupStatus.pending)
        .filter(Followup.scheduled_date >= datetime(today.year, today.month, today.day, 0, 0, 0))
        .filter(Followup.scheduled_date < datetime(tomorrow.year, tomorrow.month, tomorrow.day, 0, 0, 0))
        .order_by(Followup.scheduled_date)
        .all()
    )
    return followups


# Get single follow-up
@router.get("/followups/{followup_id}", response_model=FollowupOut)
def get_followup(
    followup_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    followup = db.query(Followup).filter(Followup.id == followup_id).first()
    if not followup:
        raise HTTPException(status_code=404, detail="Followup not found")
    return followup


# Update follow-up
@router.put("/followups/{followup_id}", response_model=FollowupOut)
def update_followup(
    followup_id: int,
    payload: FollowupUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    followup = db.query(Followup).filter(Followup.id == followup_id).first()
    if not followup:
        raise HTTPException(status_code=404, detail="Followup not found")

    for field, value in payload.dict(exclude_unset=True).items():
        setattr(followup, field, value)

    db.commit()
    db.refresh(followup)
    return followup


@router.get("/notifications")
def get_notifications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        now = datetime.now()
        today_end = datetime(now.year, now.month, now.day, 23, 59, 59)

        q = (
            db.query(Followup, Lead, Customer)
            .join(Lead, Followup.lead_id == Lead.id)
            .join(Customer, Lead.customer_id == Customer.id)
            .filter(or_(Followup.status == FollowupStatus.pending, Followup.status == "pending"))
            .filter(Followup.scheduled_date <= today_end)
        )
        if current_user.org_id:
            q = q.filter(Followup.org_id == current_user.org_id)

        rows = q.order_by(Followup.scheduled_date.asc()).limit(30).all()

        result = []
        for followup, lead, customer in rows:
            is_overdue = followup.scheduled_date < datetime(now.year, now.month, now.day, 0, 0, 0) if followup.scheduled_date else False
            result.append({
                "id": followup.id,
                "lead_id": lead.id,
                "customer_name": customer.name if customer else "Unknown",
                "destination": lead.destination,
                "notes": followup.notes,
                "scheduled_date": followup.scheduled_date.isoformat() if followup.scheduled_date else "",
                "kind": "overdue" if is_overdue else "today",
            })

        return {"items": result, "total": len(result)}
    except Exception as e:
        print(f"[notifications] Error: {e}")
        return {"items": [], "total": 0}


# Delete follow-up
@router.delete("/followups/{followup_id}", status_code=204)
def delete_followup(
    followup_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    followup = db.query(Followup).filter(Followup.id == followup_id).first()
    if not followup:
        raise HTTPException(status_code=404, detail="Followup not found")

    db.delete(followup)
    db.commit()

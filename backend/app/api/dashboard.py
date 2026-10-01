from datetime import datetime, date, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, case, or_, and_

from app.core.database import get_db
from app.core.security import get_current_user, require_permission
from app.models.lead import Lead, LeadStage, LeadSource
from app.models.customer import Customer
from app.models.user import User
from app.services.ai_service import generate_dashboard_insights

router = APIRouter()


@router.get("/summary")
def dashboard_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("dashboard", "read")),
):
    not_deleted = or_(Lead.is_deleted == False, Lead.is_deleted == None)
    total_leads = db.query(func.count(Lead.id)).filter(Lead.org_id == current_user.org_id, not_deleted).scalar()
    won_leads = db.query(func.count(Lead.id)).filter(Lead.org_id == current_user.org_id, Lead.stage == LeadStage.won, not_deleted).scalar()
    lost_leads = db.query(func.count(Lead.id)).filter(Lead.org_id == current_user.org_id, Lead.stage == LeadStage.lost, not_deleted).scalar()
    fresh_leads = db.query(func.count(Lead.id)).filter(Lead.org_id == current_user.org_id, Lead.stage == LeadStage.fresh, not_deleted).scalar()
    not_responding = db.query(func.count(Lead.id)).filter(Lead.org_id == current_user.org_id, Lead.stage == LeadStage.not_responding, not_deleted).scalar()
    conversion_rate = round((won_leads / total_leads * 100), 1) if total_leads else 0

    return {
        "total_leads": total_leads,
        "won_leads": won_leads,
        "lost_leads": lost_leads,
        "fresh_leads": fresh_leads,
        "not_responding": not_responding,
        "conversion_rate": conversion_rate,
        "active_leads": total_leads - won_leads - lost_leads,
    }


@router.get("/leads-by-source")
def leads_by_source(db: Session = Depends(get_db), current_user: User = Depends(require_permission("dashboard", "read"))):
    rows = db.query(Lead.source, func.count(Lead.id)).filter(Lead.org_id == current_user.org_id, or_(Lead.is_deleted == False, Lead.is_deleted.is_(None))).group_by(Lead.source).all()
    return [{"source": (r[0].value if hasattr(r[0], "value") else str(r[0])) if r[0] else "unknown", "count": r[1]} for r in rows]


@router.get("/leads-by-stage")
def leads_by_stage(db: Session = Depends(get_db), current_user: User = Depends(require_permission("dashboard", "read"))):
    rows = db.query(Lead.stage, func.count(Lead.id)).filter(Lead.org_id == current_user.org_id, or_(Lead.is_deleted == False, Lead.is_deleted.is_(None))).group_by(Lead.stage).all()
    return [{"stage": (r[0].value if hasattr(r[0], "value") else str(r[0])) if r[0] else "unknown", "count": r[1]} for r in rows]


@router.get("/leaderboard")
def team_leaderboard(db: Session = Depends(get_db), current_user: User = Depends(require_permission("dashboard", "read"))):
    not_deleted = or_(Lead.is_deleted == False, Lead.is_deleted.is_(None))
    rows = db.query(
        User.name,
        func.count(Lead.id).label("leads"),
        func.sum(case((and_(or_(Lead.stage == LeadStage.won, Lead.stage == "won"), not_deleted), 1), else_=0)).label("won"),
    ).filter(User.org_id == current_user.org_id).join(Lead, and_(Lead.assigned_to == User.id, not_deleted), isouter=True).group_by(User.id, User.name).all()
    return [{"agent": r[0], "leads": r[1], "won": r[2]} for r in rows]


@router.get("/ai-insights")
async def get_ai_insights(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("dashboard", "read")),
):
    try:
        leads = (
            db.query(Lead)
            .filter(Lead.org_id == current_user.org_id, or_(Lead.is_deleted == False, Lead.is_deleted.is_(None)))
            .order_by(Lead.created_at.desc())
            .limit(30)
            .all()
        )

        leads_list = []
        for l in leads:
            leads_list.append({
                "id": l.id,
                "name": l.customer.name if l.customer else "Unknown",
                "phone": l.customer.phone if l.customer else "",
                "source": l.source.value if hasattr(l.source, "value") else (l.source or "manual"),
                "stage": l.stage.value if hasattr(l.stage, "value") else (l.stage or "fresh"),
                "destination": l.destination,
                "trip_type": l.trip_type,
                "budget": l.budget,
                "notes": l.notes
            })

        return await generate_dashboard_insights(leads_list)
    except Exception as e:
        print(f"[ai-insights] Error: {e}")
        return {"insights": []}


@router.get("/active-tours")
def get_active_tours(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("dashboard", "read")),
):
    not_deleted = or_(Lead.is_deleted == False, Lead.is_deleted == None)
    rows = (
        db.query(Lead, Customer)
        .outerjoin(Customer, Lead.customer_id == Customer.id)
        .filter(
            Lead.org_id == current_user.org_id,
            Lead.stage == LeadStage.won,
            Lead.travel_date != None,
            not_deleted,
        )
        .all()
    )

    today = datetime.utcnow().date()
    tours = []

    for lead, customer in rows:
        dt = lead.travel_date
        if not dt:
            continue
        start_date = dt.date() if isinstance(dt, datetime) else dt

        if lead.num_days and lead.num_days > 0:
            days = lead.num_days
        elif lead.num_nights and lead.num_nights > 0:
            days = lead.num_nights + 1
        else:
            days = 1
        end_date = start_date + timedelta(days=max(days - 1, 0))

        # Condition 2: Active until last date (today <= end_date)
        if today <= end_date:
            days_remaining = (end_date - today).days
            starts_in = (start_date - today).days if start_date > today else 0
            is_ongoing = start_date <= today <= end_date

            tours.append({
                "lead_id": lead.id,
                "customer_name": customer.name if customer else "Unknown",
                "customer_phone": customer.phone if customer else "",
                "destination": lead.destination or "Destination Not Set",
                "num_days": days,
                "num_nights": lead.num_nights or (days - 1 if days > 1 else 0),
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat(),
                "is_ongoing": is_ongoing,
                "status": "ongoing" if is_ongoing else "upcoming",
                "remaining_days": days_remaining,
                "starts_in_days": starts_in,
            })

    tours.sort(key=lambda t: t["start_date"])
    return tours

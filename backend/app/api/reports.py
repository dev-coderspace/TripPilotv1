from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, desc
from datetime import datetime, date
import calendar

from app.core.database import get_db
from app.core.security import get_current_user, require_permission
from app.models.lead_payment import LeadPayment
from app.models.lead import Lead
from app.models.customer import Customer
from app.models.user import User

router = APIRouter()


def _parse_date(dt_val) -> Optional[datetime]:
    if dt_val is None:
        return None
    if isinstance(dt_val, datetime):
        return dt_val
    if isinstance(dt_val, date):
        return datetime(dt_val.year, dt_val.month, dt_val.day)
    if isinstance(dt_val, str):
        try:
            clean_str = dt_val.replace("Z", "").replace(" ", "T")
            return datetime.fromisoformat(clean_str)
        except Exception:
            return None
    return None


@router.get("/payment")
def get_payment_report(
    year: Optional[int] = Query(None, description="Filter by year e.g. 2026"),
    month: Optional[int] = Query(None, description="Filter by month 1-12"),
    payment_method: Optional[str] = Query(None, description="Filter by payment method"),
    payment_type: Optional[str] = Query(None, description="Filter by payment type"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("leads", "read")),
):
    not_deleted = or_(Lead.is_deleted == False, Lead.is_deleted == None)

    # Base query joined with Lead, Customer, and User using OUTERJOINs for safety
    query = (
        db.query(LeadPayment, Lead, Customer, User)
        .join(Lead, LeadPayment.lead_id == Lead.id)
        .outerjoin(Customer, Lead.customer_id == Customer.id)
        .outerjoin(User, LeadPayment.created_by == User.id)
        .filter(LeadPayment.org_id == current_user.org_id, not_deleted)
    )

    if payment_method and payment_method != "all":
        query = query.filter(LeadPayment.payment_method == payment_method)
    if payment_type and payment_type != "all":
        query = query.filter(LeadPayment.payment_type == payment_type)

    all_records = query.order_by(desc(LeadPayment.payment_date)).all()

    # Calculate available years dynamically across all org payment records
    extracted_years = set()
    for payment, _, _, _ in all_records:
        pdate = _parse_date(payment.payment_date)
        if pdate:
            extracted_years.add(pdate.year)

    current_yr = datetime.utcnow().year
    extracted_years.add(current_yr)
    available_years = sorted(list(extracted_years), reverse=True)

    # Perform year & month filtering in Python for 100% DB engine independence (SQLite / MySQL / Postgres)
    filtered_results = []
    for payment, lead, customer, creator in all_records:
        pdate = _parse_date(payment.payment_date)
        if year is not None and pdate and pdate.year != year:
            continue
        if month is not None and pdate and pdate.month != month:
            continue
        filtered_results.append((payment, lead, customer, creator))

    total_earnings = 0.0
    total_transactions = len(filtered_results)
    full_payments_total = 0.0
    partial_payments_total = 0.0

    by_method_map: dict[str, float] = {}
    by_method_count: dict[str, int] = {}
    by_type_map: dict[str, float] = {}
    by_type_count: dict[str, int] = {}
    by_month_map = {m: 0.0 for m in range(1, 13)}
    by_month_count = {m: 0 for m in range(1, 13)}
    by_day_map: dict[int, float] = {}
    by_day_count: dict[int, int] = {}

    if year and month:
        _, num_days = calendar.monthrange(year, month)
        for d in range(1, num_days + 1):
            by_day_map[d] = 0.0
            by_day_count[d] = 0

    payments_list = []

    for payment, lead, customer, creator in filtered_results:
        amt = float(payment.amount or 0.0)
        total_earnings += amt

        # Payment type
        ptype = payment.payment_type.value if hasattr(payment.payment_type, "value") else str(payment.payment_type)
        if ptype == "full":
            full_payments_total += amt
        else:
            partial_payments_total += amt

        by_type_map[ptype] = by_type_map.get(ptype, 0.0) + amt
        by_type_count[ptype] = by_type_count.get(ptype, 0) + 1

        # Payment method
        pmethod = payment.payment_method.value if hasattr(payment.payment_method, "value") else str(payment.payment_method)
        by_method_map[pmethod] = by_method_map.get(pmethod, 0.0) + amt
        by_method_count[pmethod] = by_method_count.get(pmethod, 0) + 1

        # Date breakdown
        pdate = _parse_date(payment.payment_date)
        if pdate:
            by_month_map[pdate.month] = by_month_map.get(pdate.month, 0.0) + amt
            by_month_count[pdate.month] = by_month_count.get(pdate.month, 0) + 1
            if year and month and pdate.year == year and pdate.month == month:
                by_day_map[pdate.day] = by_day_map.get(pdate.day, 0.0) + amt
                by_day_count[pdate.day] = by_day_count.get(pdate.day, 0) + 1

        payments_list.append({
            "id": payment.id,
            "lead_id": payment.lead_id,
            "customer_name": customer.name if customer else "Unknown",
            "customer_phone": customer.phone if customer else "",
            "destination": lead.destination if lead else "",
            "amount": amt,
            "payment_type": ptype,
            "payment_method": pmethod,
            "payment_date": pdate.isoformat() if pdate else None,
            "reference_number": payment.reference_number,
            "notes": payment.notes,
            "created_by_name": creator.name if creator else "System",
            "created_at": payment.created_at.isoformat() if payment.created_at else None,
        })

    avg_payment = round(total_earnings / total_transactions, 2) if total_transactions > 0 else 0.0

    month_names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    by_month_list = [
        {
            "month": m,
            "month_name": month_names[m - 1],
            "total_amount": round(by_month_map[m], 2),
            "transaction_count": by_month_count[m],
        }
        for m in range(1, 13)
    ]

    by_day_list = []
    if year and month:
        by_day_list = [
            {
                "day": d,
                "label": f"{d} {month_names[month - 1]}",
                "total_amount": round(by_day_map.get(d, 0.0), 2),
                "transaction_count": by_day_count.get(d, 0),
            }
            for d in sorted(by_day_map.keys())
        ]

    by_method_list = [
        {
            "method": method,
            "label": method.replace("_", " ").title(),
            "total_amount": round(amt, 2),
            "percentage": round((amt / total_earnings * 100), 1) if total_earnings > 0 else 0.0,
            "transaction_count": by_method_count.get(method, 0),
        }
        for method, amt in by_method_map.items()
    ]

    by_type_list = [
        {
            "type": ptype,
            "label": ptype.title() + " Payment",
            "total_amount": round(amt, 2),
            "percentage": round((amt / total_earnings * 100), 1) if total_earnings > 0 else 0.0,
            "transaction_count": by_type_count.get(ptype, 0),
        }
        for ptype, amt in by_type_map.items()
    ]

    return {
        "summary": {
            "total_earnings": round(total_earnings, 2),
            "total_transactions": total_transactions,
            "avg_payment": avg_payment,
            "full_payments_total": round(full_payments_total, 2),
            "partial_payments_total": round(partial_payments_total, 2),
        },
        "available_years": available_years,
        "by_month": by_month_list,
        "by_day": by_day_list,
        "by_method": by_method_list,
        "by_type": by_type_list,
        "payments": payments_list,
    }

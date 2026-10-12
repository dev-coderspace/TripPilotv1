from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, desc
from datetime import datetime, date
import calendar

from app.core.database import get_db
from app.core.security import get_current_user, require_permission
from app.models.lead_payment import LeadPayment
from app.models.lead_expense import LeadExpense, ExpenseCategory
from app.models.lead_costing import LeadCosting
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


@router.get("/profit-loss")
def get_profit_loss_report(
    year: Optional[int] = Query(None, description="Filter by year e.g. 2026"),
    month: Optional[int] = Query(None, description="Filter by month 1-12"),
    date_from: Optional[date] = Query(None, description="Filter start date YYYY-MM-DD"),
    date_to: Optional[date] = Query(None, description="Filter end date YYYY-MM-DD"),
    date_basis: Optional[str] = Query("created_at", description="Date field to filter: created_at | travel_date"),
    status: Optional[str] = Query(None, description="Filter by status: all | profit | loss | breakeven"),
    destination: Optional[str] = Query(None, description="Filter by destination"),
    search: Optional[str] = Query(None, description="Search lead ID, customer, phone, destination"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("leads", "read")),
):
    not_deleted = or_(Lead.is_deleted == False, Lead.is_deleted == None)

    # 1. Fetch all non-deleted leads for current organization with their customer
    all_leads_query = (
        db.query(Lead, Customer)
        .outerjoin(Customer, Lead.customer_id == Customer.id)
        .filter(Lead.org_id == current_user.org_id, not_deleted)
        .order_by(desc(Lead.created_at))
        .all()
    )

    lead_ids = [lead.id for lead, _ in all_leads_query]

    # Extract all available years across the organization's leads and records
    extracted_years = set()
    current_yr = datetime.utcnow().year
    extracted_years.add(current_yr)

    destinations_set = set()

    for lead, _ in all_leads_query:
        if lead.destination:
            destinations_set.add(lead.destination.strip())
        c_dt = _parse_date(lead.created_at)
        if c_dt:
            extracted_years.add(c_dt.year)
        t_dt = _parse_date(lead.travel_date)
        if t_dt:
            extracted_years.add(t_dt.year)

    # 2. Batch fetch Costings, Payments, and Expenses for fast O(1) in-memory lookup
    costings_by_lead: dict[int, LeadCosting] = {}
    payments_by_lead: dict[int, list[LeadPayment]] = {}
    expenses_by_lead: dict[int, list[LeadExpense]] = {}

    if lead_ids:
        all_costings = db.query(LeadCosting).filter(LeadCosting.lead_id.in_(lead_ids)).all()
        for c in all_costings:
            costings_by_lead[c.lead_id] = c

        all_payments = (
            db.query(LeadPayment)
            .filter(LeadPayment.lead_id.in_(lead_ids), LeadPayment.org_id == current_user.org_id)
            .order_by(LeadPayment.payment_date.desc())
            .all()
        )
        for p in all_payments:
            payments_by_lead.setdefault(p.lead_id, []).append(p)
            p_dt = _parse_date(p.payment_date)
            if p_dt:
                extracted_years.add(p_dt.year)

        all_expenses = (
            db.query(LeadExpense)
            .filter(LeadExpense.lead_id.in_(lead_ids), LeadExpense.org_id == current_user.org_id)
            .order_by(LeadExpense.created_at.desc())
            .all()
        )
        for e in all_expenses:
            expenses_by_lead.setdefault(e.lead_id, []).append(e)
            e_dt = _parse_date(e.payment_date or e.created_at)
            if e_dt:
                extracted_years.add(e_dt.year)

    available_years = sorted(list(extracted_years), reverse=True)
    available_destinations = sorted([d for d in destinations_set if d])

    # 3. Filter and aggregate lead financials
    lead_items = []
    month_names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

    # Trend aggregators
    by_month_revenue = {m: 0.0 for m in range(1, 13)}
    by_month_expenses = {m: 0.0 for m in range(1, 13)}
    by_month_profit = {m: 0.0 for m in range(1, 13)}
    by_month_leads = {m: 0 for m in range(1, 13)}

    by_day_revenue: dict[int, float] = {}
    by_day_expenses: dict[int, float] = {}
    by_day_profit: dict[int, float] = {}
    by_day_leads: dict[int, int] = {}

    if year and month:
        _, num_days = calendar.monthrange(year, month)
        for d in range(1, num_days + 1):
            by_day_revenue[d] = 0.0
            by_day_expenses[d] = 0.0
            by_day_profit[d] = 0.0
            by_day_leads[d] = 0

    expense_cat_totals: dict[str, float] = {}
    expense_cat_counts: dict[str, int] = {}

    dest_revenue_map: dict[str, float] = {}
    dest_expense_map: dict[str, float] = {}
    dest_profit_map: dict[str, float] = {}
    dest_count_map: dict[str, int] = {}

    total_revenue_sum = 0.0
    total_received_sum = 0.0
    total_expenses_sum = 0.0
    total_quoted_sum = 0.0
    total_outstanding_sum = 0.0

    profitable_count = 0
    loss_count = 0
    breakeven_count = 0

    for lead, customer in all_leads_query:
        # Determine reference date for filtering based on date_basis
        if date_basis == "travel_date":
            ref_dt = _parse_date(lead.travel_date) or _parse_date(lead.created_at)
        else:
            ref_dt = _parse_date(lead.created_at)

        # Year filter
        if year is not None and ref_dt and ref_dt.year != year:
            continue
        # Month filter
        if month is not None and ref_dt and ref_dt.month != month:
            continue
        # Date range filters
        if date_from is not None and ref_dt and ref_dt.date() < date_from:
            continue
        if date_to is not None and ref_dt and ref_dt.date() > date_to:
            continue

        # Destination filter
        if destination and destination != "all":
            if not (lead.destination and destination.lower() in lead.destination.lower()):
                continue

        # Search filter
        if search:
            s_clean = search.strip().lower()
            c_name = (customer.name or "").lower() if customer else ""
            c_phone = (customer.phone or "").lower() if customer else ""
            c_email = (customer.email or "").lower() if customer else ""
            l_dest = (lead.destination or "").lower()
            if not (
                s_clean in str(lead.id)
                or s_clean in c_name
                or s_clean in c_phone
                or s_clean in c_email
                or s_clean in l_dest
            ):
                continue

        # Financial Calculations for this Lead
        c_record = costings_by_lead.get(lead.id)
        p_records = payments_by_lead.get(lead.id, [])
        e_records = expenses_by_lead.get(lead.id, [])

        quoted_price = float(c_record.customer_price or 0.0) if c_record else 0.0
        b2b_cost = float(c_record.b2b_cost or 0.0) if c_record else 0.0
        total_received = sum(float(p.amount or 0.0) for p in p_records)
        total_expense = sum(float(e.amount or 0.0) for e in e_records)

        # Revenue logic: Quoted price takes precedence if set, otherwise total received payments
        recognized_income = quoted_price if quoted_price > 0 else total_received
        net_profit = round(recognized_income - total_expense, 2)
        realized_profit = round(total_received - total_expense, 2)
        margin_pct = (
            round((net_profit / recognized_income * 100), 1) if recognized_income > 0 else 0.0
        )
        outstanding = max(0.0, round(recognized_income - total_received, 2))

        # Status identification
        if net_profit > 0:
            lead_status = "profit"
        elif net_profit < 0:
            lead_status = "loss"
        else:
            lead_status = "breakeven"

        # Status filter
        if status and status != "all":
            if lead_status != status:
                continue

        # Count categorization
        if lead_status == "profit":
            profitable_count += 1
        elif lead_status == "loss":
            loss_count += 1
        else:
            breakeven_count += 1

        total_revenue_sum += recognized_income
        total_received_sum += total_received
        total_quoted_sum += quoted_price
        total_expenses_sum += total_expense
        total_outstanding_sum += outstanding

        # Breakdown of expenses for this lead
        lead_expense_breakdown: dict[str, float] = {}
        for e in e_records:
            cat_name = e.category.value if hasattr(e.category, "value") else str(e.category)
            e_amt = float(e.amount or 0.0)
            lead_expense_breakdown[cat_name] = lead_expense_breakdown.get(cat_name, 0.0) + e_amt
            expense_cat_totals[cat_name] = expense_cat_totals.get(cat_name, 0.0) + e_amt
            expense_cat_counts[cat_name] = expense_cat_counts.get(cat_name, 0) + 1

        # Destination aggregation
        dest_key = (lead.destination or "Unspecified").strip()
        dest_revenue_map[dest_key] = dest_revenue_map.get(dest_key, 0.0) + recognized_income
        dest_expense_map[dest_key] = dest_expense_map.get(dest_key, 0.0) + total_expense
        dest_profit_map[dest_key] = dest_profit_map.get(dest_key, 0.0) + net_profit
        dest_count_map[dest_key] = dest_count_map.get(dest_key, 0) + 1

        # Trend aggregation
        if ref_dt:
            m = ref_dt.month
            by_month_revenue[m] += recognized_income
            by_month_expenses[m] += total_expense
            by_month_profit[m] += net_profit
            by_month_leads[m] += 1

            if year and month and ref_dt.year == year and ref_dt.month == month:
                d = ref_dt.day
                if d in by_day_revenue:
                    by_day_revenue[d] += recognized_income
                    by_day_expenses[d] += total_expense
                    by_day_profit[d] += net_profit
                    by_day_leads[d] += 1

        lead_items.append({
            "lead_id": lead.id,
            "customer_name": customer.name if customer else "Unknown Customer",
            "customer_phone": customer.phone if customer else "",
            "customer_email": customer.email if customer else "",
            "destination": lead.destination or "—",
            "stage": lead.stage or "fresh",
            "travel_date": lead.travel_date.isoformat() if lead.travel_date else None,
            "created_at": lead.created_at.isoformat() if lead.created_at else None,
            "quoted_price": round(quoted_price, 2),
            "b2b_cost": round(b2b_cost, 2),
            "total_received": round(total_received, 2),
            "recognized_income": round(recognized_income, 2),
            "total_expense": round(total_expense, 2),
            "net_profit": net_profit,
            "realized_profit": realized_profit,
            "margin_percent": margin_pct,
            "customer_outstanding": round(outstanding, 2),
            "status": lead_status,
            "expense_count": len(e_records),
            "payment_count": len(p_records),
            "expenses_breakdown": lead_expense_breakdown,
        })

    # Sort leads by net_profit descending by default
    lead_items.sort(key=lambda x: x["net_profit"], reverse=True)

    net_overall_profit = round(total_revenue_sum - total_expenses_sum, 2)
    overall_margin = (
        round((net_overall_profit / total_revenue_sum * 100), 1) if total_revenue_sum > 0 else 0.0
    )

    # 4. Monthly Trend List
    by_month_list = [
        {
            "month": m,
            "month_name": month_names[m - 1],
            "revenue": round(by_month_revenue[m], 2),
            "expenses": round(by_month_expenses[m], 2),
            "net_profit": round(by_month_profit[m], 2),
            "margin_percent": (
                round((by_month_profit[m] / by_month_revenue[m] * 100), 1)
                if by_month_revenue[m] > 0
                else 0.0
            ),
            "leads_count": by_month_leads[m],
        }
        for m in range(1, 13)
    ]

    # Daily Trend List
    by_day_list = []
    if year and month:
        by_day_list = [
            {
                "day": d,
                "label": f"{d} {month_names[month - 1]}",
                "revenue": round(by_day_revenue.get(d, 0.0), 2),
                "expenses": round(by_day_expenses.get(d, 0.0), 2),
                "net_profit": round(by_day_profit.get(d, 0.0), 2),
                "leads_count": by_day_leads.get(d, 0),
            }
            for d in sorted(by_day_revenue.keys())
        ]

    # Expense Categories List
    cat_labels = {
        "hotel": "Hotels & Stays",
        "flight": "Flight Bookings",
        "b2b_partner": "B2B Partners / DMCs",
        "activity": "Activities & Sightseeing",
        "visa": "Visa Processing",
        "insurance": "Travel Insurance",
        "other": "Other Expenses",
    }
    by_expense_category = [
        {
            "category": cat,
            "label": cat_labels.get(cat, cat.replace("_", " ").title()),
            "total_amount": round(amt, 2),
            "count": expense_cat_counts.get(cat, 0),
            "percentage": (
                round((amt / total_expenses_sum * 100), 1) if total_expenses_sum > 0 else 0.0
            ),
        }
        for cat, amt in sorted(expense_cat_totals.items(), key=lambda x: x[1], reverse=True)
    ]

    # Top Destinations Breakdown
    by_destination = [
        {
            "destination": dest,
            "revenue": round(dest_revenue_map[dest], 2),
            "expenses": round(dest_expense_map[dest], 2),
            "net_profit": round(dest_profit_map[dest], 2),
            "margin_percent": (
                round((dest_profit_map[dest] / dest_revenue_map[dest] * 100), 1)
                if dest_revenue_map[dest] > 0
                else 0.0
            ),
            "leads_count": dest_count_map[dest],
        }
        for dest in sorted(dest_revenue_map.keys(), key=lambda x: dest_profit_map[x], reverse=True)
    ][:10]

    # 5. Smart Financial Suggestions Engine
    suggestions = []

    loss_leads = [item for item in lead_items if item["status"] == "loss"]
    if loss_leads:
        total_loss_val = sum(abs(item["net_profit"]) for item in loss_leads)
        worst_lead = min(loss_leads, key=lambda x: x["net_profit"])
        suggestions.append({
            "type": "critical",
            "title": f"Negative Margin on {len(loss_leads)} Lead{'s' if len(loss_leads) > 1 else ''}",
            "message": f"{len(loss_leads)} booking(s) generated a net loss totaling ₹{total_loss_val:,.0f}. For example, Lead #{worst_lead['lead_id']} ({worst_lead['destination']}) incurred ₹{worst_lead['total_expense']:,.0f} in expenses against ₹{worst_lead['recognized_income']:,.0f} in revenue.",
            "action": "Audit supplier rates before confirming custom quotes. Consider requiring a 10-15% safety buffer on unbundled components.",
            "metric": f"-₹{total_loss_val:,.0f} Loss",
        })

    if total_expenses_sum > 0:
        for cat_data in by_expense_category:
            if cat_data["percentage"] >= 45 and cat_data["total_amount"] > 0:
                suggestions.append({
                    "type": "warning",
                    "title": f"Heavy Cost Concentration: {cat_data['label']}",
                    "message": f"{cat_data['label']} represents {cat_data['percentage']}% (₹{cat_data['total_amount']:,.0f}) of all your expenses during this period.",
                    "action": f"Negotiate bulk rates or seasonal contracted pricing with primary {cat_data['label']} vendors to improve overall package margins.",
                    "metric": f"{cat_data['percentage']}% of Costs",
                })
                break

    if total_outstanding_sum > 0 and total_revenue_sum > 0:
        outstanding_pct = round((total_outstanding_sum / total_revenue_sum * 100), 1)
        if outstanding_pct >= 15:
            suggestions.append({
                "type": "warning",
                "title": f"Uncollected Receivables: ₹{total_outstanding_sum:,.0f}",
                "message": f"{outstanding_pct}% of your booked revenue is still pending customer collection. Delaying collection increases cash flow risks.",
                "action": "Set milestone payments: Collect 50% deposit on booking and 100% full payment at least 7 days before departure.",
                "metric": f"₹{total_outstanding_sum:,.0f} Pending",
            })

    profitable_destinations = [d for d in by_destination if d["net_profit"] > 0 and d["leads_count"] >= 1]
    if profitable_destinations:
        best_dest = max(profitable_destinations, key=lambda x: x["margin_percent"])
        if best_dest["margin_percent"] >= 15:
            suggestions.append({
                "type": "opportunity",
                "title": f"Top Profit Engine: {best_dest['destination']}",
                "message": f"{best_dest['destination']} achieves your highest margin at {best_dest['margin_percent']}% with ₹{best_dest['net_profit']:,.0f} profit.",
                "action": f"Allocate more marketing and social campaign budget toward promoting {best_dest['destination']} itineraries.",
                "metric": f"{best_dest['margin_percent']}% Margin",
            })

    low_margin_leads = [
        item for item in lead_items
        if item["status"] == "profit" and 0 < item["margin_percent"] < 12 and item["recognized_income"] > 0
    ]
    if len(low_margin_leads) >= 2:
        suggestions.append({
            "type": "tip",
            "title": f"Optimize Thin Margins ({len(low_margin_leads)} Leads < 12%)",
            "message": f"{len(low_margin_leads)} leads have profit margins below 12%, leaving very small margins for currency fluctuations or incidental costs.",
            "action": "Upsell high-margin extras (travel insurance, private guided excursions, airport lounge access) to lift margins.",
            "metric": f"{len(low_margin_leads)} Bookings",
        })

    if overall_margin >= 25 and not loss_leads:
        suggestions.append({
            "type": "success",
            "title": "Superb Profitability Health",
            "message": f"Your overall net profit margin of {overall_margin:.1f}% comfortably beats standard travel agency benchmarks (15-20%) with zero loss-making leads.",
            "action": "Standardize these itinerary templates across your sales agents to maintain strong margins.",
            "metric": f"{overall_margin:.1f}% Margin",
        })

    if not suggestions:
        suggestions.append({
            "type": "tip",
            "title": "Financial Health Steady",
            "message": "Keep logging all itemized supplier expenses and customer payments promptly to maintain precise real-time profitability tracking.",
            "action": "Ensure all lead costings have accurate customer prices and B2B costs filled in.",
            "metric": "Steady",
        })

    return {
        "summary": {
            "total_revenue": round(total_revenue_sum, 2),
            "total_received": round(total_received_sum, 2),
            "total_quoted": round(total_quoted_sum, 2),
            "total_expenses": round(total_expenses_sum, 2),
            "net_profit": net_overall_profit,
            "realized_profit": round(total_received_sum - total_expenses_sum, 2),
            "margin_percent": overall_margin,
            "total_outstanding": round(total_outstanding_sum, 2),
            "total_leads_count": len(lead_items),
            "profitable_leads_count": profitable_count,
            "loss_leads_count": loss_count,
            "breakeven_leads_count": breakeven_count,
        },
        "available_years": available_years,
        "available_destinations": available_destinations,
        "by_month": by_month_list,
        "by_day": by_day_list,
        "by_expense_category": by_expense_category,
        "by_destination": by_destination,
        "suggestions": suggestions,
        "leads": lead_items,
    }


"""
Reports & Export Service:
Generates datasets, PDF documents, and Excel spreadsheets for all 5 FleetFlow reports:
1. Fleet Utilization Report
2. Fuel Consumption Report
3. Driver Performance Report
4. Delivery Performance Report
5. Maintenance Report
"""

import io
from datetime import datetime, date, timedelta
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.vehicle import Vehicle, VehicleStatusEnum
from app.models.driver import Driver
from app.models.user import User
from app.models.shipment import Shipment, ShipmentStatusEnum
from app.models.trip import Trip, TripStatusEnum
from app.models.maintenance import Maintenance

from app.models.fuel_record import FuelRecord
from app.models.attendance import Attendance

from reportlab.lib.pagesizes import letter, landscape
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter


# ==========================================
# 1. DATASET GENERATORS & TIMEZONE HELPERS
# ==========================================

def get_ist_datetime_range(start_date: Optional[date], end_date: Optional[date]) -> tuple[Optional[datetime], Optional[datetime]]:
    """
    Converts local IST date boundaries (start_date, end_date) to UTC datetime
    boundaries for querying UTC-timestamped columns (e.g. created_at).
    IST is UTC + 5:30.
    start_date 00:00:00 IST = (start_date 00:00:00) - 5h 30m in UTC.
    end_date 23:59:59.999999 IST = (end_date 23:59:59.999999) - 5h 30m in UTC.
    """
    start_utc = None
    end_utc = None
    if start_date:
        start_utc = datetime.combine(start_date, datetime.min.time()) - timedelta(hours=5, minutes=30)
    if end_date:
        end_utc = datetime.combine(end_date, datetime.max.time()) - timedelta(hours=5, minutes=30)
    return start_utc, end_utc


def _to_date(val: Any) -> Optional[date]:
    if not val:
        return None
    if isinstance(val, datetime):
        return val.date()
    if isinstance(val, date):
        return val
    if isinstance(val, str):
        try:
            return date.fromisoformat(val[:10])
        except Exception:
            return None
    return None


def _get_record_ist_date(date_val: Any, dt_val: Optional[datetime]) -> Optional[date]:
    """Returns local IST date for a record given either a date/string or a UTC datetime."""
    if date_val:
        d = _to_date(date_val)
        if d:
            return d
    if dt_val:
        return (dt_val + timedelta(hours=5, minutes=30)).date()
    return None


def get_fleet_utilization_data(db: Session, start_date: Optional[date] = None, end_date: Optional[date] = None) -> Dict[str, Any]:
    vehicles = db.query(Vehicle).all()
    total_vehicles = len(vehicles)
    
    start_utc, end_utc = get_ist_datetime_range(start_date, end_date)
    trip_query = db.query(Trip)
    if start_utc:
        trip_query = trip_query.filter(Trip.created_at >= start_utc)
    if end_utc:
        trip_query = trip_query.filter(Trip.created_at <= end_utc)
    period_trips = trip_query.all()
    active_vehicle_ids = {t.vehicle_id for t in period_trips if t.vehicle_id}

    available_cnt = sum(1 for v in vehicles if v.status == VehicleStatusEnum.Available)
    assigned_cnt = sum(1 for v in vehicles if v.status == VehicleStatusEnum.Assigned)
    transit_cnt = sum(1 for v in vehicles if v.status == VehicleStatusEnum.InTransit)
    maint_cnt = sum(1 for v in vehicles if v.status == VehicleStatusEnum.Maintenance)
    
    is_filtered = bool(start_date or end_date)
    if is_filtered:
        active_in_use = len(active_vehicle_ids)
        utilization_rate = round((active_in_use / total_vehicles * 100), 1) if total_vehicles > 0 else 0.0
        display_vehicles = [v for v in vehicles if v.vehicle_id in active_vehicle_ids]
    else:
        active_in_use = assigned_cnt + transit_cnt
        utilization_rate = round((active_in_use / total_vehicles * 100), 1) if total_vehicles > 0 else 0.0
        display_vehicles = vehicles

    items = []
    for v in display_vehicles:
        driver_name = "Unassigned"
        if v.assigned_driver_id:
            drv = db.query(Driver).filter(Driver.driver_id == v.assigned_driver_id).first()
            if drv and drv.user_id:
                usr = db.query(User).filter(User.user_id == drv.user_id).first()
                if usr:
                    driver_name = usr.full_name

        veh_trips = [t for t in period_trips if t.vehicle_id == v.vehicle_id]
        v_dist = sum(t.distance or 0.0 for t in veh_trips if t.status == TripStatusEnum.Completed)

        items.append({
            "registration_number": v.registration_number,
            "brand_model": f"{v.brand} {v.model}",
            "vehicle_type": v.vehicle_type or "Truck",
            "capacity": f"{v.capacity} T" if v.capacity else "N/A",
            "fuel_type": v.fuel_type or "Diesel",
            "status": v.status or "Available",
            "assigned_driver": driver_name,
            "period_trips": len(veh_trips),
            "period_distance_km": round(v_dist, 1),
        })

    return {
        "report_title": "Fleet Utilization Report",
        "generated_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
        "date_range": f"{start_date or 'All Time'} to {end_date or 'Present'}",
        "summary": {
            "total_vehicles": total_vehicles if not is_filtered else len(items),
            "available_count": available_cnt if not is_filtered else 0,
            "assigned_count": assigned_cnt if not is_filtered else 0,
            "in_transit_count": transit_cnt if not is_filtered else 0,
            "maintenance_count": maint_cnt if not is_filtered else 0,
            "utilization_rate_pct": utilization_rate,
            "active_vehicles_in_period": active_in_use,
            "total_period_trips": len(period_trips),
        },
        "records": items,
    }


def get_fuel_consumption_data(db: Session, start_date: Optional[date] = None, end_date: Optional[date] = None) -> Dict[str, Any]:
    all_records = db.query(FuelRecord).all()
    filtered_records = []
    for r in all_records:
        rec_d = _get_record_ist_date(r.refill_date, r.created_at)
        if not rec_d:
            continue
        if start_date and rec_d < start_date:
            continue
        if end_date and rec_d > end_date:
            continue
        filtered_records.append(r)

    # Group by vehicle
    veh_map: Dict[Any, List[FuelRecord]] = {}
    for r in filtered_records:
        if r.vehicle_id:
            veh_map.setdefault(r.vehicle_id, []).append(r)

    start_utc, end_utc = get_ist_datetime_range(start_date, end_date)
    items = []
    total_litres_all = 0.0
    total_cost_all = 0.0
    total_distance_all = 0.0

    for vid, recs in veh_map.items():
        veh = db.query(Vehicle).filter(Vehicle.vehicle_id == vid).first()
        if not veh:
            continue

        tot_litres = sum(r.litres or 0.0 for r in recs)
        tot_cost = sum(r.total_cost or (r.litres * r.price_per_litre) for r in recs)
        
        # Trip distance for this vehicle in period
        trip_q = db.query(Trip).filter(Trip.vehicle_id == vid, Trip.status == TripStatusEnum.Completed)
        if start_utc:
            trip_q = trip_q.filter(Trip.created_at >= start_utc)
        if end_utc:
            trip_q = trip_q.filter(Trip.created_at <= end_utc)
        trips = trip_q.all()
        tot_dist = sum(t.distance or 0.0 for t in trips)
        efficiency = round(tot_dist / tot_litres, 2) if tot_litres > 0 and tot_dist > 0 else 0.0

        driver_name = "Unassigned"
        if veh.assigned_driver_id:
            drv = db.query(Driver).filter(Driver.driver_id == veh.assigned_driver_id).first()
            if drv and drv.user_id:
                usr = db.query(User).filter(User.user_id == drv.user_id).first()
                if usr:
                    driver_name = usr.full_name

        total_litres_all += tot_litres
        total_cost_all += tot_cost
        total_distance_all += tot_dist

        items.append({
            "registration_number": veh.registration_number,
            "model": f"{veh.brand} {veh.model}",
            "assigned_driver": driver_name,
            "refill_count": len(recs),
            "total_litres": round(tot_litres, 1),
            "total_cost": round(tot_cost, 2),
            "total_distance_km": round(tot_dist, 1),
            "fuel_efficiency_kml": efficiency,
            "status": veh.status,
        })

    avg_eff = round(total_distance_all / total_litres_all, 2) if total_litres_all > 0 and total_distance_all > 0 else 0.0

    return {
        "report_title": "Fuel Consumption & Efficiency Report",
        "generated_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
        "date_range": f"{start_date or 'All Time'} to {end_date or 'Present'}",
        "summary": {
            "vehicles_reported": len(items),
            "total_refills": len(filtered_records),
            "total_litres_consumed": round(total_litres_all, 1),
            "total_fuel_cost": round(total_cost_all, 2),
            "fleet_avg_efficiency_kml": avg_eff,
        },
        "records": items,
    }


def get_driver_performance_data(
    db: Session,
    driver_id: Optional[Any] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
) -> Dict[str, Any]:
    query = db.query(Driver)
    if driver_id:
        query = query.filter(Driver.driver_id == driver_id)
    drivers = query.all()

    start_utc, end_utc = get_ist_datetime_range(start_date, end_date)
    is_filtered = bool(start_date or end_date)

    items = []
    total_completed_trips = 0

    for d in drivers:
        user = db.query(User).filter(User.user_id == d.user_id).first() if d.user_id else None
        driver_name = user.full_name if user else "Driver"

        trip_query = db.query(Trip).filter(Trip.driver_id == d.driver_id)
        if start_utc:
            trip_query = trip_query.filter(Trip.created_at >= start_utc)
        if end_utc:
            trip_query = trip_query.filter(Trip.created_at <= end_utc)
        trips = trip_query.all()
        completed_trips = sum(1 for t in trips if t.status == TripStatusEnum.Completed)
        total_distance = sum(t.distance or 0.0 for t in trips if t.status == TripStatusEnum.Completed)
        
        # On-time shipments calculation
        ship_query = db.query(Shipment).filter(Shipment.driver_id == d.driver_id)
        if start_utc:
            ship_query = ship_query.filter(Shipment.created_at >= start_utc)
        if end_utc:
            ship_query = ship_query.filter(Shipment.created_at <= end_utc)
        shipments = ship_query.all()
        del_count = sum(1 for s in shipments if s.status == ShipmentStatusEnum.Delivered)
        on_time_rate = round((del_count / len(shipments) * 100), 1) if shipments else 100.0

        # Attendance calculation
        att_query = db.query(Attendance).filter(Attendance.driver_id == d.driver_id)
        if start_date:
            att_query = att_query.filter(Attendance.date >= start_date)
        if end_date:
            att_query = att_query.filter(Attendance.date <= end_date)
        attendances = att_query.all()
        total_att = len(attendances)
        present_att = sum(1 for a in attendances if a.status == "Present")
        att_rate = round((present_att / total_att * 100), 1) if total_att > 0 else (0.0 if is_filtered else 100.0)

        # If a date filter is active, only include drivers who have records/activity in this period
        if is_filtered and len(trips) == 0 and len(shipments) == 0 and len(attendances) == 0:
            continue

        total_completed_trips += completed_trips

        items.append({
            "driver_name": driver_name,
            "license_number": d.license_number or "N/A",
            "experience_years": getattr(d, "experience_years", 0) or 0,
            "status": d.status or "Available",
            "trips_completed": completed_trips,
            "total_distance_km": round(total_distance, 1),
            "on_time_rate_pct": on_time_rate,
            "attendance_present_days": f"{present_att}/{total_att}" if total_att > 0 else "0/0",
            "attendance_rate_pct": att_rate,
        })

    return {
        "report_title": "Driver Performance & Attendance Report",
        "generated_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
        "date_range": f"{start_date or 'All Time'} to {end_date or 'Present'}",
        "summary": {
            "total_drivers": len(items),
            "total_completed_trips": total_completed_trips,
        },
        "records": items,
    }


def get_delivery_performance_data(db: Session, start_date: Optional[date] = None, end_date: Optional[date] = None) -> Dict[str, Any]:
    start_utc, end_utc = get_ist_datetime_range(start_date, end_date)
    query = db.query(Shipment)
    if start_utc:
        query = query.filter(Shipment.created_at >= start_utc)
    if end_utc:
        query = query.filter(Shipment.created_at <= end_utc)

    shipments = query.order_by(Shipment.created_at.desc()).all()
    total_count = len(shipments)

    delivered_cnt = sum(1 for s in shipments if s.status == ShipmentStatusEnum.Delivered)
    in_transit_cnt = sum(1 for s in shipments if s.status == ShipmentStatusEnum.InTransit)
    delayed_cnt = sum(1 for s in shipments if s.status == ShipmentStatusEnum.Delayed)
    cancelled_cnt = sum(1 for s in shipments if s.status == ShipmentStatusEnum.Cancelled)

    on_time_rate = round((delivered_cnt / total_count * 100), 1) if total_count > 0 else 0.0

    items = []
    for s in shipments:
        veh = db.query(Vehicle).filter(Vehicle.vehicle_id == s.vehicle_id).first() if s.vehicle_id else None
        drv = db.query(Driver).filter(Driver.driver_id == s.driver_id).first() if s.driver_id else None
        driver_user = db.query(User).filter(User.user_id == drv.user_id).first() if drv and drv.user_id else None

        ist_created = (s.created_at + timedelta(hours=5, minutes=30)) if s.created_at else None
        created_str = ist_created.strftime("%Y-%m-%d") if ist_created else "-"

        items.append({
            "tracking_number": s.tracking_number,
            "customer_name": s.customer_name,
            "route": f"{s.source} → {s.destination}",
            "weight_kg": s.shipment_weight,
            "status": s.status,
            "vehicle": veh.registration_number if veh else "Unassigned",
            "driver": driver_user.full_name if driver_user else "Unassigned",
            "created_date": created_str,
        })

    return {
        "report_title": "Delivery & Shipment Performance Report",
        "generated_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
        "date_range": f"{start_date or 'All Time'} to {end_date or 'Present'}",
        "summary": {
            "total_shipments": total_count,
            "delivered_count": delivered_cnt,
            "in_transit_count": in_transit_cnt,
            "delayed_count": delayed_cnt,
            "cancelled_count": cancelled_cnt,
            "on_time_rate_pct": on_time_rate,
        },
        "records": items,
    }


def get_maintenance_report_data(db: Session, start_date: Optional[date] = None, end_date: Optional[date] = None) -> Dict[str, Any]:
    all_records = db.query(Maintenance).order_by(Maintenance.service_date.desc()).all()
    filtered_records = []
    for r in all_records:
        svc_d = _to_date(r.service_date) or _to_date(r.scheduled_date)
        created_d = (r.created_at + timedelta(hours=5, minutes=30)).date() if r.created_at else None

        in_range = False
        if not start_date and not end_date:
            in_range = True
        else:
            if svc_d and (not start_date or svc_d >= start_date) and (not end_date or svc_d <= end_date):
                in_range = True
            elif created_d and (not start_date or created_d >= start_date) and (not end_date or created_d <= end_date):
                in_range = True

        if not in_range:
            continue
        filtered_records.append(r)

    records = filtered_records
    total_cost = sum(r.cost or 0.0 for r in records)
    completed_cnt = sum(1 for r in records if r.status in ["Completed", "Resolved"])
    
    today = (datetime.utcnow() + timedelta(hours=5, minutes=30)).date()
    upcoming_cnt = 0
    overdue_cnt = 0
    for r in records:
        nsd = _to_date(r.next_service_date)
        if nsd and r.status not in ["Completed", "Resolved"]:
            if today <= nsd <= today + timedelta(days=7):
                upcoming_cnt += 1
            elif nsd < today:
                overdue_cnt += 1

    items = []
    for r in records:
        veh = db.query(Vehicle).filter(Vehicle.vehicle_id == r.vehicle_id).first() if r.vehicle_id else None
        
        svc_str = "-"
        if r.service_date:
            svc_str = r.service_date.strftime("%Y-%m-%d")
        elif r.scheduled_date:
            sd = _to_date(r.scheduled_date)
            if sd:
                svc_str = sd.strftime("%Y-%m-%d")

        items.append({
            "registration_number": veh.registration_number if veh else "Unknown",
            "model": f"{veh.brand} {veh.model}" if veh else "-",
            "maintenance_type": r.maintenance_type,
            "service_date": svc_str,
            "next_service_date": r.next_service_date.strftime("%Y-%m-%d") if r.next_service_date else "-",
            "cost": round(r.cost or 0.0, 2),
            "status": r.status,
            "remarks": r.remarks or "",
        })

    return {
        "report_title": "Vehicle Fleet Maintenance Report",
        "generated_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
        "date_range": f"{start_date or 'All Time'} to {end_date or 'Present'}",
        "summary": {
            "total_records": len(records),
            "total_maintenance_cost": round(total_cost, 2),
            "completed_services": completed_cnt,
            "upcoming_maintenance": upcoming_cnt,
            "overdue_maintenance": overdue_cnt,
        },
        "records": items,
    }


# ==========================================
# 2. PDF EXPORTER (ReportLab)
# ==========================================

def export_report_to_pdf(report_data: Dict[str, Any]) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=landscape(letter), rightMargin=30, leftMargin=30, topMargin=30, bottomMargin=30)
    styles = getSampleStyleSheet()

    # Custom styles
    title_style = ParagraphStyle(
        "ReportTitle",
        parent=styles["Heading1"],
        fontSize=18,
        textColor=colors.HexColor("#1e293b"),
        spaceAfter=6,
    )
    meta_style = ParagraphStyle(
        "ReportMeta",
        parent=styles["Normal"],
        fontSize=9,
        textColor=colors.HexColor("#64748b"),
        spaceAfter=12,
    )
    kpi_style = ParagraphStyle(
        "KPIBox",
        parent=styles["Normal"],
        fontSize=10,
        textColor=colors.HexColor("#0f172a"),
        spaceAfter=14,
    )
    cell_style = ParagraphStyle(
        "TableCell",
        parent=styles["Normal"],
        fontSize=8,
        textColor=colors.HexColor("#1e293b"),
    )
    header_cell_style = ParagraphStyle(
        "TableHeaderCell",
        parent=styles["Normal"],
        fontSize=8,
        textColor=colors.white,
        fontName="Helvetica-Bold",
    )

    story = []

    # Title & Metadata
    story.append(Paragraph(f"FleetFlow — {report_data['report_title']}", title_style))
    story.append(Paragraph(f"Generated: {report_data['generated_at']} | Scope: {report_data.get('date_range', 'Fleet-Wide')}", meta_style))

    # Summary KPI Box
    summary_text = " | ".join([f"<b>{k.replace('_', ' ').upper()}:</b> {v}" for k, v in report_data.get("summary", {}).items() if not isinstance(v, dict)])
    story.append(Paragraph(f"<font color='#2563eb'><b>SUMMARY METRICS:</b></font> {summary_text}", kpi_style))
    story.append(Spacer(1, 8))

    # Records Table
    records = report_data.get("records", [])
    if records:
        headers = [k.replace("_", " ").upper() for k in records[0].keys()]
        table_data = [[Paragraph(h, header_cell_style) for h in headers]]

        for r in records:
            row = [Paragraph(str(v), cell_style) for v in r.values()]
            table_data.append(row)

        t = Table(table_data, repeatRows=1)
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2563eb")),
            ("ALIGN", (0, 0), (-1, -1), "LEFT"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 6),
            ("TOPPADDING", (0, 0), (-1, 0), 6),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ]))
        story.append(t)
    else:
        story.append(Paragraph("No records found for the selected criteria.", meta_style))

    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()


# ==========================================
# 3. EXCEL EXPORTER (OpenPyXL)
# ==========================================

def export_report_to_excel(report_data: Dict[str, Any]) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Report Data"

    # Header style
    header_fill = PatternFill(start_color="2563EB", end_color="2563EB", fill_type="solid")
    header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    title_font = Font(name="Calibri", size=14, bold=True, color="1E293B")
    meta_font = Font(name="Calibri", size=10, italic=True, color="64748B")
    data_font = Font(name="Calibri", size=10, color="0F172A")
    thin_border = Border(
        left=Side(style='thin', color='CBD5E1'),
        right=Side(style='thin', color='CBD5E1'),
        top=Side(style='thin', color='CBD5E1'),
        bottom=Side(style='thin', color='CBD5E1')
    )

    # Title & Metadata
    ws.append([f"FleetFlow — {report_data['report_title']}"])
    ws.cell(row=1, column=1).font = title_font
    ws.append([f"Generated: {report_data['generated_at']} | Scope: {report_data.get('date_range', 'Fleet-Wide')}"])
    ws.cell(row=2, column=1).font = meta_font
    ws.append([])

    # Summary Row
    summary_items = [f"{k.replace('_', ' ').upper()}: {v}" for k, v in report_data.get("summary", {}).items() if not isinstance(v, dict)]
    ws.append(["SUMMARY: " + " | ".join(summary_items)])
    ws.cell(row=4, column=1).font = Font(name="Calibri", size=10, bold=True, color="2563EB")
    ws.append([])

    records = report_data.get("records", [])
    if records:
        headers = [k.replace("_", " ").upper() for k in records[0].keys()]
        ws.append(headers)
        header_row_idx = ws.max_row
        
        for col_num in range(1, len(headers) + 1):
            cell = ws.cell(row=header_row_idx, column=col_num)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center", vertical="center")

        for r in records:
            row_data = list(r.values())
            ws.append(row_data)
            current_row = ws.max_row
            for col_num in range(1, len(row_data) + 1):
                c = ws.cell(row=current_row, column=col_num)
                c.font = data_font
                c.border = thin_border

        # Auto-adjust column widths
        for col in ws.columns:
            max_len = max(len(str(cell.value or "")) for cell in col)
            col_letter = get_column_letter(col[0].column)
            ws.column_dimensions[col_letter].width = max(max_len + 4, 12)
    else:
        ws.append(["No records found for the selected criteria."])
        ws.cell(row=6, column=1).font = meta_font

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return buffer.getvalue()

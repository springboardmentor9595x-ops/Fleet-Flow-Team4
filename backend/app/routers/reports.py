from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.deps import get_current_user, require_roles
from app.models.user import RoleEnum
from app.models.driver import Driver
from app.services.report_export_service import (
    get_fleet_utilization_data,
    get_fuel_consumption_data,
    get_driver_performance_data,
    get_delivery_performance_data,
    get_maintenance_report_data,
    export_report_to_pdf,
    export_report_to_excel,
)

router = APIRouter()


def handle_export_or_json(report_data: dict, export: Optional[str], filename_prefix: str):
    if export == "pdf":
        pdf_bytes = export_report_to_pdf(report_data)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename_prefix}_{date.today().isoformat()}.pdf"},
        )
    elif export == "excel":
        excel_bytes = export_report_to_excel(report_data)
        return Response(
            content=excel_bytes,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={filename_prefix}_{date.today().isoformat()}.xlsx"},
        )
    return report_data


@router.get("/fleet-utilization")
def fleet_utilization_report(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    export: Optional[str] = Query(None),  # 'pdf' | 'excel'
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(RoleEnum.Admin, RoleEnum.FleetManager)),
):
    """
    Fleet Utilization Report: Vehicle status breakdown and utilization percentage.
    Restricted to Admin and Fleet Manager.
    """
    data = get_fleet_utilization_data(db, start_date=start_date, end_date=end_date)
    return handle_export_or_json(data, export, "Fleet_Utilization_Report")


@router.get("/fuel-consumption")
def fuel_consumption_report(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    export: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(RoleEnum.Admin, RoleEnum.FleetManager)),
):
    """
    Fuel Consumption & Efficiency Report: Based on Fuel Records.
    Restricted to Admin and Fleet Manager.
    """
    data = get_fuel_consumption_data(db, start_date=start_date, end_date=end_date)
    return handle_export_or_json(data, export, "Fuel_Consumption_Report")


@router.get("/driver-performance")
def driver_performance_report(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    export: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Driver Performance & Attendance Report.
    - Admin & Fleet Manager: Fleet-wide driver performance.
    - Driver: View/export only own performance summary.
    - Dispatcher: 403 Forbidden.
    """
    if current_user.role == RoleEnum.Dispatcher:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Dispatchers are authorized to view Delivery Performance reports only.",
        )

    driver_id = None
    if current_user.role == RoleEnum.Driver:
        drv = db.query(Driver).filter(Driver.user_id == current_user.user_id).first()
        if not drv:
            raise HTTPException(status_code=404, detail="Driver profile not found")
        driver_id = drv.driver_id

    data = get_driver_performance_data(db, driver_id=driver_id, start_date=start_date, end_date=end_date)
    return handle_export_or_json(data, export, "Driver_Performance_Report")


@router.get("/delivery-performance")
def delivery_performance_report(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    export: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(RoleEnum.Admin, RoleEnum.FleetManager, RoleEnum.Dispatcher)),
):
    """
    Delivery Performance Report: On-time vs delayed shipments, avg delivery metrics.
    Admin, Fleet Manager, and Dispatcher.
    """
    data = get_delivery_performance_data(db, start_date=start_date, end_date=end_date)
    return handle_export_or_json(data, export, "Delivery_Performance_Report")


@router.get("/maintenance")
def maintenance_report(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    export: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(RoleEnum.Admin, RoleEnum.FleetManager)),
):
    """
    Maintenance Report: Cost per vehicle, frequency by type, upcoming and overdue lists.
    Restricted to Admin and Fleet Manager.
    """
    data = get_maintenance_report_data(db, start_date=start_date, end_date=end_date)
    return handle_export_or_json(data, export, "Maintenance_Report")

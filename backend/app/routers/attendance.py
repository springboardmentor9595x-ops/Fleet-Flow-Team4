import uuid
from datetime import date as dt_date, datetime
from typing import Optional, List, Union
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.deps import get_current_user, require_roles
from app.models.user import User, RoleEnum
from app.models.driver import Driver
from app.models.attendance import Attendance
from app.models.leave_request import LeaveRequest
from app.models.driver_rating import DriverRating
from sqlalchemy import func
from app.services.notification_service import dispatch_system_notification

router = APIRouter()


class AttendanceCreate(BaseModel):
    driver_id: UUID
    date: Optional[Union[dt_date, str]] = None
    status: str = "Present"  # Present, Leave, Absent
    notes: Optional[str] = None

    @field_validator("date", mode="before")
    @classmethod
    def parse_date(cls, v):
        if isinstance(v, str):
            try:
                return dt_date.fromisoformat(v.strip())
            except Exception:
                return dt_date.today()
        return v


class AttendanceResponse(BaseModel):
    attendance_id: UUID
    driver_id: UUID
    driver_name: str
    license_number: Optional[str] = None
    date: str
    status: str
    notes: Optional[str] = None
    created_at: Optional[str] = None

    class Config:
        from_attributes = True


def format_attendance_response(att: Attendance, db: Session) -> dict:
    drv = db.query(Driver).filter(Driver.driver_id == att.driver_id).first()
    driver_name = "Unknown Driver"
    license_no = None
    if drv:
        license_no = drv.license_number
        if drv.user_id:
            usr = db.query(User).filter(User.user_id == drv.user_id).first()
            if usr:
                driver_name = usr.full_name

    return {
        "attendance_id": str(att.attendance_id),
        "driver_id": str(att.driver_id),
        "driver_name": driver_name,
        "license_number": license_no,
        "date": att.date.isoformat() if hasattr(att.date, "isoformat") else str(att.date),
        "status": att.status,
        "notes": att.notes,
        "created_at": att.created_at.isoformat() if att.created_at else None,
    }


@router.post("/", status_code=status.HTTP_201_CREATED)
def mark_attendance(
    payload: AttendanceCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(RoleEnum.Admin, RoleEnum.FleetManager)),
):
    """
    Mark or update attendance for a driver on a specific date.
    Admin and Fleet Manager only.
    """
    driver = db.query(Driver).filter(Driver.driver_id == payload.driver_id).first()
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")

    valid_statuses = ["Present", "Leave", "Absent"]
    status_clean = payload.status.strip().title()
    if status_clean not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(valid_statuses)}")

    att_date = payload.date or dt_date.today()

    # Check if attendance already logged for this driver & date -> update
    existing = (
        db.query(Attendance)
        .filter(Attendance.driver_id == payload.driver_id, Attendance.date == att_date)
        .first()
    )

    if existing:
        existing.status = status_clean
        existing.notes = payload.notes
        db.commit()
        db.refresh(existing)
        return format_attendance_response(existing, db)

    new_att = Attendance(
        attendance_id=uuid.uuid4(),
        driver_id=payload.driver_id,
        date=att_date,
        status=status_clean,
        notes=payload.notes,
        created_at=datetime.utcnow(),
    )
    db.add(new_att)
    db.commit()
    db.refresh(new_att)
    return format_attendance_response(new_att, db)


@router.get("/")
def list_attendance(
    start_date: Optional[dt_date] = None,
    end_date: Optional[dt_date] = None,
    driver_id: Optional[UUID] = None,
    status_filter: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    List attendance records.
    - Admin / Fleet Manager / Dispatcher: View fleet-wide or filtered attendance.
    - Driver: View ONLY own attendance records.
    """
    query = db.query(Attendance)

    if current_user.role == RoleEnum.Driver:
        drv = db.query(Driver).filter(Driver.user_id == current_user.user_id).first()
        if not drv:
            return []
        query = query.filter(Attendance.driver_id == drv.driver_id)
    elif driver_id:
        query = query.filter(Attendance.driver_id == driver_id)

    if start_date:
        query = query.filter(Attendance.date >= start_date)
    if end_date:
        query = query.filter(Attendance.date <= end_date)
    if status_filter and isinstance(status_filter, str):
        query = query.filter(Attendance.status == status_filter.strip().title())

    records = query.order_by(Attendance.date.desc(), Attendance.created_at.desc()).all()
    return [format_attendance_response(r, db) for r in records]


@router.get("/driver/{driver_id}")
def get_driver_attendance_history(
    driver_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Get attendance history for a single driver.
    """
    driver = db.query(Driver).filter(Driver.driver_id == driver_id).first()
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")

    if current_user.role == RoleEnum.Driver and driver.user_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized to view other drivers' attendance")

    records = (
        db.query(Attendance)
        .filter(Attendance.driver_id == driver_id)
        .order_by(Attendance.date.desc())
        .all()
    )
    return [format_attendance_response(r, db) for r in records]


@router.get("/summary")
def get_attendance_summary(
    start_date: Optional[dt_date] = None,
    end_date: Optional[dt_date] = None,
    month: Optional[int] = None,
    year: Optional[int] = None,
    driver_id: Optional[UUID] = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Calculate attendance summary metrics based on selected date range or current period.
    """
    query = db.query(Attendance)

    if current_user.role == RoleEnum.Driver:
        drv = db.query(Driver).filter(Driver.user_id == current_user.user_id).first()
        if not drv:
            return {
                "total_days": 0,
                "present_days": 0,
                "leave_days": 0,
                "absent_days": 0,
                "attendance_rate": 0.0,
                "display": "0/0 days present",
            }
        query = query.filter(Attendance.driver_id == drv.driver_id)
    elif driver_id:
        query = query.filter(Attendance.driver_id == driver_id)

    if start_date:
        query = query.filter(Attendance.date >= start_date)
    if end_date:
        query = query.filter(Attendance.date <= end_date)

    if not start_date and not end_date:
        today = dt_date.today()
        target_month = month or today.month
        target_year = year or today.year
        records = [
            r for r in query.all()
            if r.date.month == target_month and r.date.year == target_year
        ]
    else:
        records = query.all()

    total_days = len(records)
    present_days = sum(1 for r in records if r.status == "Present")
    leave_days = sum(1 for r in records if r.status == "Leave")
    absent_days = sum(1 for r in records if r.status == "Absent")
    rate = round((present_days / total_days * 100), 1) if total_days > 0 else 0.0

    return {
        "total_days": total_days,
        "present_days": present_days,
        "leave_days": leave_days,
        "absent_days": absent_days,
        "attendance_rate": rate,
        "display": f"{present_days}/{total_days} days present in selected period",
    }


# ==============================================================================
# FEATURE 1: DRIVER LEAVE REQUEST / PERMISSION
# ==============================================================================

class LeaveRequestCreate(BaseModel):
    leave_date: Union[dt_date, str]
    end_date: Optional[Union[dt_date, str]] = None
    reason: str

    @field_validator("leave_date", mode="before")
    @classmethod
    def parse_leave_date(cls, v):
        if isinstance(v, str) and v.strip():
            try:
                return dt_date.fromisoformat(v.strip())
            except Exception:
                return dt_date.today()
        return v

    @field_validator("end_date", mode="before")
    @classmethod
    def parse_end_date(cls, v):
        if isinstance(v, str) and v.strip():
            try:
                return dt_date.fromisoformat(v.strip())
            except Exception:
                return None
        return v


class LeaveStatusUpdate(BaseModel):
    status: str  # "Approved" or "Rejected"
    manager_comment: Optional[str] = None


def format_leave_request_response(req: LeaveRequest, db: Session) -> dict:
    drv = db.query(Driver).filter(Driver.driver_id == req.driver_id).first()
    driver_name = "Unknown Driver"
    license_no = None
    if drv:
        license_no = drv.license_number
        if drv.user_id:
            usr = db.query(User).filter(User.user_id == drv.user_id).first()
            if usr:
                driver_name = usr.full_name

    reviewer_name = None
    if req.reviewed_by:
        rev_usr = db.query(User).filter(User.user_id == req.reviewed_by).first()
        if rev_usr:
            reviewer_name = rev_usr.full_name

    return {
        "request_id": str(req.request_id),
        "driver_id": str(req.driver_id),
        "driver_name": driver_name,
        "license_number": license_no,
        "leave_date": req.leave_date.isoformat() if hasattr(req.leave_date, "isoformat") else str(req.leave_date),
        "end_date": req.end_date.isoformat() if req.end_date and hasattr(req.end_date, "isoformat") else (str(req.end_date) if req.end_date else None),
        "reason": req.reason,
        "status": req.status,
        "manager_comment": req.manager_comment,
        "reviewed_by": str(req.reviewed_by) if req.reviewed_by else None,
        "reviewer_name": reviewer_name,
        "created_at": req.created_at.isoformat() if req.created_at else None,
        "updated_at": req.updated_at.isoformat() if req.updated_at else None,
    }


@router.post("/leave-requests", status_code=status.HTTP_201_CREATED)
def apply_leave(
    payload: LeaveRequestCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Driver applies for leave.
    Status starts as PENDING.
    """
    if current_user.role not in [RoleEnum.Driver, RoleEnum.Admin, RoleEnum.FleetManager]:
        raise HTTPException(status_code=403, detail="Not authorized to apply for leave.")

    # Locate driver record
    if current_user.role == RoleEnum.Driver:
        driver = db.query(Driver).filter(Driver.user_id == current_user.user_id).first()
        if not driver:
            raise HTTPException(status_code=404, detail="Driver profile not found for this account.")
        target_driver_id = driver.driver_id
    else:
        # Admin or FleetManager can apply on behalf of first available driver or self
        driver = db.query(Driver).first()
        if not driver:
            raise HTTPException(status_code=404, detail="No driver found in database.")
        target_driver_id = driver.driver_id

    req = LeaveRequest(
        request_id=uuid.uuid4(),
        driver_id=target_driver_id,
        leave_date=payload.leave_date,
        end_date=payload.end_date,
        reason=payload.reason.strip(),
        status="Pending",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return format_leave_request_response(req, db)


@router.get("/leave-requests")
def list_leave_requests(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    List leave requests:
    - Driver: sees own leave requests only.
    - Fleet Manager / Admin: sees all driver leave requests.
    - Dispatcher: 403 Forbidden.
    """
    if current_user.role == RoleEnum.Dispatcher:
        raise HTTPException(status_code=403, detail="Dispatchers do not have leave management permissions.")

    query = db.query(LeaveRequest)

    if current_user.role == RoleEnum.Driver:
        driver = db.query(Driver).filter(Driver.user_id == current_user.user_id).first()
        if not driver:
            return []
        query = query.filter(LeaveRequest.driver_id == driver.driver_id)

    requests = query.order_by(LeaveRequest.created_at.desc()).all()
    return [format_leave_request_response(r, db) for r in requests]


@router.patch("/leave-requests/{request_id}/status")
@router.put("/leave-requests/{request_id}/status")
def review_leave_request(
    request_id: UUID,
    payload: LeaveStatusUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(RoleEnum.Admin, RoleEnum.FleetManager)),
):
    """
    Fleet Manager / Admin approves or rejects a leave request.
    If Approved -> sets/creates attendance record with status='Leave' for that driver & date.
    If Rejected -> does not mark attendance as Leave.
    """
    clean_status = payload.status.strip().title()
    if clean_status not in ["Approved", "Rejected"]:
        raise HTTPException(status_code=400, detail="Invalid status. Must be 'Approved' or 'Rejected'.")

    req = db.query(LeaveRequest).filter(LeaveRequest.request_id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Leave request not found.")

    req.status = clean_status
    if payload.manager_comment:
        req.manager_comment = payload.manager_comment.strip()
    req.reviewed_by = current_user.user_id
    req.updated_at = datetime.utcnow()

    # ATTENDANCE INTEGRATION:
    # When Approved: The corresponding attendance record should show LEAVE for that date.
    if clean_status == "Approved":
        existing_att = (
            db.query(Attendance)
            .filter(Attendance.driver_id == req.driver_id, Attendance.date == req.leave_date)
            .first()
        )
        if existing_att:
            existing_att.status = "Leave"
            existing_att.notes = f"Approved Leave: {req.reason}"
        else:
            new_att = Attendance(
                attendance_id=uuid.uuid4(),
                driver_id=req.driver_id,
                date=req.leave_date,
                status="Leave",
                notes=f"Approved Leave: {req.reason}",
                created_at=datetime.utcnow(),
            )
            db.add(new_att)

    db.commit()
    db.refresh(req)

    # Dispatch in-app notification to the affected driver
    drv = db.query(Driver).filter(Driver.driver_id == req.driver_id).first()
    if drv and drv.user_id:
        driver_user = db.query(User).filter(User.user_id == drv.user_id).first()
        if driver_user:
            dispatch_system_notification(
                db=db,
                title=f"Leave Request {clean_status}",
                message=f"Your leave request for {req.leave_date} has been {clean_status.lower()}{f': {req.manager_comment}' if req.manager_comment else '.'}",
                event_type=f"leave_{clean_status.lower()}",
                notification_type="general",
                driver_user_id=driver_user.user_id,
                sender_id=current_user.user_id,
                sender_name=current_user.full_name,
                sender_role=current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role),
            )
            db.commit()

    return format_leave_request_response(req, db)


# ==============================================================================
# FEATURE 2: DRIVER STAR RATING
# ==============================================================================

class DriverRatingCreate(BaseModel):
    driver_id: UUID
    rating: int
    comment: Optional[str] = None

    @field_validator("rating")
    @classmethod
    def validate_rating(cls, v):
        if not (1 <= v <= 5):
            raise ValueError("Rating must be an integer between 1 and 5.")
        return v


@router.post("/driver-ratings", status_code=status.HTTP_201_CREATED)
def rate_driver(
    payload: DriverRatingCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(RoleEnum.Admin, RoleEnum.FleetManager)),
):
    """
    Fleet Manager / Admin rates a driver with 1-5 stars and optional review.
    Drivers cannot rate themselves.
    """
    driver = db.query(Driver).filter(Driver.driver_id == payload.driver_id).first()
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found.")

    # Guard: do not allow a user to rate themselves if their user_id matches driver's user_id
    if driver.user_id and driver.user_id == current_user.user_id:
        raise HTTPException(status_code=403, detail="Drivers cannot rate themselves.")

    new_rating = DriverRating(
        rating_id=uuid.uuid4(),
        driver_id=payload.driver_id,
        rated_by=current_user.user_id,
        rating=payload.rating,
        comment=payload.comment.strip() if payload.comment else None,
        created_at=datetime.utcnow(),
    )
    db.add(new_rating)
    db.commit()
    db.refresh(new_rating)

    return {
        "rating_id": str(new_rating.rating_id),
        "driver_id": str(new_rating.driver_id),
        "rating": new_rating.rating,
        "comment": new_rating.comment,
        "rated_by": str(new_rating.rated_by),
        "created_at": new_rating.created_at.isoformat() if new_rating.created_at else None,
    }


@router.get("/driver-ratings")
def get_driver_ratings(
    driver_id: Optional[UUID] = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Retrieve driver ratings summary and reviews.
    - Driver sees own rating summary and reviews.
    - Fleet Manager / Admin sees all drivers with average rating and reviews.
    - Dispatcher: 403 Forbidden.
    """
    if current_user.role == RoleEnum.Dispatcher:
        raise HTTPException(status_code=403, detail="Dispatchers do not have driver rating permissions.")

    # If Driver, restrict strictly to their own driver record
    if current_user.role == RoleEnum.Driver:
        my_drv = db.query(Driver).filter(Driver.user_id == current_user.user_id).first()
        if not my_drv:
            return []
        target_drivers = [my_drv]
    elif driver_id:
        drv = db.query(Driver).filter(Driver.driver_id == driver_id).first()
        target_drivers = [drv] if drv else []
    else:
        target_drivers = db.query(Driver).all()

    results = []
    for drv in target_drivers:
        ratings_list = (
            db.query(DriverRating)
            .filter(DriverRating.driver_id == drv.driver_id)
            .order_by(DriverRating.created_at.desc())
            .all()
        )
        total_revs = len(ratings_list)
        avg_score = round(sum(r.rating for r in ratings_list) / total_revs, 1) if total_revs > 0 else 0.0

        driver_name = "Unknown Driver"
        if drv.user_id:
            usr = db.query(User).filter(User.user_id == drv.user_id).first()
            if usr:
                driver_name = usr.full_name

        reviews_data = []
        for r in ratings_list:
            rater_name = "Fleet Manager"
            rater_usr = db.query(User).filter(User.user_id == r.rated_by).first()
            if rater_usr:
                rater_name = rater_usr.full_name
            reviews_data.append({
                "rating_id": str(r.rating_id),
                "rating": r.rating,
                "comment": r.comment,
                "rated_by_name": rater_name,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            })

        results.append({
            "driver_id": str(drv.driver_id),
            "driver_name": driver_name,
            "license_number": drv.license_number,
            "average_rating": avg_score,
            "total_reviews": total_revs,
            "reviews": reviews_data,
        })

    return results

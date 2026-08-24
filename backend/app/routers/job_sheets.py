from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models, schemas, services
from app.database import get_db

router = APIRouter(prefix="/job-sheets", tags=["job sheets"])


def _get(db: Session, sheet_id: str) -> models.JobSheet:
    sheet = db.get(models.JobSheet, sheet_id)
    if sheet is None:
        raise HTTPException(404, "Job sheet not found")
    return sheet


@router.get("", response_model=list[schemas.JobSheetOut])
def list_job_sheets(
    status: models.JobSheetStatus | None = None, db: Session = Depends(get_db)
) -> list[schemas.JobSheetOut]:
    stmt = select(models.JobSheet)
    if status is not None:
        stmt = stmt.where(models.JobSheet.status == status)
    sheets = db.scalars(stmt.order_by(models.JobSheet.created_at.desc())).all()
    return [services.job_sheet_out(s) for s in sheets]


@router.get("/{sheet_id}", response_model=schemas.JobSheetOut)
def get_job_sheet(sheet_id: str, db: Session = Depends(get_db)) -> schemas.JobSheetOut:
    return services.job_sheet_out(_get(db, sheet_id))


@router.get("/{sheet_id}/work-orders", response_model=list[schemas.WorkOrderOut])
def list_work_orders(sheet_id: str, db: Session = Depends(get_db)) -> list[schemas.WorkOrderOut]:
    return [services.work_order_out(wo) for wo in _get(db, sheet_id).work_orders]


@router.post("/{sheet_id}/confirm", response_model=schemas.JobSheetOut)
def confirm_job_sheet(sheet_id: str, db: Session = Depends(get_db)) -> schemas.JobSheetOut:
    """Locks the sheet and everything inside it, then sends it for approval."""
    sheet = _get(db, sheet_id)
    if sheet.is_locked:
        raise HTTPException(409, "Job sheet is already confirmed")
    if not sheet.work_orders:
        raise HTTPException(422, "Add at least one work order before confirming")

    unconfirmed = [wo.code for wo in sheet.work_orders if wo.status == models.WorkOrderStatus.draft]
    if unconfirmed:
        raise HTTPException(422, f"Work orders still in draft: {', '.join(unconfirmed)}")

    sheet.status = models.JobSheetStatus.pending_approval
    sheet.rejection_reason = None
    db.commit()
    return services.job_sheet_out(sheet)


@router.post("/{sheet_id}/approve", response_model=schemas.JobSheetOut)
def approve_job_sheet(sheet_id: str, db: Session = Depends(get_db)) -> schemas.JobSheetOut:
    """Approval soft-reserves stock and releases the work orders to the floor."""
    sheet = _get(db, sheet_id)
    if sheet.status != models.JobSheetStatus.pending_approval:
        raise HTTPException(409, "Job sheet is not awaiting approval")

    sheet.status = models.JobSheetStatus.approved
    sheet.approved_by = "production_manager"
    for wo in sheet.work_orders:
        if wo.status == models.WorkOrderStatus.confirmed:
            wo.status = models.WorkOrderStatus.released
    db.commit()
    return services.job_sheet_out(sheet)


@router.post("/{sheet_id}/reject", response_model=schemas.JobSheetOut)
def reject_job_sheet(
    sheet_id: str, payload: schemas.RejectIn, db: Session = Depends(get_db)
) -> schemas.JobSheetOut:
    sheet = _get(db, sheet_id)
    if sheet.status != models.JobSheetStatus.pending_approval:
        raise HTTPException(409, "Job sheet is not awaiting approval")

    sheet.status = models.JobSheetStatus.draft
    sheet.rejection_reason = payload.reason
    for wo in sheet.work_orders:
        if wo.status == models.WorkOrderStatus.confirmed:
            wo.status = models.WorkOrderStatus.draft
            wo.confirmed_at = None
    db.commit()
    return services.job_sheet_out(sheet)

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models, schemas, services
from app.database import get_db

router = APIRouter(prefix="/wip", tags=["work in progress"])

ON_FLOOR = (
    models.WorkOrderStatus.released,
    models.WorkOrderStatus.running,
    models.WorkOrderStatus.stopped,
    models.WorkOrderStatus.completed,
)


@router.get("/work-orders", response_model=list[schemas.WorkOrderOut])
def list_floor_work_orders(db: Session = Depends(get_db)) -> list[schemas.WorkOrderOut]:
    """Released and beyond. Draft and confirmed-but-unreleased orders are not on the floor."""
    stmt = select(models.WorkOrder).where(models.WorkOrder.status.in_(ON_FLOOR))
    return [services.work_order_out(wo) for wo in db.scalars(stmt).all()]


@router.get("/work-orders/{wo_id}", response_model=schemas.WipRollup)
def get_staff_wip(wo_id: str, db: Session = Depends(get_db)) -> schemas.WipRollup:
    """Staff WIP for one work order: every operator run plus the good, rosak and waste rollup."""
    wo = db.get(models.WorkOrder, wo_id)
    if wo is None:
        raise HTTPException(404, "Work order not found")

    runs = wo.staff_runs
    done = sum(r.qty_done for r in runs)
    rosak = sum(r.qty_rosak for r in runs)
    produced = done + rosak

    return schemas.WipRollup(
        work_order_id=wo.id,
        qty_done=done,
        qty_rosak=rosak,
        qty_waste=sum(r.qty_waste for r in runs),
        downtime_min=sum(r.downtime_min for r in runs),
        yield_pct=round(done / produced * 100, 1) if produced else 0.0,
        runs=[schemas.StaffRunOut.model_validate(r) for r in runs],
    )

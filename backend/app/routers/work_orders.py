from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import models, schemas, services
from app.database import get_db

router = APIRouter(prefix="/work-orders", tags=["work orders"])


def _get(db: Session, wo_id: str) -> models.WorkOrder:
    wo = db.get(models.WorkOrder, wo_id)
    if wo is None:
        raise HTTPException(404, "Work order not found")
    return wo


def _editable(db: Session, wo_id: str) -> models.WorkOrder:
    """Guard for every mutating route. Confirmed means immutable, no exceptions."""
    wo = _get(db, wo_id)
    if wo.is_locked:
        raise HTTPException(
            409,
            "Work order is confirmed or its job sheet is confirmed. It can no longer be modified.",
        )
    return wo


@router.get("", response_model=list[schemas.WorkOrderOut])
def list_work_orders(
    status: models.WorkOrderStatus | None = None, db: Session = Depends(get_db)
) -> list[schemas.WorkOrderOut]:
    stmt = select(models.WorkOrder)
    if status is not None:
        stmt = stmt.where(models.WorkOrder.status == status)
    return [services.work_order_out(wo) for wo in db.scalars(stmt).all()]


@router.get("/{wo_id}", response_model=schemas.WorkOrderOut)
def get_work_order(wo_id: str, db: Session = Depends(get_db)) -> schemas.WorkOrderOut:
    return services.work_order_out(_get(db, wo_id))


@router.post("", response_model=schemas.WorkOrderOut, status_code=201)
def create_work_order(
    payload: schemas.WorkOrderCreate, db: Session = Depends(get_db)
) -> schemas.WorkOrderOut:
    sheet = db.get(models.JobSheet, payload.job_sheet_id)
    if sheet is None:
        raise HTTPException(404, "Job sheet not found")
    if sheet.is_locked:
        raise HTTPException(409, "Job sheet is confirmed. Work orders can no longer be added.")

    goal = next((g for g in sheet.goals if g.id == payload.goal_id), None)
    if goal is None:
        raise HTTPException(422, "Goal does not belong to this job sheet")

    seq = db.scalar(select(func.count()).select_from(models.WorkOrder)) or 0
    wo = models.WorkOrder(
        id=services.new_id("wo"),
        code=f"WO-{datetime.utcnow():%y%m}-{seq + 401:04d}",
        job_sheet_id=sheet.id,
        goal_id=goal.id,
        qty=payload.qty,
        unit=goal.unit,
        mode=payload.mode,
        status=models.WorkOrderStatus.draft,
        feasibility=models.Feasibility.unchecked,
        notes="",
        created_at=datetime.utcnow(),
    )
    db.add(wo)
    db.flush()

    if payload.mode == models.BuildMode.ai:
        services.ai_assign(db, wo, goal.product_code)

    db.commit()
    db.refresh(wo)
    return services.work_order_out(wo)


@router.patch("/{wo_id}", response_model=schemas.WorkOrderOut)
def patch_work_order(
    wo_id: str, payload: schemas.WorkOrderPatch, db: Session = Depends(get_db)
) -> schemas.WorkOrderOut:
    wo = _editable(db, wo_id)
    if payload.notes is not None:
        wo.notes = payload.notes
    if payload.qty is not None:
        wo.qty = payload.qty
        for line in wo.bom:
            line.required_qty = round(line.required_per_unit * wo.qty, 2)
    services.clear_summary(wo)
    db.commit()
    db.refresh(wo)
    return services.work_order_out(wo)


@router.delete("/{wo_id}", status_code=204)
def delete_work_order(wo_id: str, db: Session = Depends(get_db)) -> None:
    db.delete(_editable(db, wo_id))
    db.commit()


@router.post("/{wo_id}/bom", response_model=schemas.WorkOrderOut, status_code=201)
def add_bom_line(
    wo_id: str, payload: schemas.BomLineIn, db: Session = Depends(get_db)
) -> schemas.WorkOrderOut:
    wo = _editable(db, wo_id)
    material = db.get(models.Material, payload.material_code)
    if material is None:
        raise HTTPException(404, "Material not in the master")

    db.add(
        models.BomLine(
            id=services.new_id("b"),
            work_order_id=wo.id,
            material_code=material.code,
            name=material.name,
            required_per_unit=payload.required_per_unit,
            required_qty=round(payload.required_per_unit * wo.qty, 2),
            unit=material.unit,
            on_hand_qty=material.on_hand_qty,
            unit_cost=material.unit_cost,
        )
    )
    services.clear_summary(wo)
    db.commit()
    db.refresh(wo)
    return services.work_order_out(wo)


@router.delete("/{wo_id}/bom/{line_id}", response_model=schemas.WorkOrderOut)
def remove_bom_line(wo_id: str, line_id: str, db: Session = Depends(get_db)) -> schemas.WorkOrderOut:
    wo = _editable(db, wo_id)
    line = db.get(models.BomLine, line_id)
    if line is None or line.work_order_id != wo.id:
        raise HTTPException(404, "BOM line not found on this work order")
    db.delete(line)
    services.clear_summary(wo)
    db.commit()
    db.refresh(wo)
    return services.work_order_out(wo)


@router.post("/{wo_id}/route", response_model=schemas.WorkOrderOut, status_code=201)
def add_route_step(
    wo_id: str, payload: schemas.RouteStepIn, db: Session = Depends(get_db)
) -> schemas.WorkOrderOut:
    wo = _editable(db, wo_id)
    db.add(
        models.RouteStep(
            id=services.new_id("r"),
            work_order_id=wo.id,
            seq=len(wo.route) + 1,
            operation=payload.operation,
            work_centre=payload.work_centre,
            machine=payload.machine,
            setup_min=payload.setup_min,
            cycle_sec_per_unit=payload.cycle_sec_per_unit,
        )
    )
    services.clear_summary(wo)
    db.commit()
    db.refresh(wo)
    return services.work_order_out(wo)


@router.delete("/{wo_id}/route/{step_id}", response_model=schemas.WorkOrderOut)
def remove_route_step(wo_id: str, step_id: str, db: Session = Depends(get_db)) -> schemas.WorkOrderOut:
    wo = _editable(db, wo_id)
    step = db.get(models.RouteStep, step_id)
    if step is None or step.work_order_id != wo.id:
        raise HTTPException(404, "Route step not found on this work order")
    db.delete(step)
    db.flush()
    for i, remaining in enumerate(sorted(wo.route, key=lambda s: s.seq), start=1):
        remaining.seq = i
    services.clear_summary(wo)
    db.commit()
    db.refresh(wo)
    return services.work_order_out(wo)


@router.post("/{wo_id}/feasibility", response_model=schemas.WorkOrderOut)
def run_feasibility(wo_id: str, db: Session = Depends(get_db)) -> schemas.WorkOrderOut:
    wo = _editable(db, wo_id)
    services.check_feasibility(db, wo)
    db.commit()
    db.refresh(wo)
    return services.work_order_out(wo)


@router.post("/{wo_id}/summary", response_model=schemas.WorkOrderOut)
def build_summary(wo_id: str, db: Session = Depends(get_db)) -> schemas.WorkOrderOut:
    wo = _editable(db, wo_id)
    services.apply_summary(wo)
    db.commit()
    db.refresh(wo)
    return services.work_order_out(wo)


@router.post("/{wo_id}/schedule", response_model=schemas.WorkOrderOut)
def schedule_slot(wo_id: str, db: Session = Depends(get_db)) -> schemas.WorkOrderOut:
    wo = _editable(db, wo_id)
    if not wo.route:
        raise HTTPException(422, "Add a route before scheduling a machine slot")
    services.auto_schedule(wo)
    db.commit()
    db.refresh(wo)
    return services.work_order_out(wo)


@router.post("/{wo_id}/confirm", response_model=schemas.WorkOrderOut)
def confirm_work_order(wo_id: str, db: Session = Depends(get_db)) -> schemas.WorkOrderOut:
    """After this the work order is immutable, matching the confirm gate in the flowchart."""
    wo = _editable(db, wo_id)
    if not wo.bom or not wo.route:
        raise HTTPException(422, "A BOM line and a route step are required before confirming")
    if wo.feasibility != models.Feasibility.ok:
        raise HTTPException(422, "Clear all stock shortages before confirming")
    if wo.total_cost is None:
        raise HTTPException(422, "Calculate the production summary before confirming")
    if wo.slot_machine is None:
        raise HTTPException(422, "Assign a machine slot before confirming")

    wo.status = models.WorkOrderStatus.confirmed
    wo.confirmed_at = datetime.utcnow()
    db.commit()
    db.refresh(wo)
    return services.work_order_out(wo)

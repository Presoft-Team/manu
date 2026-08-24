"""Costing, feasibility and serialisation. Mirrors frontend/src/store/mes.tsx."""

from __future__ import annotations

import math
import uuid
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app import models, schemas

LABOUR_RATE_PER_HOUR = 118.0
OVERHEAD_RATE = 0.6
SCRAP_ALLOWANCE_PCT = 0.02


def new_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def calc_summary(wo: models.WorkOrder) -> schemas.ProductionSummary:
    material_cost = sum(line.required_qty * line.unit_cost for line in wo.bom)
    run_hours = sum(
        step.setup_min / 60 + (wo.qty * step.cycle_sec_per_unit) / 3600 for step in wo.route
    )
    labour_cost = run_hours * LABOUR_RATE_PER_HOUR
    overhead_cost = labour_cost * OVERHEAD_RATE
    scrap = math.ceil(wo.qty * SCRAP_ALLOWANCE_PCT)
    return schemas.ProductionSummary(
        expected_output=wo.qty - scrap,
        scrap_allowance=scrap,
        material_cost=round(material_cost, 2),
        labour_cost=round(labour_cost, 2),
        overhead_cost=round(overhead_cost, 2),
        total_cost=round(material_cost + labour_cost + overhead_cost, 2),
        run_hours=round(run_hours, 1),
    )


def apply_summary(wo: models.WorkOrder) -> None:
    s = calc_summary(wo)
    wo.expected_output = s.expected_output
    wo.scrap_allowance = s.scrap_allowance
    wo.material_cost = s.material_cost
    wo.labour_cost = s.labour_cost
    wo.overhead_cost = s.overhead_cost
    wo.total_cost = s.total_cost
    wo.run_hours = s.run_hours


def clear_summary(wo: models.WorkOrder) -> None:
    wo.expected_output = None
    wo.scrap_allowance = None
    wo.material_cost = None
    wo.labour_cost = None
    wo.overhead_cost = None
    wo.total_cost = None
    wo.run_hours = None
    wo.feasibility = models.Feasibility.unchecked


def check_feasibility(db: Session, wo: models.WorkOrder) -> None:
    """Compare required against stock on hand, raising a PR for every shortfall."""
    for pr in list(wo.purchase_requests):
        db.delete(pr)
    wo.purchase_requests = []

    short = [line for line in wo.bom if line.required_qty > line.on_hand_qty]
    wo.feasibility = models.Feasibility.shortage if short else models.Feasibility.ok
    for line in short:
        db.add(
            models.PurchaseRequest(
                id=new_id("pr"),
                work_order_id=wo.id,
                material_code=line.material_code,
                shortfall_qty=round(line.required_qty - line.on_hand_qty, 2),
                unit=line.unit,
                raised_at=datetime.utcnow(),
                manager_alerted=True,
            )
        )


def auto_schedule(wo: models.WorkOrder) -> None:
    hours = wo.run_hours if wo.run_hours is not None else calc_summary(wo).run_hours
    start = (datetime.utcnow() + timedelta(days=2)).replace(
        hour=7, minute=0, second=0, microsecond=0
    )
    wo.slot_machine = wo.route[0].machine if wo.route else "CNC-04 / Okuma LB3000"
    wo.slot_starts_at = start
    wo.slot_ends_at = start + timedelta(hours=hours)
    wo.slot_auto_scheduled = True


def work_order_out(wo: models.WorkOrder) -> schemas.WorkOrderOut:
    slot = None
    if wo.slot_machine and wo.slot_starts_at and wo.slot_ends_at:
        slot = schemas.MachineSlot(
            machine=wo.slot_machine,
            starts_at=wo.slot_starts_at,
            ends_at=wo.slot_ends_at,
            auto_scheduled=wo.slot_auto_scheduled,
        )

    summary = None
    if wo.total_cost is not None:
        summary = schemas.ProductionSummary(
            expected_output=wo.expected_output or 0,
            scrap_allowance=wo.scrap_allowance or 0,
            material_cost=wo.material_cost or 0,
            labour_cost=wo.labour_cost or 0,
            overhead_cost=wo.overhead_cost or 0,
            total_cost=wo.total_cost,
            run_hours=wo.run_hours or 0,
        )

    return schemas.WorkOrderOut(
        id=wo.id,
        code=wo.code,
        job_sheet_id=wo.job_sheet_id,
        goal_id=wo.goal_id,
        qty=wo.qty,
        unit=wo.unit,
        mode=wo.mode,
        status=wo.status,
        feasibility=wo.feasibility,
        notes=wo.notes,
        created_at=wo.created_at,
        confirmed_at=wo.confirmed_at,
        bom=[schemas.BomLineOut.model_validate(line) for line in wo.bom],
        route=[schemas.RouteStepOut.model_validate(step) for step in wo.route],
        purchase_requests=[
            schemas.PurchaseRequestOut.model_validate(pr) for pr in wo.purchase_requests
        ],
        slot=slot,
        summary=summary,
    )


def job_sheet_out(sheet: models.JobSheet) -> schemas.JobSheetOut:
    used: dict[str, int] = {}
    for wo in sheet.work_orders:
        used[wo.goal_id] = used.get(wo.goal_id, 0) + wo.qty

    return schemas.JobSheetOut(
        id=sheet.id,
        code=sheet.code,
        source=sheet.source,
        reference=sheet.reference,
        customer=sheet.customer,
        created_by=sheet.created_by,
        created_at=sheet.created_at,
        due_date=sheet.due_date,
        status=sheet.status,
        approved_by=sheet.approved_by,
        rejection_reason=sheet.rejection_reason,
        parent_work_order_code=sheet.parent_work_order_code,
        goals=[schemas.JobSheetGoalOut.model_validate(g) for g in sheet.goals],
        work_order_ids=[wo.id for wo in sheet.work_orders],
        remaining_by_goal={g.id: g.target_qty - used.get(g.id, 0) for g in sheet.goals},
    )


# --------------------------------------------------------------- AI assign ---

AI_TEMPLATES: dict[str, dict] = {
    "BRKT": {
        "bom": [("RM-MS-CR2", 0.42), ("CN-M8x25", 4), ("CS-PWD-RAL7016", 0.018)],
        "route": [
            ("Blank and pierce", "Stamping", "PRESS-02 / Aida 200T", 45, 6),
            ("Powder coat", "Finishing", "PAINT-03 / Powder Line B", 60, 14),
        ],
    },
    "PIN": {
        "bom": [("RM-SS304-12", 0.21), ("CN-WSH-M8", 2)],
        "route": [
            ("Cut to length", "Machining", "CNC-07 / Doosan Puma 2600", 40, 22),
            ("Deburr and inspect", "Inspection", "ASSY-02 / Bench Cell 2", 15, 18),
        ],
    },
    "SHAFT": {
        "bom": [("RM-SS304-12", 0.34), ("CP-SEAL-N70", 1)],
        "route": [
            ("Turn shaft", "Machining", "CNC-04 / Okuma LB3000", 80, 118),
            ("Seal fit and test", "Assembly", "ASSY-02 / Bench Cell 2", 25, 42),
        ],
    },
    "HOUS": {
        "bom": [("RM-AL6061-40", 0.87), ("CN-M8x25", 6)],
        "route": [
            ("Mill housing", "Machining", "CNC-07 / Doosan Puma 2600", 95, 204),
            ("Final assembly", "Assembly", "ASSY-02 / Bench Cell 2", 30, 88),
        ],
    },
    "SUBF": {
        "bom": [("RM-MS-CR2", 0.66), ("CS-WIRE-G3Si", 0.04)],
        "route": [
            ("Blank", "Stamping", "PRESS-05 / Komatsu 110T", 30, 9),
            ("MIG weld subframe", "Welding", "WELD-01 / Fronius TPS 400i", 55, 168),
        ],
    },
}


def ai_assign(db: Session, wo: models.WorkOrder, product_code: str) -> bool:
    """
    Database audit from the flowchart: pull a historical BOM and route for the part
    family. Returns False when nothing is found, which sends the user to the manual path.
    """
    parts = product_code.split("-")
    family = parts[1] if len(parts) > 1 else ""
    template = AI_TEMPLATES.get(family)
    if not template:
        return False

    for code, per_unit in template["bom"]:
        material = db.get(models.Material, code)
        if material is None:
            continue
        db.add(
            models.BomLine(
                id=new_id("b"),
                work_order_id=wo.id,
                material_code=material.code,
                name=material.name,
                required_per_unit=per_unit,
                required_qty=round(per_unit * wo.qty, 2),
                unit=material.unit,
                on_hand_qty=material.on_hand_qty,
                unit_cost=material.unit_cost,
                ai_assigned=True,
            )
        )

    for i, (operation, centre, machine, setup, cycle) in enumerate(template["route"], start=1):
        db.add(
            models.RouteStep(
                id=new_id("r"),
                work_order_id=wo.id,
                seq=i,
                operation=operation,
                work_centre=centre,
                machine=machine,
                setup_min=setup,
                cycle_sec_per_unit=cycle,
                ai_assigned=True,
            )
        )
    return True

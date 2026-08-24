"""
Pydantic schemas. Field names are serialised as camelCase so the payloads drop
straight into the TypeScript interfaces in frontend/src/types.ts.
"""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from app.models import (
    BuildMode,
    DemandSource,
    Feasibility,
    JobSheetStatus,
    StaffRunStatus,
    WorkOrderStatus,
)


class Schema(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, from_attributes=True
    )


class BomLineOut(Schema):
    id: str
    material_code: str
    name: str
    required_per_unit: float
    required_qty: float
    unit: str
    on_hand_qty: float
    unit_cost: float
    ai_assigned: bool


class BomLineIn(Schema):
    material_code: str
    required_per_unit: float = 1


class RouteStepOut(Schema):
    id: str
    seq: int
    operation: str
    work_centre: str
    machine: str
    setup_min: int
    cycle_sec_per_unit: float
    ai_assigned: bool


class RouteStepIn(Schema):
    operation: str
    work_centre: str
    machine: str
    setup_min: int = 0
    cycle_sec_per_unit: float = 0


class PurchaseRequestOut(Schema):
    id: str
    material_code: str
    shortfall_qty: float
    unit: str
    raised_at: datetime
    manager_alerted: bool


class MachineSlot(Schema):
    machine: str
    starts_at: datetime
    ends_at: datetime
    auto_scheduled: bool


class ProductionSummary(Schema):
    expected_output: int
    scrap_allowance: int
    material_cost: float
    labour_cost: float
    overhead_cost: float
    total_cost: float
    run_hours: float


class WorkOrderOut(Schema):
    id: str
    code: str
    job_sheet_id: str
    goal_id: str
    qty: int
    unit: str
    mode: BuildMode
    status: WorkOrderStatus
    feasibility: Feasibility
    notes: str
    created_at: datetime
    confirmed_at: datetime | None
    bom: list[BomLineOut]
    route: list[RouteStepOut]
    purchase_requests: list[PurchaseRequestOut]
    slot: MachineSlot | None
    summary: ProductionSummary | None


class WorkOrderCreate(Schema):
    job_sheet_id: str
    goal_id: str
    qty: int
    mode: BuildMode


class WorkOrderPatch(Schema):
    qty: int | None = None
    notes: str | None = None


class JobSheetGoalOut(Schema):
    id: str
    product_code: str
    product_name: str
    target_qty: int
    unit: str


class JobSheetOut(Schema):
    id: str
    code: str
    source: DemandSource
    reference: str
    customer: str
    created_by: str
    created_at: datetime
    due_date: date
    status: JobSheetStatus
    approved_by: str | None
    rejection_reason: str | None
    parent_work_order_code: str | None
    goals: list[JobSheetGoalOut]
    work_order_ids: list[str]
    """Remaining quantity per goal id, after existing work orders."""
    remaining_by_goal: dict[str, int]


class RejectIn(Schema):
    reason: str


class StaffRunOut(Schema):
    id: str
    work_order_id: str
    operator_id: str
    operator_name: str
    shift: str
    operation: str
    machine: str
    started_at: datetime
    ended_at: datetime | None
    status: StaffRunStatus
    qty_done: int
    qty_rosak: int
    qty_waste: int
    downtime_min: int
    downtime_reason: str | None
    supervisor_called: bool


class WipRollup(Schema):
    work_order_id: str
    qty_done: int
    qty_rosak: int
    qty_waste: int
    downtime_min: int
    yield_pct: float
    runs: list[StaffRunOut]

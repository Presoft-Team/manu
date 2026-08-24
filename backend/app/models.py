"""
SQLAlchemy models mirroring frontend/src/types.ts one to one.

The React build is hardcoded against seed.ts; these tables are the shape it will
read from once the fetch layer is wired up, so the field names match exactly.
"""

from __future__ import annotations

import enum
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class DemandSource(str, enum.Enum):
    sales_order = "sales_order"
    forecast = "forecast"
    rework = "rework"


class JobSheetStatus(str, enum.Enum):
    draft = "draft"
    pending_approval = "pending_approval"
    approved = "approved"
    in_progress = "in_progress"
    completed = "completed"
    rejected = "rejected"


class WorkOrderStatus(str, enum.Enum):
    draft = "draft"
    confirmed = "confirmed"
    released = "released"
    running = "running"
    stopped = "stopped"
    completed = "completed"


class BuildMode(str, enum.Enum):
    ai = "ai"
    manual = "manual"


class Feasibility(str, enum.Enum):
    ok = "ok"
    shortage = "shortage"
    unchecked = "unchecked"


class StaffRunStatus(str, enum.Enum):
    running = "running"
    paused = "paused"
    done = "done"


class Material(Base):
    """Material master the BOM editor picks from."""

    __tablename__ = "materials"

    code: Mapped[str] = mapped_column(String(32), primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    unit: Mapped[str] = mapped_column(String(8))
    on_hand_qty: Mapped[float] = mapped_column(Float, default=0)
    unit_cost: Mapped[float] = mapped_column(Float, default=0)


class JobSheet(Base):
    __tablename__ = "job_sheets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    code: Mapped[str] = mapped_column(String(24), unique=True, index=True)
    source: Mapped[DemandSource] = mapped_column(Enum(DemandSource, name="demand_source"))
    reference: Mapped[str] = mapped_column(String(48))
    customer: Mapped[str] = mapped_column(String(120))
    created_by: Mapped[str] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    due_date: Mapped[date] = mapped_column(Date)
    status: Mapped[JobSheetStatus] = mapped_column(
        Enum(JobSheetStatus, name="job_sheet_status"), default=JobSheetStatus.draft, index=True
    )
    approved_by: Mapped[str | None] = mapped_column(String(80), nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    parent_work_order_code: Mapped[str | None] = mapped_column(String(24), nullable=True)

    goals: Mapped[list[JobSheetGoal]] = relationship(
        back_populates="job_sheet", cascade="all, delete-orphan"
    )
    work_orders: Mapped[list[WorkOrder]] = relationship(
        back_populates="job_sheet", cascade="all, delete-orphan"
    )

    @property
    def is_locked(self) -> bool:
        """A confirmed job sheet is immutable, including everything inside it."""
        return self.status != JobSheetStatus.draft


class JobSheetGoal(Base):
    __tablename__ = "job_sheet_goals"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    job_sheet_id: Mapped[str] = mapped_column(ForeignKey("job_sheets.id", ondelete="CASCADE"))
    product_code: Mapped[str] = mapped_column(String(32))
    product_name: Mapped[str] = mapped_column(String(160))
    target_qty: Mapped[int] = mapped_column(Integer)
    unit: Mapped[str] = mapped_column(String(8))

    job_sheet: Mapped[JobSheet] = relationship(back_populates="goals")


class WorkOrder(Base):
    __tablename__ = "work_orders"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    code: Mapped[str] = mapped_column(String(24), unique=True, index=True)
    job_sheet_id: Mapped[str] = mapped_column(
        ForeignKey("job_sheets.id", ondelete="CASCADE"), index=True
    )
    goal_id: Mapped[str] = mapped_column(ForeignKey("job_sheet_goals.id", ondelete="CASCADE"))
    qty: Mapped[int] = mapped_column(Integer)
    unit: Mapped[str] = mapped_column(String(8))
    mode: Mapped[BuildMode] = mapped_column(Enum(BuildMode, name="build_mode"))
    status: Mapped[WorkOrderStatus] = mapped_column(
        Enum(WorkOrderStatus, name="work_order_status"), default=WorkOrderStatus.draft, index=True
    )
    feasibility: Mapped[Feasibility] = mapped_column(
        Enum(Feasibility, name="feasibility"), default=Feasibility.unchecked
    )
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # Machine slot, flattened rather than a separate table: one slot per order.
    slot_machine: Mapped[str | None] = mapped_column(String(64), nullable=True)
    slot_starts_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    slot_ends_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    slot_auto_scheduled: Mapped[bool] = mapped_column(Boolean, default=False)

    # Production summary, written by the costing engine on demand.
    expected_output: Mapped[int | None] = mapped_column(Integer, nullable=True)
    scrap_allowance: Mapped[int | None] = mapped_column(Integer, nullable=True)
    material_cost: Mapped[float | None] = mapped_column(Float, nullable=True)
    labour_cost: Mapped[float | None] = mapped_column(Float, nullable=True)
    overhead_cost: Mapped[float | None] = mapped_column(Float, nullable=True)
    total_cost: Mapped[float | None] = mapped_column(Float, nullable=True)
    run_hours: Mapped[float | None] = mapped_column(Float, nullable=True)

    job_sheet: Mapped[JobSheet] = relationship(back_populates="work_orders")
    bom: Mapped[list[BomLine]] = relationship(
        back_populates="work_order", cascade="all, delete-orphan"
    )
    route: Mapped[list[RouteStep]] = relationship(
        back_populates="work_order", cascade="all, delete-orphan", order_by="RouteStep.seq"
    )
    purchase_requests: Mapped[list[PurchaseRequest]] = relationship(
        back_populates="work_order", cascade="all, delete-orphan"
    )
    staff_runs: Mapped[list[StaffRun]] = relationship(
        back_populates="work_order", cascade="all, delete-orphan"
    )

    @property
    def is_locked(self) -> bool:
        return self.status != WorkOrderStatus.draft or self.job_sheet.is_locked


class BomLine(Base):
    __tablename__ = "bom_lines"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    work_order_id: Mapped[str] = mapped_column(ForeignKey("work_orders.id", ondelete="CASCADE"))
    material_code: Mapped[str] = mapped_column(String(32))
    name: Mapped[str] = mapped_column(String(160))
    required_per_unit: Mapped[float] = mapped_column(Float)
    required_qty: Mapped[float] = mapped_column(Float)
    unit: Mapped[str] = mapped_column(String(8))
    on_hand_qty: Mapped[float] = mapped_column(Float)
    unit_cost: Mapped[float] = mapped_column(Float)
    ai_assigned: Mapped[bool] = mapped_column(Boolean, default=False)

    work_order: Mapped[WorkOrder] = relationship(back_populates="bom")


class RouteStep(Base):
    __tablename__ = "route_steps"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    work_order_id: Mapped[str] = mapped_column(ForeignKey("work_orders.id", ondelete="CASCADE"))
    seq: Mapped[int] = mapped_column(Integer)
    operation: Mapped[str] = mapped_column(String(120))
    work_centre: Mapped[str] = mapped_column(String(64))
    machine: Mapped[str] = mapped_column(String(64))
    setup_min: Mapped[int] = mapped_column(Integer, default=0)
    cycle_sec_per_unit: Mapped[float] = mapped_column(Float, default=0)
    ai_assigned: Mapped[bool] = mapped_column(Boolean, default=False)

    work_order: Mapped[WorkOrder] = relationship(back_populates="route")


class PurchaseRequest(Base):
    __tablename__ = "purchase_requests"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    work_order_id: Mapped[str] = mapped_column(ForeignKey("work_orders.id", ondelete="CASCADE"))
    material_code: Mapped[str] = mapped_column(String(32))
    shortfall_qty: Mapped[float] = mapped_column(Float)
    unit: Mapped[str] = mapped_column(String(8))
    raised_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    manager_alerted: Mapped[bool] = mapped_column(Boolean, default=False)

    work_order: Mapped[WorkOrder] = relationship(back_populates="purchase_requests")


class StaffRun(Base):
    """One operator's turn on a work order: the WIP record from the shop floor terminal."""

    __tablename__ = "staff_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    work_order_id: Mapped[str] = mapped_column(
        ForeignKey("work_orders.id", ondelete="CASCADE"), index=True
    )
    operator_id: Mapped[str] = mapped_column(String(16))
    operator_name: Mapped[str] = mapped_column(String(80))
    shift: Mapped[str] = mapped_column(String(1))
    operation: Mapped[str] = mapped_column(String(120))
    machine: Mapped[str] = mapped_column(String(64))
    started_at: Mapped[datetime] = mapped_column(DateTime)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    status: Mapped[StaffRunStatus] = mapped_column(Enum(StaffRunStatus, name="staff_run_status"))
    qty_done: Mapped[int] = mapped_column(Integer, default=0)
    qty_rosak: Mapped[int] = mapped_column(Integer, default=0)
    qty_waste: Mapped[int] = mapped_column(Integer, default=0)
    downtime_min: Mapped[int] = mapped_column(Integer, default=0)
    downtime_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    supervisor_called: Mapped[bool] = mapped_column(Boolean, default=False)

    work_order: Mapped[WorkOrder] = relationship(back_populates="staff_runs")

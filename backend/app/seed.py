"""
Seeds the material master and a small slice of the flow so the API returns
something on first boot. Run with `python -m app.seed` (compose does this for you).

The React build does not depend on this: it runs off frontend/src/data/seed.ts.
"""

from datetime import date, datetime

from sqlalchemy import select

from app import models
from app.database import Base, SessionLocal, engine

MATERIALS = [
    ("RM-SS304-12", "Stainless 304 bar, 12mm", "m", 1840, 14.6),
    ("RM-AL6061-40", "Aluminium 6061 plate, 40mm", "kg", 612, 23.15),
    ("RM-MS-CR2", "Cold rolled mild steel coil, 2.0mm", "kg", 4270, 5.82),
    ("CP-BRG-6204", "Deep groove bearing 6204-2RS", "pcs", 930, 8.4),
    ("CP-SEAL-N70", "Nitrile seal ring N70, 32mm", "pcs", 2160, 1.35),
    ("CN-M8x25", "Hex bolt M8 x 25, zinc", "pcs", 12400, 0.42),
    ("CN-WSH-M8", "Spring washer M8", "pcs", 9800, 0.11),
    ("CS-PWD-RAL7016", "Powder coat RAL 7016 anthracite", "kg", 74, 41.9),
    ("CS-WIRE-G3Si", "MIG wire G3Si1, 1.0mm", "kg", 188, 18.7),
]


def run() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if db.scalar(select(models.Material).limit(1)) is not None:
            print("Seed data already present, nothing to do.")
            return

        for code, name, unit, on_hand, cost in MATERIALS:
            db.add(
                models.Material(
                    code=code, name=name, unit=unit, on_hand_qty=on_hand, unit_cost=cost
                )
            )

        draft = models.JobSheet(
            id="js-1",
            code="JS-2608-0141",
            source=models.DemandSource.sales_order,
            reference="SO-88274",
            customer="Kenyalang Autoparts Sdn Bhd",
            created_by="Amirah Kamal",
            created_at=datetime(2026, 8, 21, 9, 2),
            due_date=date(2026, 9, 8),
            status=models.JobSheetStatus.draft,
        )
        draft.goals = [
            models.JobSheetGoal(
                id="g-1a",
                product_code="FG-BRKT-220",
                product_name="Mounting bracket, anthracite",
                target_qty=2400,
                unit="pcs",
            ),
            models.JobSheetGoal(
                id="g-1b",
                product_code="FG-HUB-A19",
                product_name="Idler hub assembly",
                target_qty=640,
                unit="pcs",
            ),
        ]
        db.add(draft)

        live = models.JobSheet(
            id="js-4",
            code="JS-2608-0136",
            source=models.DemandSource.sales_order,
            reference="SO-88041",
            customer="Nordvale Marine Systems",
            created_by="Ridzuan Hashim",
            created_at=datetime(2026, 8, 17, 9, 55),
            due_date=date(2026, 8, 30),
            status=models.JobSheetStatus.in_progress,
            approved_by="Ridzuan Hashim",
        )
        live.goals = [
            models.JobSheetGoal(
                id="g-4a",
                product_code="FG-SHAFT-N4",
                product_name="Pump shaft, 304 stainless",
                target_qty=1250,
                unit="pcs",
            )
        ]
        db.add(live)
        db.flush()

        wo = models.WorkOrder(
            id="wo-5",
            code="WO-2608-0351",
            job_sheet_id=live.id,
            goal_id="g-4a",
            qty=1250,
            unit="pcs",
            mode=models.BuildMode.manual,
            status=models.WorkOrderStatus.running,
            feasibility=models.Feasibility.ok,
            notes="",
            created_at=datetime(2026, 8, 17, 10, 5),
            confirmed_at=datetime(2026, 8, 18, 8, 44),
            slot_machine="CNC-04 / Okuma LB3000",
            slot_starts_at=datetime(2026, 8, 24, 7, 0),
            slot_ends_at=datetime(2026, 8, 25, 18, 40),
            slot_auto_scheduled=False,
        )
        wo.bom = [
            models.BomLine(
                id="b-11",
                material_code="RM-SS304-12",
                name="Stainless 304 bar, 12mm",
                required_per_unit=0.34,
                required_qty=425,
                unit="m",
                on_hand_qty=1840,
                unit_cost=14.6,
            )
        ]
        wo.route = [
            models.RouteStep(
                id="r-11",
                seq=1,
                operation="Turn shaft",
                work_centre="Machining",
                machine="CNC-04 / Okuma LB3000",
                setup_min=80,
                cycle_sec_per_unit=118,
            )
        ]
        wo.staff_runs = [
            models.StaffRun(
                id="sr-1",
                operator_id="OP-2214",
                operator_name="Faizal Rahim",
                shift="A",
                operation="Turn shaft",
                machine="CNC-04 / Okuma LB3000",
                started_at=datetime(2026, 8, 24, 7, 4),
                ended_at=datetime(2026, 8, 24, 15, 2),
                status=models.StaffRunStatus.done,
                qty_done=214,
                qty_rosak=7,
                qty_waste=3,
                downtime_min=26,
                downtime_reason="Tool insert change, unplanned",
            ),
            models.StaffRun(
                id="sr-2",
                operator_id="OP-2287",
                operator_name="Chong Wei Ling",
                shift="B",
                operation="Turn shaft",
                machine="CNC-04 / Okuma LB3000",
                started_at=datetime(2026, 8, 24, 15, 6),
                ended_at=None,
                status=models.StaffRunStatus.running,
                qty_done=118,
                qty_rosak=2,
                qty_waste=1,
                downtime_min=0,
            ),
        ]
        db.add(wo)
        db.commit()
        print("Seeded materials, 2 job sheets, 1 work order, 2 staff runs.")
    finally:
        db.close()


if __name__ == "__main__":
    run()
